import { Router } from 'express';
import { db } from '../../db/index.ts';
import {
  compatibilityScores,
  invitations,
  profiles,
  skills,
  teamMembers,
  teams,
  userSkills,
  users,
  waitlistEntries,
} from '../../db/schema.ts';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import { AuthRequest, requireAuth } from '../auth.ts';
import { HttpError } from '../errors.ts';
import {
  calculateAndPersistCompatibility,
  computeCompatibilityScores,
  recalculateCompatibilityForTeam,
  recalculateCompatibilityForUser,
} from '../engines/compatibility.ts';
import {
  declineWaitlistInvitation,
  expireStaleWaitlistInvitations,
  joinWaitlist,
} from '../engines/waitlist.ts';
import { acceptInvitationAtomic, acceptWaitlistAtomic } from '../engines/raceProof.ts';
import { createNotification, logAudit } from '../services/auditAndNotify.ts';
import { emitToTeam, emitToUser } from '../realtime.ts';
import { teamRequirements } from '../../db/schema.ts';
import { sanitizeFullName } from '../services/profileCompletion.ts';

const router = Router();

function handleError(res: any, err: unknown, fallback: string) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code, details: err.details });
  }
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

// COMPATIBILITY ROUTES
router.get('/compatibility/users/:id', requireAuth, async (req, res) => {
  try {
    const userId = String(req.params.id);
    const activeTeams = await db
      .select()
      .from(teams)
      .where(and(eq(teams.status, 'ACTIVE'), eq(teams.isTestTeam, false)));

    const recommendations = [];
    for (const t of activeTeams) {
      const compat = await calculateAndPersistCompatibility(userId, t.id);
      if (!compat) continue;
      const members = await db
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, t.id));
      const [reqs] = await db
        .select()
        .from(teamRequirements)
        .where(eq(teamRequirements.teamId, t.id))
        .limit(1);

      recommendations.push({
        ...compat,
        teamName: t.name,
        teamCategory: t.category,
        teamDescription: t.description,
        teamExperienceReq: reqs?.minExperience ?? t.experienceRequirement,
        teamCollabMode: t.collaborationMode,
        maxCapacity: t.maxCapacity,
        memberCount: members.length,
        availableSeats: Math.max(0, t.maxCapacity - members.length),
        isMember: members.some((m) => m.userId === userId),
        requiredSkills: reqs?.requiredSkills ?? [],
        requiredRoles: reqs?.requiredRoles ?? [],
      });
    }

    recommendations.sort((a, b) => b.overallScore - a.overallScore);
    return res.json({ recommendations });
  } catch (err) {
    return handleError(res, err, 'Failed to fetch user compatibility recommendations.');
  }
});

