import { db } from '../../db/index.ts';
import {
  auditLogs,
  leadershipHistory,
  teamMembers,
  teams,
  users,
} from '../../db/schema.ts';
import { and, eq, sql } from 'drizzle-orm';
import { HttpError } from '../errors.ts';
import { recalculateAndPersistTeamHealth } from './teamHealth.ts';
import { createNotification } from '../services/auditAndNotify.ts';
import { emitToTeam, emitToUser } from '../realtime.ts';

export async function assignSecondaryLeader(params: {
  teamId: string;
  targetUserId: string;
  actorId: string;
  isAdmin?: boolean;
}) {
  const { teamId, targetUserId, actorId, isAdmin } = params;

  const updated = await db.transaction(async (tx) => {
    const locked = await tx.execute(
      sql`SELECT id, name, primary_leader_id, secondary_leader_id FROM teams WHERE id = ${teamId} FOR UPDATE`
    );
    const teamRow = locked.rows[0] as
      | { id: string; name: string; primary_leader_id: string; secondary_leader_id: string | null }
      | undefined;

    if (!teamRow) throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
    if (!isAdmin && teamRow.primary_leader_id !== actorId) {
      throw new HttpError(403, 'FORBIDDEN', 'Only the primary leader or an admin can assign a secondary leader.');
    }
    if (teamRow.primary_leader_id === targetUserId) {
      throw new HttpError(400, 'INVALID_TARGET', 'The primary leader cannot also be the secondary leader.');
    }

    const [member] = await tx
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)))
      .limit(1);

    if (!member) {
      throw new HttpError(400, 'NOT_A_MEMBER', 'Secondary leader must already be a member of the team.');
    }

    const [teamUpdated] = await tx
      .update(teams)
      .set({ secondaryLeaderId: targetUserId, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
      .returning();

    await tx.insert(leadershipHistory).values({
      teamId,
      previousLeaderId: teamRow.secondary_leader_id,
      newLeaderId: targetUserId,
      action: 'ASSIGN_SECONDARY',
      reason: 'Designated secondary leader for leadership continuity.',
      actorId,
    });

    await tx.insert(auditLogs).values({
      actorId,
      action: 'SECONDARY_LEADER_ASSIGNED',
      entityType: 'TEAM',
      entityId: teamId,
      metadata: { targetUserId },
    });

    return { team: teamUpdated, teamName: teamRow.name };
  });

  await recalculateAndPersistTeamHealth(teamId);
  await createNotification({
    userId: targetUserId,
    type: 'LEADERSHIP_ASSIGNED',
    title: `Secondary Leader in ${updated.teamName}`,
    message: `You have been designated Secondary Leader for ${updated.teamName}.`,
    entityType: 'TEAM',
    entityId: teamId,
  });
  emitToTeam(teamId, 'leadership:changed', { teamId, secondaryLeaderId: targetUserId });
  return updated.team;
}

export async function transferPrimaryLeadership(params: {
  teamId: string;
  newLeaderId: string;
  actorId: string;
  reason?: string;
  isAdmin?: boolean;
}) {
  const { teamId, newLeaderId, actorId, reason, isAdmin } = params;

  const updated = await db.transaction(async (tx) => {
    const locked = await tx.execute(
      sql`SELECT id, name, primary_leader_id, secondary_leader_id FROM teams WHERE id = ${teamId} FOR UPDATE`
    );
    const teamRow = locked.rows[0] as
      | { id: string; name: string; primary_leader_id: string; secondary_leader_id: string | null }
      | undefined;

    if (!teamRow) throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
    if (!isAdmin && teamRow.primary_leader_id !== actorId) {
      throw new HttpError(403, 'FORBIDDEN', 'Only the current primary leader or an admin can transfer primary leadership.');
    }
    if (teamRow.primary_leader_id === newLeaderId) {
      throw new HttpError(400, 'ALREADY_PRIMARY', 'This member is already the primary leader.');
    }

    const [targetMember] = await tx
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, newLeaderId)))
      .limit(1);

    if (!targetMember) {
      throw new HttpError(400, 'NOT_A_MEMBER', 'New primary leader must be an active member of the team.');
    }

    const prevLeaderId = teamRow.primary_leader_id;

    // Ensure single primary leader: demote previous in team_members, promote new
    await tx
      .update(teamMembers)
      .set({ isLeader: false })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, prevLeaderId)));

    await tx
      .update(teamMembers)
      .set({ isLeader: true })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, newLeaderId)));

    const newSecondary =
      teamRow.secondary_leader_id === newLeaderId ? prevLeaderId : teamRow.secondary_leader_id;

    const [teamUpdated] = await tx
      .update(teams)
      .set({
        primaryLeaderId: newLeaderId,
        secondaryLeaderId: newSecondary,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId))
      .returning();

    const [newUser] = await tx.select({ role: users.role }).from(users).where(eq(users.id, newLeaderId)).limit(1);
    if (newUser && newUser.role === 'PARTICIPANT') {
      await tx.update(users).set({ role: 'TEAM_LEADER', updatedAt: new Date() }).where(eq(users.id, newLeaderId));
    }

    await tx.insert(leadershipHistory).values({
      teamId,
      previousLeaderId: prevLeaderId,
      newLeaderId,
      action: isAdmin ? 'ADMIN_OVERRIDE' : 'TRANSFER',
      reason: reason?.trim() || 'Planned leadership transfer.',
      actorId,
    });

    await tx.insert(auditLogs).values({
      actorId,
      action: 'LEADERSHIP_TRANSFERRED',
      entityType: 'TEAM',
      entityId: teamId,
      metadata: { previousLeaderId: prevLeaderId, newLeaderId },
    });

    return { team: teamUpdated, teamName: teamRow.name, prevLeaderId };
  });

  await recalculateAndPersistTeamHealth(teamId);
  await createNotification({
    userId: newLeaderId,
    type: 'LEADERSHIP_TRANSFERRED',
    title: `Primary Leadership Transferred: ${updated.teamName}`,
    message: `You are now the Primary Leader of ${updated.teamName}.`,
    entityType: 'TEAM',
    entityId: teamId,
  });
  await createNotification({
    userId: updated.prevLeaderId,
    type: 'LEADERSHIP_TRANSFERRED',
    title: `Leadership Transfer Complete: ${updated.teamName}`,
    message: `Primary leadership of ${updated.teamName} has been transferred.`,
    entityType: 'TEAM',
    entityId: teamId,
  });
  emitToUser(newLeaderId, 'leadership:changed', { teamId, newLeaderId });
  emitToTeam(teamId, 'leadership:changed', { teamId, newLeaderId });
  return updated.team;
}
