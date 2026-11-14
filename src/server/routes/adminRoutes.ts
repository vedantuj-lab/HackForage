import { Router } from 'express';
import { db } from '../../db/index.ts';
import {
  auditLogs,
  compatibilityScores,
  eventSettings,
  invitations,
  profiles,
  skills,
  teamHealth,
  teamMembers,
  teams,
  userSkills,
  users,
  waitlistEntries,
} from '../../db/schema.ts';
import { and, desc, eq, inArray, notLike } from 'drizzle-orm';
import { AuthRequest, requireAuth, requireRole } from '../auth.ts';
import { getOrResetConcurrencyLabTeam, runLive50UserConcurrencyTest } from '../engines/concurrencyLab.ts';
import { logAudit } from '../services/auditAndNotify.ts';
import { recalculateAndPersistTeamHealth } from '../engines/teamHealth.ts';
import { sanitizeFullName } from '../services/profileCompletion.ts';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/dashboard', async (_req, res) => {
  try {
    const allUsers = await db
      .select({ id: users.id, role: users.role, status: users.status, email: users.email })
      .from(users)
      .where(notLike(users.email, '%@hackforge.test'));

    const realParticipants = allUsers.filter((u) => u.role !== 'ADMIN');
    const allTeams = await db.select().from(teams).where(eq(teams.isTestTeam, false));
    const activeTeams = allTeams.filter((t) => t.status === 'ACTIVE');

    const activeTeamIds = activeTeams.map((t) => t.id);
    const members =
      activeTeamIds.length > 0
        ? await db.select().from(teamMembers).where(inArray(teamMembers.teamId, activeTeamIds))
        : [];

    const assignedSet = new Set(members.map((m) => m.userId));
    const unassignedParticipants = realParticipants.filter((u) => !assignedSet.has(u.id)).length;

    const memberCountByTeam = new Map<string, number>();
    for (const m of members) {
      memberCountByTeam.set(m.teamId, (memberCountByTeam.get(m.teamId) || 0) + 1);
    }

    let totalCapacity = 0;
    let fullTeams = 0;
    for (const t of activeTeams) {
      totalCapacity += t.maxCapacity;
      if ((memberCountByTeam.get(t.id) || 0) >= t.maxCapacity) fullTeams++;
    }

    const healthRows =
      activeTeamIds.length > 0
        ? await db.select().from(teamHealth).where(inArray(teamHealth.teamId, activeTeamIds))
        : [];
    const avgTeamHealth =
      healthRows.length > 0
        ? Number((healthRows.reduce((acc, h) => acc + h.overallScore, 0) / healthRows.length).toFixed(1))
        : 0;

    const compatRows = await db.select({ score: compatibilityScores.overallScore }).from(compatibilityScores);
    const avgCompatibility =
      compatRows.length > 0
        ? Number((compatRows.reduce((acc, c) => acc + c.score, 0) / compatRows.length).toFixed(1))
        : 0;

    const capacityUtilization =
      totalCapacity > 0 ? Number(((members.length / totalCapacity) * 100).toFixed(1)) : 0;

    return res.json({
      metrics: {
        totalParticipants: realParticipants.length,
        totalTeams: allTeams.length,
        activeTeams: activeTeams.length,
        unassignedParticipants,
        fullTeams,
        avgTeamHealth,
        avgCompatibility,
        capacityUtilization,
        totalSeatsOccupied: members.length,
        totalSeatsAvailable: totalCapacity,
      },
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    return res.status(500).json({ error: 'Failed to load admin overview.' });
  }
});