router.get('/compatibility/teams/:id', requireAuth, async (req, res) => {
  try {
    const teamId = String(req.params.id);
    const [teamRow] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!teamRow) return res.status(404).json({ error: 'Team not found.' });

    await recalculateCompatibilityForTeam(teamId);

    const existingMembers = await db
      .select({ userId: teamMembers.userId, teamRole: teamMembers.teamRole })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));
    const memberSet = new Set(existingMembers.map((m) => m.userId));
    const memberIds = existingMembers.map((m) => m.userId);
    const [reqs] = await db
      .select()
      .from(teamRequirements)
      .where(eq(teamRequirements.teamId, teamId))
      .limit(1);

    let teamRosterSkills: string[] = [];
    if (memberIds.length > 0) {
      const mSkillRows = await db
        .select({ name: skills.name })
        .from(userSkills)
        .innerJoin(skills, eq(userSkills.skillId, skills.id))
        .where(inArray(userSkills.userId, memberIds));
      teamRosterSkills = Array.from(new Set(mSkillRows.map((s) => s.name)));
    }

    const rows = await db
      .select({
        score: compatibilityScores,
        fullName: users.fullName,
        email: users.email,
        institution: users.institution,
        preferredRole: profiles.preferredRole,
        experienceLevel: profiles.experienceLevel,
        projectInterests: profiles.projectInterests,
        collaborationMode: profiles.collaborationMode,
        avatarUrl: profiles.avatarUrl,
      })
      .from(compatibilityScores)
      .innerJoin(users, eq(compatibilityScores.userId, users.id))
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(and(eq(compatibilityScores.teamId, teamId), eq(users.status, 'ACTIVE')))
      .orderBy(desc(compatibilityScores.overallScore));

    const filtered = rows.filter(
      (r) => !memberSet.has(r.score.userId) && !r.email.endsWith('@hackforge.test')
    );

    const uIds = filtered.map((f) => f.score.userId);
    const sMap = new Map<string, string[]>();
    if (uIds.length > 0) {
      const sRows = await db
        .select({ userId: userSkills.userId, name: skills.name })
        .from(userSkills)
        .innerJoin(skills, eq(userSkills.skillId, skills.id))
        .where(inArray(userSkills.userId, uIds));
      for (const s of sRows) {
        const list = sMap.get(s.userId) || [];
        list.push(s.name);
        sMap.set(s.userId, list);
      }
    }

    return res.json({
      candidates: filtered.map((r) => {
        const candSkills = sMap.get(r.score.userId) || [];
        const rich = computeCompatibilityScores({
          userId: r.score.userId,
          teamId,
          userSkillNames: candSkills,
          preferredRole: r.preferredRole || 'Full-Stack Developer',
          experienceLevel: r.experienceLevel || 'Intermediate',
          projectInterests: r.projectInterests || [],
          userCollabMode: r.collaborationMode || 'Hybrid',
          requiredSkills: reqs?.requiredSkills ?? [],
          requiredRoles: reqs?.requiredRoles ?? [],
          currentMemberRoles: existingMembers.map((m) => m.teamRole),
          currentMemberSkills: teamRosterSkills,
          teamCategory: teamRow.category,
          teamExperienceReq: reqs?.minExperience ?? teamRow.experienceRequirement,
          teamCollabMode: teamRow.collaborationMode,
        });
        return {
          ...r.score,
          complementarySkills: rich.complementarySkills,
          suggestedContribution: rich.suggestedContribution,
          fullName: sanitizeFullName(r.fullName, r.email),
          email: r.email,
          institution: r.institution,
          preferredRole: r.preferredRole || 'Full-Stack Developer',
          experienceLevel: r.experienceLevel || 'Intermediate',
          collaborationMode: r.collaborationMode || 'Hybrid',
          projectInterests: r.projectInterests || [],
          avatarUrl: r.avatarUrl || '',
          skills: candSkills,
        };
      }),
    });
  } catch (err) {
    return handleError(res, err, 'Failed to fetch team candidate compatibility.');
  }
});

router.post('/compatibility/calculate', requireAuth, async (req, res) => {
  try {
    const { userId, teamId } = req.body as { userId?: string; teamId?: string };
    if (!userId || !teamId) {
      return res.status(400).json({ error: 'userId and teamId are required.' });
    }
    const result = await calculateAndPersistCompatibility(userId, teamId);
    if (!result) return res.status(404).json({ error: 'User or team not found.' });
    return res.json({ compatibility: result });
  } catch (err) {
    return handleError(res, err, 'Failed to calculate compatibility.');
  }
});

// SMART WAITLIST ROUTES
router.post('/teams/:id/waitlist', requireAuth, async (req: AuthRequest, res) => {
  try {
    const entry = await joinWaitlist({
      teamId: String(req.params.id),
      userId: req.authUser!.id,
    });
    return res.status(201).json({ entry });
  } catch (err) {
    return handleError(res, err, 'Failed to join waitlist.');
  }
});

