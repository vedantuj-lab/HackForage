import { Router } from 'express';
import { db } from '../../db/index.ts';
import {
  auditLogs,
  eventSettings,
  leadershipHistory,
  profiles,
  skills,
  teamHealth,
  teamMembers,
  teamRequirements,
  teams,
  userSkills,
  users,
  waitlistEntries,
} from '../../db/schema.ts';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { AuthRequest, optionalAuth, requireAuth } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { joinTeamAtomic, leaveTeamAtomic } from '../engines/raceProof.ts';
import { recalculateAndPersistTeamHealth } from '../engines/teamHealth.ts';
import { calculateAndPersistCompatibility, recalculateCompatibilityForTeam } from '../engines/compatibility.ts';
import { assignSecondaryLeader, transferPrimaryLeadership } from '../engines/leadership.ts';
import { createNotification, logAudit } from '../services/auditAndNotify.ts';
import { sanitizeFullName } from '../services/profileCompletion.ts';

const router = Router();

function handleError(res: any, err: unknown, fallback: string) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code, details: err.details });
  }
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

async function getTeamDetailsPayload(teamId: string, viewerId?: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) return null;

  const members = await db
    .select({
      id: teamMembers.id,
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      institution: users.institution,
      teamRole: teamMembers.teamRole,
      isLeader: teamMembers.isLeader,
      joinedAt: teamMembers.joinedAt,
      experienceLevel: profiles.experienceLevel,
      preferredRole: profiles.preferredRole,
      avatarUrl: profiles.avatarUrl,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(teamMembers.joinedAt));

  const memberIds = members.map((m) => m.userId);
  const memberSkillMap = new Map<string, string[]>();
  if (memberIds.length > 0) {
    const sRows = await db
      .select({ userId: userSkills.userId, name: skills.name })
      .from(userSkills)
      .innerJoin(skills, eq(userSkills.skillId, skills.id))
      .where(inArray(userSkills.userId, memberIds));
    for (const sr of sRows) {
      const arr = memberSkillMap.get(sr.userId) || [];
      arr.push(sr.name);
      memberSkillMap.set(sr.userId, arr);
    }
  }

  const [reqs] = await db.select().from(teamRequirements).where(eq(teamRequirements.teamId, teamId)).limit(1);
  let [health] = await db.select().from(teamHealth).where(eq(teamHealth.teamId, teamId)).limit(1);
  if (!health) {
    await recalculateAndPersistTeamHealth(teamId);
    [health] = await db.select().from(teamHealth).where(eq(teamHealth.teamId, teamId)).limit(1);
  }

  const [{ wlCount }] = await db
    .select({ wlCount: count() })
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.teamId, teamId), inArray(waitlistEntries.status, ['WAITING', 'INVITED'])));

  let compatibility = null;
  if (viewerId) {
    compatibility = await calculateAndPersistCompatibility(viewerId, teamId);
  }

  return {
    ...team,
    memberCount: members.length,
    availableSeats: Math.max(0, team.maxCapacity - members.length),
    waitlistCount: Number(wlCount),
    requirements: reqs ?? { requiredSkills: [], requiredRoles: [], minExperience: team.experienceRequirement },
    health: health ?? null,
    compatibility,
    members: members.map((m) => ({
      ...m,
      fullName: sanitizeFullName(m.fullName, m.email),
      skills: memberSkillMap.get(m.userId) || [],
    })),
  };
}