router.get('/fairness', async (_req, res) => {
  try {
    const allWaitlists = await db
      .select({
        status: waitlistEntries.status,
        teamName: teams.name,
        compatibilityScore: waitlistEntries.compatibilityScore,
      })
      .from(waitlistEntries)
      .innerJoin(teams, eq(waitlistEntries.teamId, teams.id));

    const waitlistByStatus: Record<string, number> = {};
    for (const w of allWaitlists) {
      waitlistByStatus[w.status] = (waitlistByStatus[w.status] || 0) + 1;
    }

    const allInvitations = await db.select().from(invitations);
    const totalInv = allInvitations.length;
    const acceptedInv = allInvitations.filter((i) => i.status === 'ACCEPTED').length;
    const declinedInv = allInvitations.filter((i) => i.status === 'DECLINED').length;
    const acceptanceRate = totalInv > 0 ? Number(((acceptedInv / totalInv) * 100).toFixed(1)) : 0;

    // Repeated rejection patterns by user
    const declineCounts = new Map<string, number>();
    for (const inv of allInvitations) {
      if (inv.status === 'DECLINED') {
        declineCounts.set(inv.userId, (declineCounts.get(inv.userId) || 0) + 1);
      }
    }

    // Skill distribution across participants
    const skillRows = await db
      .select({ name: skills.name, category: skills.category })
      .from(userSkills)
      .innerJoin(skills, eq(userSkills.skillId, skills.id))
      .innerJoin(users, eq(userSkills.userId, users.id))
      .where(notLike(users.email, '%@hackforge.test'));

    const skillCatCount = new Map<string, number>();
    for (const s of skillRows) {
      skillCatCount.set(s.category, (skillCatCount.get(s.category) || 0) + 1);
    }

    // Compatibility score distribution buckets
    const compatRows = await db.select({ score: compatibilityScores.overallScore }).from(compatibilityScores);
    const buckets = [
      { range: '0-39%', count: 0 },
      { range: '40-59%', count: 0 },
      { range: '60-79%', count: 0 },
      { range: '80-100%', count: 0 },
    ];
    for (const c of compatRows) {
      if (c.score < 40) buckets[0].count++;
      else if (c.score < 60) buckets[1].count++;
      else if (c.score < 80) buckets[2].count++;
      else buckets[3].count++;
    }

    // Unassigned participants by preferred role
    const allParticipants = await db
      .select({ id: users.id, preferredRole: profiles.preferredRole })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(and(eq(users.role, 'PARTICIPANT'), notLike(users.email, '%@hackforge.test')));
    const assigned = await db.select({ userId: teamMembers.userId }).from(teamMembers);
    const assignedSet = new Set(assigned.map((a) => a.userId));
    const unassignedRoleCounts = new Map<string, number>();
    for (const p of allParticipants) {
      if (!assignedSet.has(p.id)) {
        const r = p.preferredRole || 'Unset';
        unassignedRoleCounts.set(r, (unassignedRoleCounts.get(r) || 0) + 1);
      }
    }

    // Recent membership allocation history
    const allocations = await db
      .select()
      .from(auditLogs)
      .where(
        inArray(auditLogs.action, [
          'TEAM_MEMBER_JOINED',
          'WAITLIST_ACCEPTED',
          'INVITATION_ACCEPTED',
          'JOIN_REQUEST_APPROVED',
        ])
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(20);

    return res.json({
      fairness: {
        waitlistDistribution: Object.entries(waitlistByStatus).map(([status, count]) => ({ status, count })),
        invitationStats: {
          total: totalInv,
          accepted: acceptedInv,
          declined: declinedInv,
          pending: allInvitations.filter((i) => i.status === 'PENDING').length,
          acceptanceRate,
        },
        repeatedRejectionsCount: Array.from(declineCounts.values()).filter((v) => v >= 2).length,
        skillDistribution: Array.from(skillCatCount.entries()).map(([category, count]) => ({ category, count })),
        compatibilityDistribution: buckets,
        unassignedByRole: Array.from(unassignedRoleCounts.entries()).map(([role, count]) => ({ role, count })),
        recentAllocations: allocations,
      },
    });
  } catch (err) {
    console.error('Fairness analytics error:', err);
    return res.status(500).json({ error: 'Failed to load fairness analytics.' });
  }
});

router.get('/analytics', async (_req, res) => {
  try {
    const activeTeams = await db
      .select({
        id: teams.id,
        name: teams.name,
        category: teams.category,
        maxCapacity: teams.maxCapacity,
      })
      .from(teams)
      .where(and(eq(teams.status, 'ACTIVE'), eq(teams.isTestTeam, false)));

    const healthRows = await db.select().from(teamHealth);
    const healthMap = new Map(healthRows.map((h) => [h.teamId, h]));

    const members = await db.select({ teamId: teamMembers.teamId }).from(teamMembers);
    const countMap = new Map<string, number>();
    for (const m of members) {
      countMap.set(m.teamId, (countMap.get(m.teamId) || 0) + 1);
    }

    return res.json({
      teamsAnalytics: activeTeams.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        memberCount: countMap.get(t.id) || 0,
        maxCapacity: t.maxCapacity,
        health: healthMap.get(t.id) || null,
      })),
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return res.status(500).json({ error: 'Failed to load analytics.' });
  }
});