router.get('/teams/:id/waitlist', requireAuth, async (req, res) => {
  try {
    const teamId = String(req.params.id);
    await expireStaleWaitlistInvitations(teamId);

    const rows = await db
      .select({
        entry: waitlistEntries,
        fullName: users.fullName,
        email: users.email,
        preferredRole: profiles.preferredRole,
        experienceLevel: profiles.experienceLevel,
      })
      .from(waitlistEntries)
      .innerJoin(users, eq(waitlistEntries.userId, users.id))
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(waitlistEntries.teamId, teamId))
      .orderBy(asc(waitlistEntries.queuePosition));

    return res.json({
      waitlist: rows.map((r) => ({
        ...r.entry,
        fullName: sanitizeFullName(r.fullName, r.email),
        email: r.email,
        preferredRole: r.preferredRole || 'Developer',
        experienceLevel: r.experienceLevel || 'Intermediate',
      })),
    });
  } catch (err) {
    return handleError(res, err, 'Failed to fetch team waitlist.');
  }
});

router.get('/waitlist/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    await expireStaleWaitlistInvitations();
    const rows = await db
      .select({
        entry: waitlistEntries,
        teamName: teams.name,
        teamCategory: teams.category,
        maxCapacity: teams.maxCapacity,
      })
      .from(waitlistEntries)
      .innerJoin(teams, eq(waitlistEntries.teamId, teams.id))
      .where(eq(waitlistEntries.userId, req.authUser!.id))
      .orderBy(desc(waitlistEntries.createdAt));

    return res.json({
      entries: rows.map((r) => ({
        ...r.entry,
        teamName: r.teamName,
        teamCategory: r.teamCategory,
        maxCapacity: r.maxCapacity,
      })),
    });
  } catch (err) {
    return handleError(res, err, 'Failed to fetch personal waitlist.');
  }
});

router.post('/waitlist/:id/accept', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await acceptWaitlistAtomic({
      waitlistId: String(req.params.id),
      userId: req.authUser!.id,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleError(res, err, 'Failed to accept waitlist invitation.');
  }
});

router.post('/waitlist/:id/decline', requireAuth, async (req: AuthRequest, res) => {
  try {
    const updated = await declineWaitlistInvitation(String(req.params.id), req.authUser!.id);
    return res.json({ entry: updated });
  } catch (err) {
    return handleError(res, err, 'Failed to decline waitlist entry.');
  }
});

router.delete('/waitlist/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const updated = await declineWaitlistInvitation(String(req.params.id), req.authUser!.id);
    return res.json({ entry: updated });
  } catch (err) {
    return handleError(res, err, 'Failed to cancel waitlist entry.');
  }
});

// INVITATIONS & MEMBERSHIP REQUESTS
router.post('/teams/:id/invitations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = String(req.params.id);
    const { userId, type, proposedRole, message } = req.body as {
      userId?: string;
      type?: 'INVITE' | 'REQUEST';
      proposedRole?: string;
      message?: string;
    };

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team || team.status !== 'ACTIVE') {
      return res.status(404).json({ error: 'Team not found or inactive.' });
    }

    const inviteType = type === 'REQUEST' ? 'REQUEST' : 'INVITE';
    const targetUserId = inviteType === 'REQUEST' ? req.authUser!.id : userId;
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target participant userId is required.' });
    }

    if (inviteType === 'INVITE') {
      const isLeader =
        team.primaryLeaderId === req.authUser!.id ||
        team.secondaryLeaderId === req.authUser!.id ||
        req.authUser!.role === 'ADMIN';
      if (!isLeader) {
        return res.status(403).json({ error: 'Only team leaders can send team invitations.' });
      }
    }

    const [existingMember] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)))
      .limit(1);
    if (existingMember) {
      return res.status(409).json({ error: 'Participant is already a member of this team.' });
    }

    const [existingPending] = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.teamId, teamId),
          eq(invitations.userId, targetUserId),
          eq(invitations.status, 'PENDING')
        )
      )
      .limit(1);
    if (existingPending) {
      return res.status(409).json({ error: 'A pending invitation or request already exists.' });
    }

    const [created] = await db
      .insert(invitations)
      .values({
        teamId,
        userId: targetUserId,
        invitedById: req.authUser!.id,
        type: inviteType,
        proposedRole: proposedRole || 'Full-Stack Developer',
        message: message?.trim() || '',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      })
      .returning();

    const notifyRecipient = inviteType === 'INVITE' ? targetUserId : team.primaryLeaderId;
    await createNotification({
      userId: notifyRecipient,
      type: inviteType === 'INVITE' ? 'INVITATION_RECEIVED' : 'MEMBERSHIP_REQUEST_RECEIVED',
      title: inviteType === 'INVITE' ? `Invitation to ${team.name}` : `Join Request for ${team.name}`,
      message:
        inviteType === 'INVITE'
          ? `You have been invited to join ${team.name} as ${created.proposedRole}.`
          : `${req.authUser!.fullName} requested to join ${team.name} as ${created.proposedRole}.`,
      entityType: 'INVITATION',
      entityId: created.id,
    });

    await logAudit({
      actorId: req.authUser!.id,
      action: inviteType === 'INVITE' ? 'INVITATION_SENT' : 'JOIN_REQUEST_SENT',
      entityType: 'INVITATION',
      entityId: created.id,
      metadata: { teamId, targetUserId },
    });

    emitToUser(notifyRecipient, 'invitation:new', created);
    emitToTeam(teamId, 'invitation:new', created);
    return res.status(201).json({ invitation: created });
  } catch (err) {
    return handleError(res, err, 'Failed to create invitation.');
  }
});