router.get('/teams', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { search, category, skill, availableOnly, experience, includeTest } = req.query as {
      search?: string;
      category?: string;
      skill?: string;
      availableOnly?: string;
      experience?: string;
      includeTest?: string;
    };

    const teamRows = await db
      .select()
      .from(teams)
      .where(
        includeTest === 'true'
          ? eq(teams.status, 'ACTIVE')
          : and(eq(teams.status, 'ACTIVE'), eq(teams.isTestTeam, false))
      )
      .orderBy(desc(teams.createdAt));

    if (teamRows.length === 0) return res.json({ teams: [] });

    const teamIds = teamRows.map((t) => t.id);
    const allMembers = await db
      .select({
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        teamRole: teamMembers.teamRole,
        fullName: users.fullName,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(inArray(teamMembers.teamId, teamIds));

    const allReqs = await db.select().from(teamRequirements).where(inArray(teamRequirements.teamId, teamIds));
    const allHealth = await db.select().from(teamHealth).where(inArray(teamHealth.teamId, teamIds));

    const reqMap = new Map(allReqs.map((r) => [r.teamId, r]));
    const healthMap = new Map(allHealth.map((h) => [h.teamId, h]));

    const memberMap = new Map<string, typeof allMembers>();
    for (const m of allMembers) {
      const list = memberMap.get(m.teamId) || [];
      list.push(m);
      memberMap.set(m.teamId, list);
    }

    const viewerId = req.authUser?.id;

    let enriched = await Promise.all(
      teamRows.map(async (t) => {
        const mems = memberMap.get(t.id) || [];
        const reqs = reqMap.get(t.id);
        const health = healthMap.get(t.id) || null;
        const leader = mems.find((m) => m.userId === t.primaryLeaderId);
        const compat = viewerId ? await calculateAndPersistCompatibility(viewerId, t.id) : null;
        return {
          ...t,
          leaderName: leader?.fullName ? sanitizeFullName(leader.fullName) : 'Team Leader',
          memberCount: mems.length,
          availableSeats: Math.max(0, t.maxCapacity - mems.length),
          isViewerMember: viewerId ? mems.some((m) => m.userId === viewerId) : false,
          requiredSkills: reqs?.requiredSkills ?? [],
          requiredRoles: reqs?.requiredRoles ?? [],
          health,
          compatibility: compat,
        };
      })
    );

    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      enriched = enriched.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.requiredSkills.some((s) => s.toLowerCase().includes(q))
      );
    }
    if (category && category !== 'ALL') {
      enriched = enriched.filter((t) => t.category === category);
    }
    if (experience && experience !== 'ALL') {
      enriched = enriched.filter((t) => t.experienceRequirement === experience);
    }
    if (skill && skill !== 'ALL') {
      enriched = enriched.filter((t) =>
        t.requiredSkills.some((s) => s.toLowerCase() === skill.toLowerCase())
      );
    }
    if (availableOnly === 'true') {
      enriched = enriched.filter((t) => t.availableSeats > 0);
    }

    return res.json({ teams: enriched });
  } catch (err) {
    return handleError(res, err, 'Failed to list teams.');
  }
});

router.post('/teams', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const {
      name,
      description,
      category,
      maxCapacity,
      requiredSkills,
      requiredRoles,
      experienceRequirement,
      collaborationMode,
      visibility,
      leaderRole,
    } = req.body as {
      name?: string;
      description?: string;
      category?: string;
      maxCapacity?: number;
      requiredSkills?: string[];
      requiredRoles?: string[];
      experienceRequirement?: string;
      collaborationMode?: string;
      visibility?: string;
      leaderRole?: string;
    };

    if (!name?.trim() || !description?.trim() || !category?.trim()) {
      return res.status(400).json({ error: 'Team name, description, and project category are required.' });
    }

    const [settings] = await db.select().from(eventSettings).limit(1);
    if (settings && !settings.allowTeamCreation && req.authUser!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Team creation is currently paused by the event administrator.' });
    }

    const capLimit = settings?.maxTeamCapacity ?? 6;
    const parsedCap = Math.min(capLimit, Math.max(2, Number(maxCapacity) || 5));

    const [prof] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);

    const createdTeam = await db.transaction(async (tx) => {
      const [team] = await tx
        .insert(teams)
        .values({
          name: name.trim(),
          description: description.trim(),
          category: category.trim(),
          maxCapacity: parsedCap,
          experienceRequirement: experienceRequirement || 'Intermediate',
          collaborationMode: collaborationMode || 'Hybrid',
          visibility: visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
          primaryLeaderId: userId,
          status: 'ACTIVE',
        })
        .returning();

      await tx.insert(teamRequirements).values({
        teamId: team.id,
        requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : [],
        requiredRoles: Array.isArray(requiredRoles) ? requiredRoles : ['Full-Stack Developer', 'UI/UX Designer'],
        minExperience: experienceRequirement || 'Intermediate',
      });

      await tx.insert(teamMembers).values({
        teamId: team.id,
        userId,
        teamRole: leaderRole || prof?.preferredRole || 'Full-Stack Developer',
        isLeader: true,
      });

      if (req.authUser!.role === 'PARTICIPANT') {
        await tx.update(users).set({ role: 'TEAM_LEADER', updatedAt: new Date() }).where(eq(users.id, userId));
      }

      await tx.insert(leadershipHistory).values({
        teamId: team.id,
        previousLeaderId: null,
        newLeaderId: userId,
        action: 'ASSIGN_PRIMARY',
        reason: 'Created team and became Primary Leader.',
        actorId: userId,
      });

      await tx.insert(auditLogs).values({
        actorId: userId,
        action: 'TEAM_CREATED',
        entityType: 'TEAM',
        entityId: team.id,
        metadata: { name: team.name, maxCapacity: parsedCap },
      });

      return team;
    });

    await recalculateAndPersistTeamHealth(createdTeam.id);
    await recalculateCompatibilityForTeam(createdTeam.id);

    const details = await getTeamDetailsPayload(createdTeam.id, userId);
    return res.status(201).json({ team: details });
  } catch (err) {
    return handleError(res, err, 'Failed to create team.');
  }
});