router.get('/participants', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        status: users.status,
        institution: users.institution,
        location: users.location,
        createdAt: users.createdAt,
        bio: profiles.bio,
        preferredRole: profiles.preferredRole,
        experienceLevel: profiles.experienceLevel,
        collaborationMode: profiles.collaborationMode,
        projectInterests: profiles.projectInterests,
        completionPct: profiles.completionPct,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(notLike(users.email, '%@hackforge.test'))
      .orderBy(desc(users.createdAt));

    const userIds = rows.map((r) => r.id);
    const skillMap = new Map<string, string[]>();
    const teamMap = new Map<string, { teamId: string; teamName: string; teamRole: string }>();

    if (userIds.length > 0) {
      const sRows = await db
        .select({ userId: userSkills.userId, name: skills.name })
        .from(userSkills)
        .innerJoin(skills, eq(userSkills.skillId, skills.id))
        .where(inArray(userSkills.userId, userIds));
      for (const s of sRows) {
        const list = skillMap.get(s.userId) || [];
        list.push(s.name);
        skillMap.set(s.userId, list);
      }

      const mRows = await db
        .select({
          userId: teamMembers.userId,
          teamId: teams.id,
          teamName: teams.name,
          teamRole: teamMembers.teamRole,
        })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .where(and(inArray(teamMembers.userId, userIds), eq(teams.status, 'ACTIVE'), eq(teams.isTestTeam, false)));
      for (const m of mRows) {
        teamMap.set(m.userId, { teamId: m.teamId, teamName: m.teamName, teamRole: m.teamRole });
      }
    }

    return res.json({
      participants: rows.map((r) => ({
        ...r,
        fullName: sanitizeFullName(r.fullName, r.email),
        skills: skillMap.get(r.id) || [],
        currentTeam: teamMap.get(r.id) || null,
      })),
    });
  } catch (err) {
    console.error('Admin participants error:', err);
    return res.status(500).json({ error: 'Failed to load participants.' });
  }
});

router.patch('/participants/:id/status', async (req: AuthRequest, res) => {
  try {
    const targetId = String(req.params.id);
    const { status } = req.body as { status?: 'ACTIVE' | 'SUSPENDED' };
    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      return res.status(400).json({ error: 'Status must be ACTIVE or SUSPENDED.' });
    }
    if (targetId === req.authUser!.id) {
      return res.status(400).json({ error: 'Administrators cannot suspend their own account.' });
    }

    const [updated] = await db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, targetId))
      .returning({ id: users.id, email: users.email, status: users.status });

    await logAudit({
      actorId: req.authUser!.id,
      action: status === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_ACTIVATED',
      entityType: 'USER',
      entityId: targetId,
      metadata: { status },
    });

    return res.json({ participant: updated });
  } catch (err) {
    console.error('Update status error:', err);
    return res.status(500).json({ error: 'Failed to update account status.' });
  }
});

router.get('/teams', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(teams)
      .where(eq(teams.isTestTeam, false))
      .orderBy(desc(teams.createdAt));
    const healthRows = await db.select().from(teamHealth);
    const healthMap = new Map(healthRows.map((h) => [h.teamId, h]));
    const members = await db.select({ teamId: teamMembers.teamId }).from(teamMembers);
    const countMap = new Map<string, number>();
    for (const m of members) countMap.set(m.teamId, (countMap.get(m.teamId) || 0) + 1);

    return res.json({
      teams: rows.map((t) => ({
        ...t,
        memberCount: countMap.get(t.id) || 0,
        health: healthMap.get(t.id) || null,
      })),
    });
  } catch (err) {
    console.error('Admin teams error:', err);
    return res.status(500).json({ error: 'Failed to load teams.' });
  }
});

router.get('/waitlists', async (_req, res) => {
  try {
    const rows = await db
      .select({
        entry: waitlistEntries,
        teamName: teams.name,
        userName: users.fullName,
        userEmail: users.email,
      })
      .from(waitlistEntries)
      .innerJoin(teams, eq(waitlistEntries.teamId, teams.id))
      .innerJoin(users, eq(waitlistEntries.userId, users.id))
      .orderBy(desc(waitlistEntries.createdAt))
      .limit(100);

    return res.json({
      waitlists: rows.map((r) => ({
        ...r.entry,
        teamName: r.teamName,
        userName: sanitizeFullName(r.userName, r.userEmail),
        userEmail: r.userEmail,
      })),
    });
  } catch (err) {
    console.error('Admin waitlists error:', err);
    return res.status(500).json({ error: 'Failed to load waitlist entries.' });
  }
});

