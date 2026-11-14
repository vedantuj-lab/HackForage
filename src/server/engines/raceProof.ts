import { db } from '../../db/index.ts';
import {
  auditLogs,
  invitations,
  leadershipHistory,
  notifications,
  profiles,
  teamMembers,
  teams,
  users,
  waitlistEntries,
} from '../../db/schema.ts';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import { HttpError } from '../errors.ts';
import { recalculateAndPersistTeamHealth } from './teamHealth.ts';
import { createNotification, logAudit } from '../services/auditAndNotify.ts';
import { emitToTeam, emitToUser } from '../realtime.ts';
import { promoteNextWaitlisted } from './waitlist.ts';

/**
 * RACE-PROOF TEAM FORMATION ENGINE
 * Uses PostgreSQL transaction + SELECT ... FOR UPDATE row-level lock on the team row
 * combined with a UNIQUE(team_id, user_id) constraint in team_members.
 */
export async function joinTeamAtomic(params: {
  teamId: string;
  userId: string;
  requestedRole?: string;
  actorId?: string;
}) {
  const { teamId, userId, requestedRole, actorId } = params;

  const outcome = await db.transaction(async (tx) => {
    // 1. Acquire exclusive PostgreSQL row-level lock on the target team
    const locked = await tx.execute(
      sql`SELECT id, name, max_capacity, status, primary_leader_id FROM teams WHERE id = ${teamId} FOR UPDATE`
    );

    const teamRow = locked.rows[0] as
      | {
          id: string;
          name: string;
          max_capacity: number;
          status: string;
          primary_leader_id: string;
        }
      | undefined;

    if (!teamRow) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
    }
    if (teamRow.status !== 'ACTIVE') {
      throw new HttpError(400, 'TEAM_INACTIVE', 'This team is no longer active.');
    }

    // 2. Check whether participant is already a member
    const existing = await tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);

    if (existing.length > 0) {
      throw new HttpError(409, 'ALREADY_MEMBER', 'Participant is already a member of this team.');
    }

    // 3. Read authoritative membership count inside the locked transaction
    const [{ cnt }] = await tx
      .select({ cnt: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));

    const currentCount = Number(cnt);
    const maxCapacity = Number(teamRow.max_capacity);

    if (currentCount >= maxCapacity) {
      throw new HttpError(
        409,
        'TEAM_FULL',
        `Team "${teamRow.name}" is full (${currentCount}/${maxCapacity}). Join the Smart Waitlist instead.`,
        { currentCount, maxCapacity }
      );
    }

    // Resolve participant's preferred role if not specified
    let assignedRole = requestedRole;
    if (!assignedRole) {
      const [prof] = await tx
        .select({ preferredRole: profiles.preferredRole })
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);
      assignedRole = prof?.preferredRole || 'Full-Stack Developer';
    }

    // 4. Insert membership atomically
    const [membership] = await tx
      .insert(teamMembers)
      .values({
        teamId,
        userId,
        teamRole: assignedRole,
        isLeader: false,
      })
      .returning();

    // Mark any waiting waitlist entry for this user & team as COMPLETED
    await tx
      .update(waitlistEntries)
      .set({ status: 'COMPLETED', acceptedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(waitlistEntries.teamId, teamId), eq(waitlistEntries.userId, userId)));

    // 5. Record audit log inside the same transaction
    await tx.insert(auditLogs).values({
      actorId: actorId ?? userId,
      action: 'TEAM_MEMBER_JOINED',
      entityType: 'TEAM',
      entityId: teamId,
      metadata: {
        userId,
        teamRole: assignedRole,
        seatNumber: currentCount + 1,
        maxCapacity,
      },
    });

    return {
      membership,
      teamName: teamRow.name,
      primaryLeaderId: teamRow.primary_leader_id,
      newMemberCount: currentCount + 1,
      maxCapacity,
    };
  });

  // Post-commit side effects
  const updatedHealth = await recalculateAndPersistTeamHealth(teamId);
  if (outcome.primaryLeaderId !== userId) {
    await createNotification({
      userId: outcome.primaryLeaderId,
      type: 'TEAM_MEMBER_JOINED',
      title: `New Member Joined ${outcome.teamName}`,
      message: `A participant joined ${outcome.teamName} as ${outcome.membership.teamRole} (${outcome.newMemberCount}/${outcome.maxCapacity}).`,
      entityType: 'TEAM',
      entityId: teamId,
    });
  }

  emitToTeam(teamId, 'team:member_joined', {
    teamId,
    userId,
    newMemberCount: outcome.newMemberCount,
    health: updatedHealth,
  });

  return outcome;
}

