import { db } from '../../db/index.ts';
import {
  auditLogs,
  profiles,
  teamMembers,
  teamRequirements,
  teams,
  users,
} from '../../db/schema.ts';
import { and, count, eq, like } from 'drizzle-orm';
import { hashPassword, signAccessToken } from '../auth.ts';
import { recalculateAndPersistTeamHealth } from './teamHealth.ts';

const TEST_TEAM_NAME = 'Concurrency Lab Vault';

export async function getOrResetConcurrencyLabTeam(adminUserId: string) {
  let [testTeam] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.isTestTeam, true), eq(teams.name, TEST_TEAM_NAME)))
    .limit(1);

  if (!testTeam) {
    const [created] = await db
      .insert(teams)
      .values({
        name: TEST_TEAM_NAME,
        description:
          'Controlled PostgreSQL isolation team (Max Capacity = 5, 4 Existing Members, 1 Open Seat) for verifying SELECT FOR UPDATE concurrency locking.',
        category: 'Artificial Intelligence',
        maxCapacity: 5,
        experienceRequirement: 'Intermediate',
        collaborationMode: 'Hybrid',
        visibility: 'PRIVATE',
        primaryLeaderId: adminUserId,
        isTestTeam: true,
        status: 'ACTIVE',
      })
      .returning();
    testTeam = created;

    await db.insert(teamRequirements).values({
      teamId: testTeam.id,
      requiredSkills: ['PostgreSQL', 'Node.js', 'TypeScript'],
      requiredRoles: ['Backend Developer', 'Full-Stack Developer'],
      minExperience: 'Intermediate',
    });
  }

  // Ensure 54 test users exist (4 seated members + 50 racing contenders)
  const existingTestUsers = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(like(users.email, 'race_bot_%@hackforge.test'));

  const existingByEmail = new Map(existingTestUsers.map((u) => [u.email, u]));
  const pwdHash = await hashPassword('HackForgeTest@2026');

  const allBots: Array<{ id: string; email: string; role: string }> = [];
  for (let i = 1; i <= 54; i++) {
    const idx = String(i).padStart(2, '0');
    const email = `race_bot_${idx}@hackforge.test`;
    const found = existingByEmail.get(email);
    if (found) {
      allBots.push(found);
    } else {
      const [inserted] = await db
        .insert(users)
        .values({
          uid: `race-bot-${idx}`,
          email,
          passwordHash: pwdHash,
          fullName: `Contender ${idx}`,
          role: 'PARTICIPANT',
          status: 'ACTIVE',
          institution: 'Concurrency Lab',
          location: 'Test Harness',
        })
        .returning({ id: users.id, email: users.email, role: users.role });

      await db
        .insert(profiles)
        .values({
          userId: inserted.id,
          experienceLevel: 'Intermediate',
          preferredRole: 'Backend Developer',
          projectInterests: ['Artificial Intelligence'],
          collaborationMode: 'Hybrid',
          completionPct: 80,
        })
        .onConflictDoNothing();

      allBots.push(inserted);
    }
  }

  const seatedBots = allBots.slice(0, 4);
  const racingBots = allBots.slice(4, 54);

  // Reset test team membership to exactly 4 existing members (1 open seat out of 5)
  await db.delete(teamMembers).where(eq(teamMembers.teamId, testTeam.id));
  await db.insert(teamMembers).values(
    seatedBots.map((b, idx) => ({
      teamId: testTeam.id,
      userId: b.id,
      teamRole: idx === 0 ? 'Backend Developer' : 'Full-Stack Developer',
      isLeader: idx === 0,
    }))
  );

  await db
    .update(teams)
    .set({ maxCapacity: 5, primaryLeaderId: seatedBots[0].id, status: 'ACTIVE' })
    .where(eq(teams.id, testTeam.id));

  await recalculateAndPersistTeamHealth(testTeam.id);

  return { testTeam, seatedBots, racingBots };
}

export async function runLive50UserConcurrencyTest(params: {
  adminUserId: string;
  baseUrl: string;
}) {
  const { testTeam, racingBots } = await getOrResetConcurrencyLabTeam(params.adminUserId);

  const [{ cnt: initialCount }] = await db
    .select({ cnt: count() })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, testTeam.id));

  // Issue 50 real JWTs for the 50 racing contenders
  const contenders = racingBots.map((bot) => ({
    userId: bot.id,
    email: bot.email,
    token: signAccessToken({ id: bot.id, email: bot.email, role: bot.role }),
  }));

  const startedAt = Date.now();

  // Fire 50 simultaneous HTTP POST requests against the real Express + PostgreSQL endpoint
  const responses = await Promise.all(
    contenders.map(async (c, index) => {
      const reqStart = Date.now();
      try {
        const res = await fetch(`${params.baseUrl}/api/teams/${testTeam.id}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${c.token}`,
          },
          body: JSON.stringify({ requestedRole: 'Backend Developer' }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        return {
          requestIndex: index + 1,
          email: c.email,
          status: res.status,
          success: res.ok,
          code: body.code || (res.ok ? 'JOINED' : 'REJECTED'),
          message: body.error || (res.ok ? 'Seat allocated via FOR UPDATE lock' : 'Rejected'),
          latencyMs: Date.now() - reqStart,
        };
      } catch (err: unknown) {
        return {
          requestIndex: index + 1,
          email: c.email,
          status: 500,
          success: false,
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Request failed',
          latencyMs: Date.now() - reqStart,
        };
      }
    })
  );

  const durationMs = Date.now() - startedAt;

  // Query authoritative PostgreSQL count after all 50 requests settle
  const [{ cnt: finalCount }] = await db
    .select({ cnt: count() })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, testTeam.id));

  const successful = responses.filter((r) => r.success);
  const rejected = responses.filter((r) => !r.success);
  const finalMembers = Number(finalCount);
  const overbooking = Math.max(0, finalMembers - testTeam.maxCapacity);

  await db.insert(auditLogs).values({
    actorId: params.adminUserId,
    action: 'CONCURRENCY_TEST_EXECUTED',
    entityType: 'TEAM',
    entityId: testTeam.id,
    metadata: {
      concurrentRequests: contenders.length,
      successfulJoins: successful.length,
      rejectedJoins: rejected.length,
      finalMembers,
      overbooking,
      durationMs,
    },
  });

  return {
    teamId: testTeam.id,
    teamName: testTeam.name,
    maxCapacity: testTeam.maxCapacity,
    initialMembers: Number(initialCount),
    availableSeatsBefore: Math.max(0, testTeam.maxCapacity - Number(initialCount)),
    concurrentRequests: contenders.length,
    successfulJoins: successful.length,
    rejectedJoins: rejected.length,
    finalMembers,
    overbooking,
    durationMs,
    winningParticipant: successful[0]?.email ?? null,
    results: responses,
  };
}