router.get('/audit-logs', async (_req, res) => {
  try {
    const rows = await db
      .select({
        log: auditLogs,
        actorName: users.fullName,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);

    return res.json({
      logs: rows.map((r) => ({
        ...r.log,
        actorName: r.actorName || 'System',
        actorEmail: r.actorEmail || 'system@hackforge',
      })),
    });
  } catch (err) {
    console.error('Audit logs error:', err);
    return res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

router.get('/settings', async (_req, res) => {
  const [settings] = await db.select().from(eventSettings).limit(1);
  return res.json({ settings });
});

router.put('/settings', async (req: AuthRequest, res) => {
  try {
    const {
      eventName,
      maxTeamCapacity,
      waitlistExpiryMinutes,
      allowTeamCreation,
      autoWaitlistPromotion,
      healthWeights,
      compatibilityWeights,
    } = req.body as any;

    const [current] = await db.select().from(eventSettings).limit(1);
    if (!current) {
      const [created] = await db
        .insert(eventSettings)
        .values({
          eventName: eventName || 'HackForge Global 2026',
          maxTeamCapacity: Number(maxTeamCapacity) || 5,
          waitlistExpiryMinutes: Number(waitlistExpiryMinutes) || 60,
          allowTeamCreation: allowTeamCreation ?? true,
          autoWaitlistPromotion: autoWaitlistPromotion ?? true,
        })
        .returning();
      return res.json({ settings: created });
    }

    const [updated] = await db
      .update(eventSettings)
      .set({
        ...(eventName ? { eventName } : {}),
        ...(maxTeamCapacity !== undefined ? { maxTeamCapacity: Math.max(2, Math.min(10, Number(maxTeamCapacity))) } : {}),
        ...(waitlistExpiryMinutes !== undefined
          ? { waitlistExpiryMinutes: Math.max(5, Number(waitlistExpiryMinutes)) }
          : {}),
        ...(allowTeamCreation !== undefined ? { allowTeamCreation: Boolean(allowTeamCreation) } : {}),
        ...(autoWaitlistPromotion !== undefined ? { autoWaitlistPromotion: Boolean(autoWaitlistPromotion) } : {}),
        ...(healthWeights ? { healthWeights } : {}),
        ...(compatibilityWeights ? { compatibilityWeights } : {}),
        updatedAt: new Date(),
      })
      .where(eq(eventSettings.id, current.id))
      .returning();

    // Recalculate team health across active teams if weights changed
    if (healthWeights) {
      const activeTeams = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.status, 'ACTIVE'), eq(teams.isTestTeam, false)));
      for (const t of activeTeams) {
        await recalculateAndPersistTeamHealth(t.id);
      }
    }

    await logAudit({
      actorId: req.authUser!.id,
      action: 'EVENT_SETTINGS_UPDATED',
      entityType: 'SETTINGS',
      entityId: updated.id,
    });

    return res.json({ settings: updated });
  } catch (err) {
    console.error('Update settings error:', err);
    return res.status(500).json({ error: 'Failed to update event settings.' });
  }
});

// CONCURRENCY LAB ENDPOINTS
router.get('/concurrency-test/state', async (req: AuthRequest, res) => {
  try {
    const { testTeam, seatedBots } = await getOrResetConcurrencyLabTeam(req.authUser!.id);
    return res.json({
      teamId: testTeam.id,
      teamName: testTeam.name,
      maxCapacity: testTeam.maxCapacity,
      currentMembers: seatedBots.length,
      availableSeats: Math.max(0, testTeam.maxCapacity - seatedBots.length),
      simulatedContenders: 50,
    });
  } catch (err) {
    console.error('Concurrency lab state error:', err);
    return res.status(500).json({ error: 'Failed to initialize Concurrency Lab team.' });
  }
});

router.post('/concurrency-test', async (req: AuthRequest, res) => {
  try {
    const localPort = req.socket?.localPort || Number(process.env.PORT) || 3000;
    const baseUrl = `http://127.0.0.1:${localPort}`;
    const report = await runLive50UserConcurrencyTest({
      adminUserId: req.authUser!.id,
      baseUrl,
    });
    return res.json({ report });
  } catch (err) {
    console.error('Concurrency test execution error:', err);
    return res.status(500).json({ error: 'Concurrency test execution failed.' });
  }
});

export default router;