export async function leaveTeamAtomic(params: {
  teamId: string;
  userId: string;
  actorId: string;
}) {
  const { teamId, userId, actorId } = params;

  const outcome = await db.transaction(async (tx) => {
    const locked = await tx.execute(
      sql`SELECT id, name, max_capacity, status, primary_leader_id, secondary_leader_id FROM teams WHERE id = ${teamId} FOR UPDATE`
    );

    const teamRow = locked.rows[0] as
      | {
          id: string;
          name: string;
          max_capacity: number;
          status: string;
          primary_leader_id: string;
          secondary_leader_id: string | null;
        }
      | undefined;

    if (!teamRow) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
    }

    const [member] = await tx
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);

    if (!member) {
      throw new HttpError(404, 'NOT_A_MEMBER', 'User is not a member of this team.');
    }

    // Remove the member
    await tx
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

    let successorId: string | null = null;

    // Handle Leadership Succession if Primary Leader left
    if (teamRow.primary_leader_id === userId) {
      const remaining = await tx
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), ne(teamMembers.userId, userId)))
        .orderBy(asc(teamMembers.joinedAt));

      if (remaining.length > 0) {
        const preferredSecondary = teamRow.secondary_leader_id
          ? remaining.find((m) => m.userId === teamRow.secondary_leader_id)
          : undefined;
        const successor = preferredSecondary ?? remaining[0];
        successorId = successor.userId;

        await tx
          .update(teams)
          .set({
            primaryLeaderId: successorId,
            secondaryLeaderId: teamRow.secondary_leader_id === successorId ? null : teamRow.secondary_leader_id,
            updatedAt: new Date(),
          })
          .where(eq(teams.id, teamId));

        await tx
          .update(teamMembers)
          .set({ isLeader: true })
          .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, successorId)));

        // Promote user role to TEAM_LEADER if they were PARTICIPANT
        const [succUser] = await tx.select({ role: users.role }).from(users).where(eq(users.id, successorId)).limit(1);
        if (succUser && succUser.role === 'PARTICIPANT') {
          await tx.update(users).set({ role: 'TEAM_LEADER', updatedAt: new Date() }).where(eq(users.id, successorId));
        }

        await tx.insert(leadershipHistory).values({
          teamId,
          previousLeaderId: userId,
          newLeaderId: successorId,
          action: 'AUTO_SUCCESSION',
          reason: preferredSecondary
            ? 'Secondary leader automatically succeeded departing primary leader.'
            : 'Longest-tenured team member automatically succeeded departing primary leader.',
          actorId,
        });

        await tx.insert(notifications).values({
          userId: successorId,
          type: 'LEADERSHIP_TRANSFERRED',
          title: `You are now Primary Leader of ${teamRow.name}`,
          message: `Following the departure of the previous leader, HackForge Leadership Succession promoted you to Primary Leader of ${teamRow.name}.`,
          entityType: 'TEAM',
          entityId: teamId,
        });
      } else {
        await tx
          .update(teams)
          .set({ status: 'ARCHIVED', secondaryLeaderId: null, updatedAt: new Date() })
          .where(eq(teams.id, teamId));
      }
    } else if (teamRow.secondary_leader_id === userId) {
      await tx
        .update(teams)
        .set({ secondaryLeaderId: null, updatedAt: new Date() })
        .where(eq(teams.id, teamId));
    }

    await tx.insert(auditLogs).values({
      actorId,
      action: 'TEAM_MEMBER_LEFT',
      entityType: 'TEAM',
      entityId: teamId,
      metadata: { removedUserId: userId, successorId },
    });

    return {
      teamName: teamRow.name,
      primaryLeaderId: successorId ?? teamRow.primary_leader_id,
      successorId,
    };
  });

  await recalculateAndPersistTeamHealth(teamId);
  if (outcome.successorId) {
    emitToUser(outcome.successorId, 'leadership:changed', { teamId, newLeaderId: outcome.successorId });
  }
  if (outcome.primaryLeaderId !== userId) {
    await createNotification({
      userId: outcome.primaryLeaderId,
      type: 'TEAM_MEMBER_LEFT',
      title: `Member Left ${outcome.teamName}`,
      message: `A member left ${outcome.teamName}. Smart Waitlist is checking for the next eligible candidate.`,
      entityType: 'TEAM',
      entityId: teamId,
    });
  }

  // Trigger Smart Waitlist promotion automatically when a vacancy opens
  await promoteNextWaitlisted(teamId);

  emitToTeam(teamId, 'team:member_left', { teamId, userId, successorId: outcome.successorId });
  return outcome;
}