router.get('/teams/:id', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const details = await getTeamDetailsPayload(String(req.params.id), req.authUser?.id);
    if (!details) return res.status(404).json({ error: 'Team not found.' });
    return res.json({ team: details });
  } catch (err) {
    return handleError(res, err, 'Failed to load team details.');
  }
});

router.put('/teams/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = String(req.params.id);
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    const isLeader =
      team.primaryLeaderId === req.authUser!.id || team.secondaryLeaderId === req.authUser!.id;
    if (!isLeader && req.authUser!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only team leaders or admins can update team details.' });
    }

    const {
      name,
      description,
      category,
      maxCapacity,
      experienceRequirement,
      collaborationMode,
      visibility,
      requiredSkills,
      requiredRoles,
    } = req.body as {
      name?: string;
      description?: string;
      category?: string;
      maxCapacity?: number;
      experienceRequirement?: string;
      collaborationMode?: string;
      visibility?: string;
      requiredSkills?: string[];
      requiredRoles?: string[];
    };

    const [{ cnt }] = await db.select({ cnt: count() }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
    if (maxCapacity !== undefined && Number(maxCapacity) < Number(cnt)) {
      return res.status(400).json({
        error: `Cannot reduce capacity below current member count (${cnt}).`,
      });
    }

    await db
      .update(teams)
      .set({
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(description?.trim() ? { description: description.trim() } : {}),
        ...(category?.trim() ? { category: category.trim() } : {}),
        ...(maxCapacity !== undefined ? { maxCapacity: Math.max(2, Math.min(10, Number(maxCapacity))) } : {}),
        ...(experienceRequirement ? { experienceRequirement } : {}),
        ...(collaborationMode ? { collaborationMode } : {}),
        ...(visibility ? { visibility } : {}),
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId));

    if (requiredSkills || requiredRoles || experienceRequirement) {
      const [existingReq] = await db
        .select()
        .from(teamRequirements)
        .where(eq(teamRequirements.teamId, teamId))
        .limit(1);
      await db
        .insert(teamRequirements)
        .values({
          teamId,
          requiredSkills: requiredSkills ?? existingReq?.requiredSkills ?? [],
          requiredRoles: requiredRoles ?? existingReq?.requiredRoles ?? [],
          minExperience: experienceRequirement ?? existingReq?.minExperience ?? team.experienceRequirement,
        })
        .onConflictDoUpdate({
          target: teamRequirements.teamId,
          set: {
            requiredSkills: requiredSkills ?? existingReq?.requiredSkills ?? [],
            requiredRoles: requiredRoles ?? existingReq?.requiredRoles ?? [],
            minExperience: experienceRequirement ?? existingReq?.minExperience ?? team.experienceRequirement,
            updatedAt: new Date(),
          },
        });
    }

    await recalculateAndPersistTeamHealth(teamId);
    await recalculateCompatibilityForTeam(teamId);
    await logAudit({
      actorId: req.authUser!.id,
      action: 'TEAM_UPDATED',
      entityType: 'TEAM',
      entityId: teamId,
    });

    const details = await getTeamDetailsPayload(teamId, req.authUser!.id);
    return res.json({ team: details });
  } catch (err) {
    return handleError(res, err, 'Failed to update team.');
  }
});

router.delete('/teams/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = String(req.params.id);
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    if (team.primaryLeaderId !== req.authUser!.id && req.authUser!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the primary leader or an admin can archive a team.' });
    }

    await db.update(teams).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(eq(teams.id, teamId));
    await logAudit({
      actorId: req.authUser!.id,
      action: 'TEAM_ARCHIVED',
      entityType: 'TEAM',
      entityId: teamId,
    });
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err, 'Failed to archive team.');
  }
});

// RACE-PROOF TEAM JOIN ENDPOINT
router.post('/teams/:id/join', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = String(req.params.id);
    const { requestedRole } = (req.body || {}) as { requestedRole?: string };
    const result = await joinTeamAtomic({
      teamId,
      userId: req.authUser!.id,
      requestedRole,
      actorId: req.authUser!.id,
    });
    return res.json({
      success: true,
      membership: result.membership,
      newMemberCount: result.newMemberCount,
      maxCapacity: result.maxCapacity,
    });
  } catch (err) {
    return handleError(res, err, 'Failed to join team.');
  }
});

router.post('/teams/:id/leave', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = String(req.params.id);
    const result = await leaveTeamAtomic({
      teamId,
      userId: req.authUser!.id,
      actorId: req.authUser!.id,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleError(res, err, 'Failed to leave team.');
  }
});

