import { db } from '../../db/index.ts';
import {
  eventSettings,
  teamMembers,
  teams,
  waitlistEntries,
} from '../../db/schema.ts';
import { and, asc, count, eq, inArray, lt, sql } from 'drizzle-orm';
import { HttpError } from '../errors.ts';
import { calculateAndPersistCompatibility } from './compatibility.ts';
import { createNotification, logAudit } from '../services/auditAndNotify.ts';
import { emitToTeam, emitToUser } from '../realtime.ts';

export async function joinWaitlist(params: { teamId: string; userId: string }) {
  const { teamId, userId } = params;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team || team.status !== 'ACTIVE') {
    throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found or inactive.');
  }

  const [existingMember] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  if (existingMember) {
    throw new HttpError(409, 'ALREADY_MEMBER', 'You are already a member of this team.');
  }

  const [existingWaitlist] = await db
    .select()
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.teamId, teamId),
        eq(waitlistEntries.userId, userId),
        inArray(waitlistEntries.status, ['WAITING', 'INVITED'])
      )
    )
    .limit(1);

  if (existingWaitlist) {
    throw new HttpError(409, 'ALREADY_WAITLISTED', 'You already have an active waitlist entry for this team.');
  }

  const compat = await calculateAndPersistCompatibility(userId, teamId);

  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM teams WHERE id = ${teamId} FOR UPDATE`);

    const maxPosResult = await tx
      .select({ maxPos: sql<number>`COALESCE(MAX(${waitlistEntries.queuePosition}), 0)::int` })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.teamId, teamId));

    const nextPos = (maxPosResult[0]?.maxPos ?? 0) + 1;

    const [entry] = await tx
      .insert(waitlistEntries)
      .values({
        teamId,
        userId,
        queuePosition: nextPos,
        compatibilityScore: compat?.overallScore ?? 70,
        status: 'WAITING',
      })
      .returning();

    return entry;
  });

  await logAudit({
    actorId: userId,
    action: 'WAITLIST_JOINED',
    entityType: 'WAITLIST',
    entityId: created.id,
    metadata: { teamId, queuePosition: created.queuePosition },
  });

  await createNotification({
    userId,
    type: 'WAITLIST_JOINED',
    title: `Waitlist #${created.queuePosition} for ${team.name}`,
    message: `You are #${created.queuePosition} in the Smart Waitlist queue for ${team.name}.`,
    entityType: 'TEAM',
    entityId: teamId,
  });

  emitToTeam(teamId, 'waitlist:updated', { teamId });
  return created;
}

export async function expireStaleWaitlistInvitations(teamId?: string) {
  const now = new Date();
  const whereClause = teamId
    ? and(
        eq(waitlistEntries.teamId, teamId),
        eq(waitlistEntries.status, 'INVITED'),
        lt(waitlistEntries.expiresAt, now)
      )
    : and(eq(waitlistEntries.status, 'INVITED'), lt(waitlistEntries.expiresAt, now));

  const expired = await db
    .update(waitlistEntries)
    .set({ status: 'EXPIRED', updatedAt: now })
    .where(whereClause)
    .returning();

  const affectedTeams = new Set(expired.map((e) => e.teamId));
  for (const tId of affectedTeams) {
    await promoteNextWaitlisted(tId);
  }
  return expired.length;
}

export async function promoteNextWaitlisted(teamId: string) {
  const [settings] = await db.select().from(eventSettings).limit(1);
  if (settings && !settings.autoWaitlistPromotion) {
    return null;
  }

  const expiryMinutes = settings?.waitlistExpiryMinutes ?? 60;

  const promoted = await db.transaction(async (tx) => {
    const teamRows = await tx.execute(
      sql`SELECT id, name, max_capacity, status FROM teams WHERE id = ${teamId} FOR UPDATE`
    );
    const team = teamRows.rows[0] as { id: string; name: string; max_capacity: number; status: string } | undefined;
    if (!team || team.status !== 'ACTIVE') return null;

    const [{ cnt }] = await tx
      .select({ cnt: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));

    if (Number(cnt) >= Number(team.max_capacity)) {
      return null;
    }

    const [alreadyInvited] = await tx
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.teamId, teamId), eq(waitlistEntries.status, 'INVITED')))
      .limit(1);

    if (alreadyInvited) {
      return null;
    }

    // Respect strict FIFO queue order for fairness
    const [nextEntry] = await tx
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.teamId, teamId), eq(waitlistEntries.status, 'WAITING')))
      .orderBy(asc(waitlistEntries.queuePosition), asc(waitlistEntries.createdAt))
      .limit(1);

    if (!nextEntry) return null;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);

    const [updated] = await tx
      .update(waitlistEntries)
      .set({
        status: 'INVITED',
        invitedAt: now,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(waitlistEntries.id, nextEntry.id))
      .returning();

    return { entry: updated, teamName: team.name };
  });

  if (promoted) {
    await createNotification({
      userId: promoted.entry.userId,
      type: 'WAITLIST_INVITED',
      title: `Seat Open in ${promoted.teamName}`,
      message: `A vacancy opened in ${promoted.teamName}. Accept your waitlist invitation before it expires.`,
      entityType: 'WAITLIST',
      entityId: promoted.entry.id,
    });
    await logAudit({
      actorId: null,
      action: 'WAITLIST_INVITED',
      entityType: 'WAITLIST',
      entityId: promoted.entry.id,
      metadata: { teamId, userId: promoted.entry.userId, queuePosition: promoted.entry.queuePosition },
    });
    emitToUser(promoted.entry.userId, 'waitlist:invited', promoted.entry);
    emitToTeam(teamId, 'waitlist:updated', { teamId });
  }

  return promoted?.entry ?? null;
}

export async function declineWaitlistInvitation(waitlistId: string, userId: string) {
  const [entry] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.id, waitlistId)).limit(1);
  if (!entry) throw new HttpError(404, 'WAITLIST_NOT_FOUND', 'Waitlist entry not found.');
  if (entry.userId !== userId) throw new HttpError(403, 'FORBIDDEN', 'You cannot modify another participant waitlist entry.');

  if (entry.status !== 'INVITED' && entry.status !== 'WAITING') {
    throw new HttpError(400, 'INVALID_STATE', 'This waitlist entry is no longer active.');
  }

  const nextStatus = entry.status === 'INVITED' ? 'DECLINED' : 'CANCELLED';
  const [updated] = await db
    .update(waitlistEntries)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(waitlistEntries.id, waitlistId))
    .returning();

  await logAudit({
    actorId: userId,
    action: nextStatus === 'DECLINED' ? 'WAITLIST_DECLINED' : 'WAITLIST_CANCELLED',
    entityType: 'WAITLIST',
    entityId: waitlistId,
    metadata: { teamId: entry.teamId },
  });

  if (nextStatus === 'DECLINED') {
    await promoteNextWaitlisted(entry.teamId);
  }
  emitToTeam(entry.teamId, 'waitlist:updated', { teamId: entry.teamId });
  return updated;
}