export async function acceptWaitlistAtomic(params: { waitlistId: string; userId: string }) {
  const { waitlistId, userId } = params;

  const result = await db.transaction(async (tx) => {
    const entryRows = await tx.execute(
      sql`SELECT id, team_id, user_id, status, expires_at FROM waitlist_entries WHERE id = ${waitlistId} FOR UPDATE`
    );
    const entry = entryRows.rows[0] as
      | { id: string; team_id: string; user_id: string; status: string; expires_at: Date | null }
      | undefined;

    if (!entry) throw new HttpError(404, 'WAITLIST_NOT_FOUND', 'Waitlist entry not found.');
    if (entry.user_id !== userId) throw new HttpError(403, 'FORBIDDEN', 'You can only accept your own waitlist invitation.');
    if (entry.status !== 'INVITED') {
      throw new HttpError(400, 'NOT_INVITED', 'This waitlist entry does not currently have an active invitation.');
    }
    if (entry.expires_at && new Date(entry.expires_at).getTime() < Date.now()) {
      await tx
        .update(waitlistEntries)
        .set({ status: 'EXPIRED', updatedAt: new Date() })
        .where(eq(waitlistEntries.id, waitlistId));
      throw new HttpError(410, 'WAITLIST_EXPIRED', 'Your waitlist invitation has expired.');
    }

    const lockedTeam = await tx.execute(
      sql`SELECT id, name, max_capacity, status, primary_leader_id FROM teams WHERE id = ${entry.team_id} FOR UPDATE`
    );
    const teamRow = lockedTeam.rows[0] as
      | { id: string; name: string; max_capacity: number; status: string; primary_leader_id: string }
      | undefined;

    if (!teamRow || teamRow.status !== 'ACTIVE') {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found or inactive.');
    }

    const existing = await tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, entry.team_id), eq(teamMembers.userId, userId)))
      .limit(1);

    if (existing.length > 0) {
      throw new HttpError(409, 'ALREADY_MEMBER', 'Already a member of this team.');
    }

    const [{ cnt }] = await tx
      .select({ cnt: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, entry.team_id));

    if (Number(cnt) >= Number(teamRow.max_capacity)) {
      throw new HttpError(409, 'TEAM_FULL', 'Team capacity is currently full.');
    }

    const [prof] = await tx
      .select({ preferredRole: profiles.preferredRole })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    const [membership] = await tx
      .insert(teamMembers)
      .values({
        teamId: entry.team_id,
        userId,
        teamRole: prof?.preferredRole || 'Full-Stack Developer',
        isLeader: false,
      })
      .returning();

    const now = new Date();
    await tx
      .update(waitlistEntries)
      .set({ status: 'COMPLETED', acceptedAt: now, updatedAt: now })
      .where(eq(waitlistEntries.id, waitlistId));

    await tx.insert(auditLogs).values({
      actorId: userId,
      action: 'WAITLIST_ACCEPTED',
      entityType: 'TEAM',
      entityId: entry.team_id,
      metadata: { waitlistId, userId },
    });

    return { membership, teamId: entry.team_id, teamName: teamRow.name, leaderId: teamRow.primary_leader_id };
  });

  await recalculateAndPersistTeamHealth(result.teamId);
  await createNotification({
    userId: result.leaderId,
    type: 'TEAM_MEMBER_JOINED',
    title: `Waitlist Candidate Joined ${result.teamName}`,
    message: `A waitlisted participant accepted their seat invitation and joined ${result.teamName}.`,
    entityType: 'TEAM',
    entityId: result.teamId,
  });
  emitToTeam(result.teamId, 'team:member_joined', { teamId: result.teamId, userId });
  return result;
}