router.get('/teams/:id/members', requireAuth, async (req, res) => {
  try {
    const details = await getTeamDetailsPayload(String(req.params.id));
    if (!details) return res.status(404).json({ error: 'Team not found.' });
    return res.json({ members: details.members });
  } catch (err) {
    return handleError(res, err, 'Failed to fetch team members.');
  }
});

router.delete('/teams/:id/members/:userId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = String(req.params.id);
    const targetUserId = String(req.params.userId);
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    const isAuthorized =
      team.primaryLeaderId === req.authUser!.id ||
      team.secondaryLeaderId === req.authUser!.id ||
      req.authUser!.role === 'ADMIN' ||
      targetUserId === req.authUser!.id;

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Not authorized to remove this team member.' });
    }

    const result = await leaveTeamAtomic({
      teamId,
      userId: targetUserId,
      actorId: req.authUser!.id,
    });

    if (targetUserId !== req.authUser!.id) {
      await createNotification({
        userId: targetUserId,
        type: 'REMOVED_FROM_TEAM',
        title: `Removed from ${team.name}`,
        message: `Your membership in ${team.name} was updated by team leadership.`,
        entityType: 'TEAM',
        entityId: teamId,
      });
    }

    return res.json({ success: true, ...result });
  } catch (err) {
    return handleError(res, err, 'Failed to remove team member.');
  }
});

router.get('/teams/:id/health', requireAuth, async (req, res) => {
  try {
    const teamId = String(req.params.id);
    const health = await recalculateAndPersistTeamHealth(teamId);
    if (!health) return res.status(404).json({ error: 'Team not found.' });
    return res.json({ health });
  } catch (err) {
    return handleError(res, err, 'Failed to calculate team health.');
  }
});

router.post('/teams/:id/health/recalculate', requireAuth, async (req, res) => {
  try {
    const health = await recalculateAndPersistTeamHealth(String(req.params.id));
    if (!health) return res.status(404).json({ error: 'Team not found.' });
    return res.json({ health });
  } catch (err) {
    return handleError(res, err, 'Failed to recalculate team health.');
  }
});

router.post('/teams/:id/leadership/secondary', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { targetUserId } = req.body as { targetUserId?: string };
    if (!targetUserId) return res.status(400).json({ error: 'targetUserId is required.' });
    const team = await assignSecondaryLeader({
      teamId: String(req.params.id),
      targetUserId,
      actorId: req.authUser!.id,
      isAdmin: req.authUser!.role === 'ADMIN',
    });
    return res.json({ team });
  } catch (err) {
    return handleError(res, err, 'Failed to assign secondary leader.');
  }
});

router.post('/teams/:id/leadership/transfer', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { newLeaderId, reason } = req.body as { newLeaderId?: string; reason?: string };
    if (!newLeaderId) return res.status(400).json({ error: 'newLeaderId is required.' });
    const team = await transferPrimaryLeadership({
      teamId: String(req.params.id),
      newLeaderId,
      actorId: req.authUser!.id,
      reason,
      isAdmin: req.authUser!.role === 'ADMIN',
    });
    return res.json({ team });
  } catch (err) {
    return handleError(res, err, 'Failed to transfer primary leadership.');
  }
});

router.get('/teams/:id/leadership/history', requireAuth, async (req, res) => {
  try {
    const teamId = String(req.params.id);
    const rows = await db
      .select({
        id: leadershipHistory.id,
        teamId: leadershipHistory.teamId,
        previousLeaderId: leadershipHistory.previousLeaderId,
        newLeaderId: leadershipHistory.newLeaderId,
        action: leadershipHistory.action,
        reason: leadershipHistory.reason,
        actorId: leadershipHistory.actorId,
        createdAt: leadershipHistory.createdAt,
      })
      .from(leadershipHistory)
      .where(eq(leadershipHistory.teamId, teamId))
      .orderBy(desc(leadershipHistory.createdAt));

    const userIds = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.previousLeaderId, r.newLeaderId, r.actorId])
          .filter((x): x is string => Boolean(x))
      )
    );
    const uRows =
      userIds.length > 0
        ? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, userIds))
        : [];
    const nameMap = new Map(uRows.map((u) => [u.id, u.fullName]));

    return res.json({
      history: rows.map((r) => ({
        ...r,
        previousLeaderName: r.previousLeaderId
          ? sanitizeFullName(nameMap.get(r.previousLeaderId) || 'Previous Leader')
          : null,
        newLeaderName: sanitizeFullName(nameMap.get(r.newLeaderId) || 'Leader'),
        actorName: sanitizeFullName(nameMap.get(r.actorId) || 'System'),
      })),
    });
  } catch (err) {
    return handleError(res, err, 'Failed to fetch leadership history.');
  }
});

export default router;