router.get('/invitations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const ledTeams = await db
      .select({ id: teams.id })
      .from(teams)
      .where(or(eq(teams.primaryLeaderId, userId), eq(teams.secondaryLeaderId, userId)));
    const ledTeamIds = ledTeams.map((t) => t.id);

    const rows = await db
      .select({
        inv: invitations,
        teamName: teams.name,
        teamCategory: teams.category,
        candidateName: users.fullName,
        candidateEmail: users.email,
      })
      .from(invitations)
      .innerJoin(teams, eq(invitations.teamId, teams.id))
      .innerJoin(users, eq(invitations.userId, users.id))
      .where(
        ledTeamIds.length > 0
          ? or(eq(invitations.userId, userId), inArray(invitations.teamId, ledTeamIds))
          : eq(invitations.userId, userId)
      )
      .orderBy(desc(invitations.createdAt));

    return res.json({
      invitations: rows.map((r) => ({
        ...r.inv,
        teamName: r.teamName,
        teamCategory: r.teamCategory,
        candidateName: sanitizeFullName(r.candidateName, r.candidateEmail),
        candidateEmail: r.candidateEmail,
      })),
    });
  } catch (err) {
    return handleError(res, err, 'Failed to fetch invitations.');
  }
});

router.post('/invitations/:id/accept', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await acceptInvitationAtomic({
      invitationId: String(req.params.id),
      actorId: req.authUser!.id,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleError(res, err, 'Failed to accept invitation.');
  }
});

router.post('/invitations/:id/decline', requireAuth, async (req: AuthRequest, res) => {
  try {
    const invId = String(req.params.id);
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, invId)).limit(1);
    if (!inv) return res.status(404).json({ error: 'Invitation not found.' });

    const [team] = await db.select().from(teams).where(eq(teams.id, inv.teamId)).limit(1);
    const isLeader =
      team && (team.primaryLeaderId === req.authUser!.id || team.secondaryLeaderId === req.authUser!.id);

    if (inv.userId !== req.authUser!.id && !isLeader && req.authUser!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized to decline this invitation.' });
    }

    const [updated] = await db
      .update(invitations)
      .set({ status: 'DECLINED', updatedAt: new Date() })
      .where(eq(invitations.id, invId))
      .returning();

    await createNotification({
      userId: inv.type === 'REQUEST' ? inv.userId : inv.invitedById,
      type: 'INVITATION_DECLINED',
      title: `Invitation Declined (${team?.name || 'Team'})`,
      message: `An invitation or membership request for ${team?.name || 'the team'} was declined.`,
      entityType: 'TEAM',
      entityId: inv.teamId,
    });

    await logAudit({
      actorId: req.authUser!.id,
      action: 'INVITATION_DECLINED',
      entityType: 'INVITATION',
      entityId: invId,
    });

    return res.json({ invitation: updated });
  } catch (err) {
    return handleError(res, err, 'Failed to decline invitation.');
  }
});

export default router;