export async function acceptInvitationAtomic(params: { invitationId: string; actorId: string }) {
  const { invitationId, actorId } = params;

  const outcome = await db.transaction(async (tx) => {
    const invRows = await tx.execute(
      sql`SELECT id, team_id, user_id, invited_by_id, type, proposed_role, status, expires_at FROM invitations WHERE id = ${invitationId} FOR UPDATE`
    );
    const inv = invRows.rows[0] as
      | {
          id: string;
          team_id: string;
          user_id: string;
          invited_by_id: string;
          type: string;
          proposed_role: string;
          status: string;
          expires_at: Date;
        }
      | undefined;

    if (!inv) throw new HttpError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    if (inv.status !== 'PENDING') {
      throw new HttpError(400, 'INVALID_INVITATION_STATE', `Invitation is already ${inv.status.toLowerCase()}.`);
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      await tx.update(invitations).set({ status: 'EXPIRED', updatedAt: new Date() }).where(eq(invitations.id, invitationId));
      throw new HttpError(410, 'INVITATION_EXPIRED', 'Invitation has expired.');
    }

    const lockedTeam = await tx.execute(
      sql`SELECT id, name, max_capacity, status, primary_leader_id, secondary_leader_id FROM teams WHERE id = ${inv.team_id} FOR UPDATE`
    );
    const teamRow = lockedTeam.rows[0] as
      | {
          id: string;
          name: string;
          max_capacity: number;
          status: string;
          primary_leader_id: string;
          secondary_leader_id: string | null;
        }
      | undefined;

    if (!teamRow || teamRow.status !== 'ACTIVE') {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found or inactive.');
    }

    // Authorization check
    if (inv.type === 'INVITE' && inv.user_id !== actorId) {
      throw new HttpError(403, 'FORBIDDEN', 'Only the invited participant can accept this invitation.');
    }
    if (
      inv.type === 'REQUEST' &&
      teamRow.primary_leader_id !== actorId &&
      teamRow.secondary_leader_id !== actorId
    ) {
      throw new HttpError(403, 'FORBIDDEN', 'Only team leaders can approve join requests.');
    }

    const existing = await tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, inv.team_id), eq(teamMembers.userId, inv.user_id)))
      .limit(1);

    if (existing.length > 0) {
      throw new HttpError(409, 'ALREADY_MEMBER', 'Participant is already a member of this team.');
    }

    const [{ cnt }] = await tx
      .select({ cnt: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, inv.team_id));

    if (Number(cnt) >= Number(teamRow.max_capacity)) {
      throw new HttpError(409, 'TEAM_FULL', 'Team is already at maximum capacity.');
    }

    const [membership] = await tx
      .insert(teamMembers)
      .values({
        teamId: inv.team_id,
        userId: inv.user_id,
        teamRole: inv.proposed_role || 'Developer',
        isLeader: false,
      })
      .returning();

    await tx
      .update(invitations)
      .set({ status: 'ACCEPTED', updatedAt: new Date() })
      .where(eq(invitations.id, invitationId));

    await tx.insert(auditLogs).values({
      actorId,
      action: inv.type === 'REQUEST' ? 'JOIN_REQUEST_APPROVED' : 'INVITATION_ACCEPTED',
      entityType: 'TEAM',
      entityId: inv.team_id,
      metadata: { invitationId, userId: inv.user_id },
    });

    return { membership, teamId: inv.team_id, teamName: teamRow.name, userId: inv.user_id, type: inv.type };
  });

  await recalculateAndPersistTeamHealth(outcome.teamId);
  await createNotification({
    userId: outcome.userId,
    type: 'INVITATION_ACCEPTED',
    title: `Joined ${outcome.teamName}`,
    message: `Your membership in ${outcome.teamName} is confirmed.`,
    entityType: 'TEAM',
    entityId: outcome.teamId,
  });
  emitToTeam(outcome.teamId, 'team:member_joined', { teamId: outcome.teamId, userId: outcome.userId });
  return outcome;
}
