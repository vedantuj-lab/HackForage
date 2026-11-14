import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { computeCompatibilityScores } from '../src/server/engines/compatibility.ts';
import { computeTeamHealthScores } from '../src/server/engines/teamHealth.ts';
import { computeProfileCompletion, sanitizeFullName } from '../src/server/services/profileCompletion.ts';
import { createHackForgeApp } from '../server.ts';
import { db, pool } from '../src/db/index.ts';
import { auditLogs, profiles, teamMembers, teamRequirements, teamHealth, teams, userSkills, users, waitlistEntries, invitations, notifications, compatibilityScores, leadershipHistory } from '../src/db/schema.ts';
import { eq, like, inArray } from 'drizzle-orm';

let server: http.Server;
let baseUrl = '';
let adminToken = '';
let leaderToken = '';
let p1Token = '';
let p2Token = '';

async function api(path: string, opts: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

describe('HackForge Core Engines & Full-Stack Integration Suite', () => {
  before(async () => {
    const { httpServer } = await createHackForgeApp({ skipVite: true });
    server = httpServer;
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    try {
      const ephemeralUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(like(users.email, 'test_builder_%@slrtce.edu'));
      const euIds = ephemeralUsers.map((u) => u.id);
      if (euIds.length > 0) {
        await db.delete(auditLogs).where(inArray(auditLogs.actorId, euIds));
        await db.delete(notifications).where(inArray(notifications.userId, euIds));
        await db.delete(userSkills).where(inArray(userSkills.userId, euIds));
        await db.delete(profiles).where(inArray(profiles.userId, euIds));
        await db.delete(users).where(inArray(users.id, euIds));
      }

      const verifyTeams = await db
        .select({ id: teams.id })
        .from(teams)
        .where(like(teams.name, 'VerifySquad %'));
      const vtIds = verifyTeams.map((t) => t.id);
      if (vtIds.length > 0) {
        await db.delete(compatibilityScores).where(inArray(compatibilityScores.teamId, vtIds));
        await db.delete(leadershipHistory).where(inArray(leadershipHistory.teamId, vtIds));
        await db.delete(waitlistEntries).where(inArray(waitlistEntries.teamId, vtIds));
        await db.delete(invitations).where(inArray(invitations.teamId, vtIds));
        await db.delete(teamMembers).where(inArray(teamMembers.teamId, vtIds));
        await db.delete(teamHealth).where(inArray(teamHealth.teamId, vtIds));
        await db.delete(teamRequirements).where(inArray(teamRequirements.teamId, vtIds));
        await db.delete(teams).where(inArray(teams.id, vtIds));
      }

      // Restore seeded demo account role altered by automatic leadership succession test 26
      await db
        .update(users)
        .set({ role: 'PARTICIPANT' })
        .where(eq(users.email, 'participant1@hackforge.demo'));
    } catch {
      // ignore cleanup failures
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });

  // 1-6: Compatibility Engine Deterministic Formula Tests
  describe('Compatibility Engine (35/25/15/15/10)', () => {
    it('01. scores 100% when all five dimensions match perfectly', () => {
      const res = computeCompatibilityScores({
        userId: 'u1',
        teamId: 't1',
        userSkillNames: ['React', 'Node.js', 'PostgreSQL'],
        preferredRole: 'AI/ML Developer',
        experienceLevel: 'Intermediate',
        projectInterests: ['Artificial Intelligence'],
        userCollabMode: 'Hybrid',
        requiredSkills: ['React', 'Node.js', 'PostgreSQL'],
        requiredRoles: ['Frontend Developer', 'AI/ML Developer'],
        currentMemberRoles: ['Frontend Developer'],
        teamCategory: 'Artificial Intelligence',
        teamExperienceReq: 'Intermediate',
        teamCollabMode: 'Hybrid',
      });
      assert.equal(res.overallScore, 100);
      assert.equal(res.skillScore, 100);
      assert.equal(res.roleScore, 100);
      assert.equal(res.experienceScore, 100);
      assert.equal(res.interestScore, 100);
      assert.equal(res.collaborationScore, 100);
    });

    it('02. detects missing skills and complementary roles accurately', () => {
      const res = computeCompatibilityScores({
        userId: 'u2',
        teamId: 't1',
        userSkillNames: ['Python', 'TensorFlow'],
        preferredRole: 'AI/ML Developer',
        experienceLevel: 'Advanced',
        projectInterests: ['Healthcare'],
        userCollabMode: 'Remote',
        requiredSkills: ['Python', 'TensorFlow', 'Figma', 'React'],
        requiredRoles: ['Frontend Developer', 'AI/ML Developer', 'UI/UX Designer'],
        currentMemberRoles: ['Frontend Developer'],
        teamCategory: 'Healthcare',
        teamExperienceReq: 'Intermediate',
        teamCollabMode: 'Hybrid',
      });
      assert.deepEqual(res.matchingSkills, ['Python', 'TensorFlow']);
      assert.deepEqual(res.missingSkills, ['Figma', 'React']);
      assert.deepEqual(res.complementaryRoles, ['AI/ML Developer']);
      assert.equal(res.roleScore, 100);
      assert.ok(res.overallScore > 70 && res.overallScore < 95);
    });

    it('03. penalizes saturated duplicate roles appropriately', () => {
      const res = computeCompatibilityScores({
        userId: 'u3',
        teamId: 't1',
        userSkillNames: ['React'],
        preferredRole: 'Frontend Developer',
        experienceLevel: 'Beginner',
        projectInterests: ['Agriculture'],
        userCollabMode: 'Remote',
        requiredSkills: ['Python', 'PostgreSQL'],
        requiredRoles: ['AI/ML Developer'],
        currentMemberRoles: ['Frontend Developer', 'Frontend Developer'],
        teamCategory: 'Cybersecurity',
        teamExperienceReq: 'Expert',
        teamCollabMode: 'On-site',
      });
      assert.equal(res.roleScore, 35);
      assert.equal(res.collaborationScore, 30);
      assert.ok(res.overallScore < 45);
    });

    it('04. handles flexible collaboration mode as 100%', () => {
      const res = computeCompatibilityScores({
        userId: 'u4',
        teamId: 't1',
        userSkillNames: ['Node.js'],
        preferredRole: 'Backend Developer',
        experienceLevel: 'Intermediate',
        projectInterests: ['FinTech'],
        userCollabMode: 'Flexible',
        requiredSkills: ['Node.js'],
        requiredRoles: ['Backend Developer'],
        currentMemberRoles: [],
        teamCategory: 'FinTech',
        teamExperienceReq: 'Intermediate',
        teamCollabMode: 'On-site',
      });
      assert.equal(res.collaborationScore, 100);
      assert.ok(Array.isArray(res.complementarySkills));
      assert.ok(typeof res.suggestedContribution === 'string' && res.suggestedContribution.length > 10);
    });

    it('04b. sanitizes numeric prefixes from display names and computes profile completion checklist accurately', () => {
      assert.equal(sanitizeFullName('137 Vedant Dalvi', 'vedantuj@gmail.com'), 'Vedant Dalvi');
      assert.equal(sanitizeFullName('Aarav Mehta', 'aarav@demo.edu'), 'Aarav Mehta');

      const low = computeProfileCompletion({
        fullName: 'Vedant Dalvi',
        institution: '',
        location: '',
        bio: '',
        experienceLevel: 'Intermediate',
        preferredRole: 'Full-Stack Developer',
        collaborationMode: 'Hybrid',
        projectInterests: [],
        skillCount: 0,
      });
      assert.equal(low.completionPct, 30);
      assert.equal(low.checklist.length, 6);
      assert.equal(low.checklist.find((c) => c.id === 'skills')?.completed, false);

      const full = computeProfileCompletion({
        fullName: 'Vedant Dalvi',
        institution: 'SLRTCE',
        location: 'Mumbai',
        bio: 'Full-stack engineer building distributed real-time applications.',
        experienceLevel: 'Advanced',
        preferredRole: 'Full-Stack Developer',
        collaborationMode: 'Hybrid',
        projectInterests: ['Artificial Intelligence'],
        skillCount: 4,
      });
      assert.equal(full.completionPct, 100);
      assert.ok(full.checklist.every((c) => c.completed));
    });
  });

  // 5-8: Team Health Engine Deterministic Formula Tests
  describe('Team Health Engine (35/30/15/10/10)', () => {
    it('05. flags missing AI/ML, UI/UX, and Presenter roles in Team Alpha scenario (~58/100)', () => {
      const res = computeTeamHealthScores({
        teamId: 'alpha',
        maxCapacity: 5,
        hasPrimaryLeader: true,
        hasSecondaryLeader: false,
        memberCount: 4,
        memberRoles: ['Frontend Developer', 'Frontend Developer', 'Backend Developer', 'Backend Developer'],
        memberExperienceLevels: ['Intermediate', 'Advanced'],
        memberSkillNames: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'HTML'],
        requiredSkills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Python', 'TensorFlow', 'Figma', 'UI/UX'],
        requiredRoles: ['Frontend Developer', 'Backend Developer', 'AI/ML Developer', 'UI/UX Designer', 'Presenter'],
      });
      assert.equal(res.statusLabel, 'Needs Improvement');
      assert.ok(res.overallScore >= 50 && res.overallScore <= 65);
      assert.deepEqual(res.missingRoles, ['AI/ML Developer', 'UI/UX Designer', 'Presenter']);
      assert.ok(res.recommendations.length >= 3);
    });

    it('06. scores Optimal when all skills, roles, diversity, and dual leadership are present', () => {
      const res = computeTeamHealthScores({
        teamId: 'opt',
        maxCapacity: 5,
        hasPrimaryLeader: true,
        hasSecondaryLeader: true,
        memberCount: 5,
        memberRoles: ['Frontend Developer', 'Backend Developer', 'AI/ML Developer', 'UI/UX Designer', 'Presenter'],
        memberExperienceLevels: ['Intermediate', 'Advanced', 'Expert'],
        memberSkillNames: ['React', 'Node.js', 'PostgreSQL', 'Python', 'Figma'],
        requiredSkills: ['React', 'Node.js', 'PostgreSQL', 'Python', 'Figma'],
        requiredRoles: ['Frontend Developer', 'Backend Developer', 'AI/ML Developer', 'UI/UX Designer', 'Presenter'],
      });
      assert.equal(res.statusLabel, 'Optimal');
      assert.ok(res.overallScore >= 95);
      assert.equal(res.missingRoles.length, 0);
    });

    it('07. returns Critical 0/100 when memberCount is 0', () => {
      const res = computeTeamHealthScores({
        teamId: 'empty',
        maxCapacity: 5,
        hasPrimaryLeader: false,
        hasSecondaryLeader: false,
        memberCount: 0,
        memberRoles: [],
        memberExperienceLevels: [],
        memberSkillNames: [],
        requiredSkills: ['React'],
        requiredRoles: ['Frontend Developer'],
      });
      assert.equal(res.overallScore, 0);
      assert.equal(res.statusLabel, 'Critical');
    });
  });

  // 8-15: Authentication & RBAC Integration Tests
  describe('Authentication & Role-Based Authorization', () => {
    const uniqueEmail = `test_builder_${Date.now()}@slrtce.edu`;

    it('08. health check responds ok', async () => {
      const res = await api('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });

    it('09. registers a new public user strictly with PARTICIPANT role', async () => {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Test Builder',
          email: uniqueEmail,
          password: 'Password@2026',
          institution: 'SLRTCE',
          location: 'Mumbai',
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.user.role, 'PARTICIPANT');
      assert.ok(res.body.accessToken);
    });

    it('10. rejects duplicate email registration with 409', async () => {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Duplicate',
          email: uniqueEmail,
          password: 'Password@2026',
        }),
      });
      assert.equal(res.status, 409);
    });

    it('11. logs in seeded demo accounts (admin, leader, participant1, participant2)', async () => {
      const a = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@hackforge.demo', password: 'HackForge@2026' }),
      });
      assert.equal(a.status, 200);
      assert.equal(a.body.user.role, 'ADMIN');
      adminToken = a.body.accessToken;

      const l = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'leader@hackforge.demo', password: 'HackForge@2026' }),
      });
      assert.equal(l.status, 200);
      assert.equal(l.body.user.role, 'TEAM_LEADER');
      leaderToken = l.body.accessToken;

      const p1 = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'participant1@hackforge.demo', password: 'HackForge@2026' }),
      });
      assert.equal(p1.status, 200);
      p1Token = p1.body.accessToken;

      const p2 = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'participant2@hackforge.demo', password: 'HackForge@2026' }),
      });
      assert.equal(p2.status, 200);
      p2Token = p2.body.accessToken;
    });

    it('12. rejects invalid password with 401', async () => {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'participant1@hackforge.demo', password: 'WrongPassword!' }),
      });
      assert.equal(res.status, 401);
    });

    it('13. rejects unauthenticated access to protected routes with 401', async () => {
      const res = await api('/api/users/profile');
      assert.equal(res.status, 401);
    });

    it('14. blocks PARTICIPANT from accessing ADMIN endpoints with 403', async () => {
      const res = await api('/api/admin/dashboard', {}, p1Token);
      assert.equal(res.status, 403);
    });

    it('15. blocks TEAM_LEADER from accessing ADMIN endpoints with 403', async () => {
      const res = await api('/api/admin/fairness', {}, leaderToken);
      assert.equal(res.status, 403);
    });
  });

  // 16-20: Profile, Skills & Compatibility API Tests
  describe('Participant Profiles, Skills & Compatibility API', () => {
    it('16. fetches authenticated participant profile, checklist, and skills', async () => {
      const res = await api('/api/users/profile', {}, p1Token);
      assert.equal(res.status, 200);
      assert.ok(res.body.profile.skills.length >= 3);
      assert.ok(Array.isArray(res.body.profile.completionChecklist));
      assert.equal(res.body.profile.completionChecklist.length, 6);
      assert.ok(res.body.profile.completionPct >= 60);
    });

    it('17. persists skill selection round-trip and updates profile completion in PostgreSQL', async () => {
      const initial = await api('/api/users/profile', {}, p1Token);
      const originalSkillIds = initial.body.profile.skills.map((s: any) => s.id);
      const skillRes = await api(
        '/api/skills',
        { method: 'POST', body: JSON.stringify({ name: 'Drizzle ORM', category: 'Database' }) },
        p1Token
      );
      assert.ok(skillRes.ok);
      const addedSkillId = skillRes.body.skill.id;
      const mergedIds = Array.from(new Set([...originalSkillIds, addedSkillId]));

      const updRes = await api(
        '/api/users/profile',
        {
          method: 'PUT',
          body: JSON.stringify({
            bio: 'Updated AI/ML + PostgreSQL builder bio.',
            skillIds: mergedIds,
          }),
        },
        p1Token
      );
      assert.equal(updRes.status, 200);
      assert.equal(updRes.body.profile.profile.bio, 'Updated AI/ML + PostgreSQL builder bio.');
      assert.ok(updRes.body.profile.skills.some((s: any) => s.id === addedSkillId));

      // Re-fetch to verify PostgreSQL persistence
      const reloadRes = await api('/api/users/profile', {}, p1Token);
      assert.ok(reloadRes.body.profile.skills.some((s: any) => s.id === addedSkillId));
    });

    it('18. retrieves ranked team compatibility recommendations with complementary skills', async () => {
      const me = await api('/api/auth/me', {}, p1Token);
      const res = await api(`/api/compatibility/users/${me.body.user.id}`, {}, p1Token);
      assert.equal(res.status, 200);
      assert.ok(res.body.recommendations.length >= 5);
      const first = res.body.recommendations[0];
      const second = res.body.recommendations[1];
      assert.ok(first.overallScore >= second.overallScore);
      assert.ok(Array.isArray(first.complementarySkills));
      assert.ok(typeof first.suggestedContribution === 'string');
    });

    it('18b. leader team detail endpoint returns Team Alpha roster, requirements, and health', async () => {
      const listRes = await api('/api/teams', {}, leaderToken);
      assert.equal(listRes.status, 200);
      const alpha = listRes.body.teams.find((t: any) => t.name === 'Team Alpha');
      assert.ok(alpha);
      const detailRes = await api(`/api/teams/${alpha.id}`, {}, leaderToken);
      assert.equal(detailRes.status, 200);
      assert.equal(detailRes.body.team.name, 'Team Alpha');
      assert.ok(detailRes.body.team.members.length >= 1);
      assert.ok(detailRes.body.team.health);
    });
  });

  // 19-28: Teams, Waitlist, Leadership Succession & Race-Proof Locking
  describe('Team Lifecycle, Waitlist, Leadership & Race-Proof Locking', () => {
    let createdTeamId = '';
    let p1Id = '';
    let p2Id = '';

    it('19. resolves participant IDs', async () => {
      const r1 = await api('/api/auth/me', {}, p1Token);
      const r2 = await api('/api/auth/me', {}, p2Token);
      p1Id = r1.body.user.id;
      p2Id = r2.body.user.id;
      assert.ok(p1Id && p2Id);
    });

    it('20. creates a team with capacity 2 and auto-seats creator as primary leader', async () => {
      const res = await api(
        '/api/teams',
        {
          method: 'POST',
          body: JSON.stringify({
            name: `VerifySquad ${Date.now()}`,
            description: 'Integration test squad verifying capacity, waitlist, and succession.',
            category: 'Artificial Intelligence',
            maxCapacity: 2,
            requiredSkills: ['Python', 'React'],
            requiredRoles: ['Backend Developer', 'AI/ML Developer'],
          }),
        },
        leaderToken
      );
      assert.equal(res.status, 201);
      createdTeamId = res.body.team.id;
      assert.equal(res.body.team.memberCount, 1);
      assert.equal(res.body.team.availableSeats, 1);
    });

    it('21. allows participant 1 to join open seat atomically', async () => {
      const res = await api(
        `/api/teams/${createdTeamId}/join`,
        { method: 'POST', body: JSON.stringify({ requestedRole: 'AI/ML Developer' }) },
        p1Token
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.newMemberCount, 2);
    });

    it('22. prevents duplicate membership for the same user', async () => {
      const res = await api(
        `/api/teams/${createdTeamId}/join`,
        { method: 'POST', body: JSON.stringify({}) },
        p1Token
      );
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'ALREADY_MEMBER');
    });

    it('23. prevents overbooking when participant 2 attempts to join full team', async () => {
      const res = await api(
        `/api/teams/${createdTeamId}/join`,
        { method: 'POST', body: JSON.stringify({}) },
        p2Token
      );
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'TEAM_FULL');
    });

    it('24. places participant 2 onto Smart Waitlist and prevents duplicate waitlist entries', async () => {
      const wl1 = await api(`/api/teams/${createdTeamId}/waitlist`, { method: 'POST' }, p2Token);
      assert.equal(wl1.status, 201);
      assert.equal(wl1.body.entry.queuePosition, 1);

      const wlDup = await api(`/api/teams/${createdTeamId}/waitlist`, { method: 'POST' }, p2Token);
      assert.equal(wlDup.status, 409);
    });

    it('25. assigns secondary leader and records leadership history', async () => {
      const res = await api(
        `/api/teams/${createdTeamId}/leadership/secondary`,
        { method: 'POST', body: JSON.stringify({ targetUserId: p1Id }) },
        leaderToken
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.team.secondaryLeaderId, p1Id);
    });

    it('26. executes automatic leadership succession AND triggers Smart Waitlist invitation when primary leader leaves', async () => {
      const leaveRes = await api(`/api/teams/${createdTeamId}/leave`, { method: 'POST' }, leaderToken);
      assert.equal(leaveRes.status, 200);
      assert.equal(leaveRes.body.successorId, p1Id);

      const detailRes = await api(`/api/teams/${createdTeamId}`, {}, p1Token);
      assert.equal(detailRes.body.team.primaryLeaderId, p1Id);

      const wlRes = await api(`/api/teams/${createdTeamId}/waitlist`, {}, p1Token);
      assert.equal(wlRes.body.waitlist[0].status, 'INVITED');
    });

    it('27. waitlisted participant 2 accepts open seat via atomic SELECT FOR UPDATE lock', async () => {
      const myWl = await api('/api/waitlist/me', {}, p2Token);
      const entry = myWl.body.entries.find((e: any) => e.teamId === createdTeamId);
      assert.ok(entry);
      const acc = await api(`/api/waitlist/${entry.id}/accept`, { method: 'POST' }, p2Token);
      assert.equal(acc.status, 200);
      assert.equal(acc.body.success, true);

      // Clean up test team
      await api(`/api/teams/${createdTeamId}`, { method: 'DELETE' }, adminToken);
    });
  });

  // 28-31: 50-User Simultaneous Concurrency Blast & Admin Audit Verification
  describe('Race-Proof 50-User Simultaneous Concurrency Verification & Admin Analytics', () => {
    it('28. executes 50 simultaneous HTTP join requests for 1 open seat with exactly 1 winner and 0 overbooking', async () => {
      const stateRes = await api('/api/admin/concurrency-test/state', {}, adminToken);
      assert.equal(stateRes.status, 200);
      assert.equal(stateRes.body.maxCapacity, 5);
      assert.equal(stateRes.body.currentMembers, 4);
      assert.equal(stateRes.body.availableSeats, 1);

      const res = await api('/api/admin/concurrency-test', { method: 'POST' }, adminToken);
      assert.equal(res.status, 200);
      const report = res.body.report;
      assert.equal(report.concurrentRequests, 50);
      assert.equal(report.successfulJoins, 1);
      assert.equal(report.rejectedJoins, 49);
      assert.equal(report.finalMembers, 5);
      assert.equal(report.overbooking, 0);
    });

    it('29. admin dashboard returns real PostgreSQL platform metrics', async () => {
      const res = await api('/api/admin/dashboard', {}, adminToken);
      assert.equal(res.status, 200);
      assert.ok(res.body.metrics.totalParticipants >= 25);
      assert.ok(res.body.metrics.activeTeams >= 8);
    });

    it('30. fairness dashboard returns waitlist, invitation, and skill analytics', async () => {
      const res = await api('/api/admin/fairness', {}, adminToken);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.fairness.skillDistribution));
      assert.ok(Array.isArray(res.body.fairness.compatibilityDistribution));
    });

    it('31. audit logs record concurrency tests, registrations, and memberships', async () => {
      const res = await api('/api/admin/audit-logs', {}, adminToken);
      assert.equal(res.status, 200);
      assert.ok(res.body.logs.some((l: any) => l.action === 'CONCURRENCY_TEST_EXECUTED'));
    });
  });
});
