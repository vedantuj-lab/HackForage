import { Router } from 'express';
import { db } from '../../db/index.ts';
import {
  notifications,
  profiles,
  skills,
  teamMembers,
  teams,
  userSkills,
  users,
} from '../../db/schema.ts';
import { and, desc, eq, inArray, notLike } from 'drizzle-orm';
import { AuthRequest, requireAuth } from '../auth.ts';
import { recalculateCompatibilityForUser, computeCompatibilityScores } from '../engines/compatibility.ts';
import { recalculateAndPersistTeamHealth } from '../engines/teamHealth.ts';
import { teamRequirements } from '../../db/schema.ts';
import { computeProfileCompletion, sanitizeFullName } from '../services/profileCompletion.ts';

const router = Router();

router.get('/skills', requireAuth, async (_req, res) => {
  const list = await db.select().from(skills).orderBy(skills.category, skills.name);
  return res.json({ skills: list });
});

router.post('/skills', requireAuth, async (req: AuthRequest, res) => {
  const { name, category } = req.body as { name?: string; category?: string };
  if (!name?.trim() || name.trim().length > 40) {
    return res.status(400).json({ error: 'Skill name (1-40 chars) is required.' });
  }
  const cleanName = name.trim();
  const [existing] = await db.select().from(skills).where(eq(skills.name, cleanName)).limit(1);
  if (existing) {
    return res.json({ skill: existing });
  }

  const allowedCategories = ['Frontend', 'Backend', 'Database', 'AI/ML', 'Design', 'Cloud', 'Other'];
  const cleanCat = category && allowedCategories.includes(category) ? category : 'Other';

  const [created] = await db
    .insert(skills)
    .values({ name: cleanName, category: cleanCat, isCustom: true })
    .returning();
  return res.status(201).json({ skill: created });
});

async function getFullUserProfile(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  let [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const uSkills = await db
    .select({
      id: skills.id,
      name: skills.name,
      category: skills.category,
      proficiency: userSkills.proficiency,
    })
    .from(userSkills)
    .innerJoin(skills, eq(userSkills.skillId, skills.id))
    .where(eq(userSkills.userId, userId));

  const memberships = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      teamRole: teamMembers.teamRole,
      isLeader: teamMembers.isLeader,
      category: teams.category,
      maxCapacity: teams.maxCapacity,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teamMembers.userId, userId), eq(teams.status, 'ACTIVE')));

  const cleanFullName = sanitizeFullName(user.fullName, user.email);
  const completion = computeProfileCompletion({
    fullName: cleanFullName,
    institution: user.institution,
    location: user.location,
    bio: profile?.bio ?? '',
    experienceLevel: profile?.experienceLevel ?? 'Intermediate',
    preferredRole: profile?.preferredRole ?? 'Full-Stack Developer',
    collaborationMode: profile?.collaborationMode ?? 'Hybrid',
    projectInterests: profile?.projectInterests ?? [],
    skillCount: uSkills.length,
  });

  if (profile && profile.completionPct !== completion.completionPct) {
    const [synced] = await db
      .update(profiles)
      .set({ completionPct: completion.completionPct, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning();
    if (synced) profile = synced;
  } else if (!profile) {
    const [created] = await db
      .insert(profiles)
      .values({ userId, completionPct: completion.completionPct })
      .onConflictDoNothing()
      .returning();
    profile = created;
  }

  return {
    id: user.id,
    email: user.email,
    fullName: cleanFullName,
    role: user.role,
    status: user.status,
    institution: user.institution,
    location: user.location,
    createdAt: user.createdAt,
    profile: profile ? { ...profile, completionPct: completion.completionPct } : null,
    completionPct: completion.completionPct,
    completionChecklist: completion.checklist,
    skills: uSkills,
    teams: memberships,
  };
}

router.get('/users/profile', requireAuth, async (req: AuthRequest, res) => {
  const full = await getFullUserProfile(req.authUser!.id);
  return res.json({ profile: full });
});

router.put('/users/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const {
      fullName,
      institution,
      location,
      bio,
      avatarUrl,
      experienceLevel,
      preferredRole,
      projectInterests,
      collaborationMode,
      skillIds,
    } = req.body as {
      fullName?: string;
      institution?: string;
      location?: string;
      bio?: string;
      avatarUrl?: string;
      experienceLevel?: string;
      preferredRole?: string;
      projectInterests?: string[];
      collaborationMode?: string;
      skillIds?: string[];
    };

    const [currentUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!currentUser) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const nextFullName = fullName?.trim()
      ? sanitizeFullName(fullName, currentUser.email)
      : sanitizeFullName(currentUser.fullName, currentUser.email);
    const nextInstitution = institution !== undefined ? institution.trim() : currentUser.institution;
    const nextLocation = location !== undefined ? location.trim() : currentUser.location;

    if (
      nextFullName !== currentUser.fullName ||
      nextInstitution !== currentUser.institution ||
      nextLocation !== currentUser.location
    ) {
      await db
        .update(users)
        .set({
          fullName: nextFullName,
          institution: nextInstitution,
          location: nextLocation,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    const [currentProfile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    const nextBio = bio !== undefined ? bio.trim() : currentProfile?.bio ?? '';
    const nextExp = experienceLevel || currentProfile?.experienceLevel || 'Intermediate';
    const nextRole = preferredRole || currentProfile?.preferredRole || 'Full-Stack Developer';
    const nextInterests = Array.isArray(projectInterests)
      ? Array.from(new Set(projectInterests.map((i) => i.trim()).filter(Boolean)))
      : currentProfile?.projectInterests ?? [];
    const nextCollab = collaborationMode || currentProfile?.collaborationMode || 'Hybrid';
    const nextAvatar = avatarUrl !== undefined ? avatarUrl.trim() : currentProfile?.avatarUrl ?? '';

    if (Array.isArray(skillIds)) {
      const candidateSkillIds = Array.from(new Set(skillIds.filter((s) => typeof s === 'string' && s.trim().length > 0)));
      let validSkillIds: string[] = [];
      if (candidateSkillIds.length > 0) {
        const existingSkills = await db
          .select({ id: skills.id })
          .from(skills)
          .where(inArray(skills.id, candidateSkillIds));
        validSkillIds = existingSkills.map((s) => s.id);
      }

      await db.transaction(async (tx) => {
        await tx.delete(userSkills).where(eq(userSkills.userId, userId));
        if (validSkillIds.length > 0) {
          await tx
            .insert(userSkills)
            .values(validSkillIds.map((skillId) => ({ userId, skillId, proficiency: 4 })))
            .onConflictDoNothing();
        }
      });
    }

    const currentSkills = await db
      .select({ id: userSkills.skillId })
      .from(userSkills)
      .where(eq(userSkills.userId, userId));

    const { completionPct } = computeProfileCompletion({
      fullName: nextFullName,
      institution: nextInstitution,
      location: nextLocation,
      bio: nextBio,
      experienceLevel: nextExp,
      preferredRole: nextRole,
      collaborationMode: nextCollab,
      projectInterests: nextInterests,
      skillCount: currentSkills.length,
    });

    await db
      .insert(profiles)
      .values({
        userId,
        bio: nextBio,
        avatarUrl: nextAvatar,
        experienceLevel: nextExp,
        preferredRole: nextRole,
        projectInterests: nextInterests,
        collaborationMode: nextCollab,
        completionPct,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          bio: nextBio,
          avatarUrl: nextAvatar,
          experienceLevel: nextExp,
          preferredRole: nextRole,
          projectInterests: nextInterests,
          collaborationMode: nextCollab,
          completionPct,
          updatedAt: new Date(),
        },
      });

    // Recalculate compatibility scores and any teams the user belongs to
    await recalculateCompatibilityForUser(userId);
    const memberships = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));
    for (const m of memberships) {
      await recalculateAndPersistTeamHealth(m.teamId);
    }

    const updated = await getFullUserProfile(userId);
    return res.json({ profile: updated });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ error: 'Failed to update participant profile.' });
  }
});

router.get('/users', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { search, role, experience, teamId } = req.query as {
      search?: string;
      role?: string;
      experience?: string;
      teamId?: string;
    };

    const userRows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        institution: users.institution,
        location: users.location,
        status: users.status,
      })
      .from(users)
      .where(and(eq(users.status, 'ACTIVE'), notLike(users.email, '%@hackforge.test')));

    const userIds = userRows.map((u) => u.id);
    if (userIds.length === 0) return res.json({ users: [] });

    const profRows = await db.select().from(profiles).where(inArray(profiles.userId, userIds));
    const profMap = new Map(profRows.map((p) => [p.userId, p]));

    const skillRows = await db
      .select({
        userId: userSkills.userId,
        name: skills.name,
        category: skills.category,
      })
      .from(userSkills)
      .innerJoin(skills, eq(userSkills.skillId, skills.id))
      .where(inArray(userSkills.userId, userIds));

    const skillMap = new Map<string, string[]>();
    for (const sr of skillRows) {
      const list = skillMap.get(sr.userId) || [];
      list.push(sr.name);
      skillMap.set(sr.userId, list);
    }

    const memberRows = await db
      .select({ userId: teamMembers.userId, teamId: teamMembers.teamId, teamName: teams.name })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(and(inArray(teamMembers.userId, userIds), eq(teams.status, 'ACTIVE'), eq(teams.isTestTeam, false)));

    const userTeamMap = new Map<string, { teamId: string; teamName: string }>();
    for (const mr of memberRows) {
      userTeamMap.set(mr.userId, { teamId: mr.teamId, teamName: mr.teamName });
    }

    // Optional compatibility context against a target team
    let targetTeamCtx: {
      teamId: string;
      category: string;
      experienceRequirement: string;
      collaborationMode: string;
      requiredSkills: string[];
      requiredRoles: string[];
      currentMemberRoles: string[];
    } | null = null;

    if (teamId) {
      const [t] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
      if (t) {
        const [reqs] = await db.select().from(teamRequirements).where(eq(teamRequirements.teamId, teamId)).limit(1);
        const curMembers = await db
          .select({ teamRole: teamMembers.teamRole })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, teamId));
        targetTeamCtx = {
          teamId: t.id,
          category: t.category,
          experienceRequirement: reqs?.minExperience ?? t.experienceRequirement,
          collaborationMode: t.collaborationMode,
          requiredSkills: reqs?.requiredSkills ?? [],
          requiredRoles: reqs?.requiredRoles ?? [],
          currentMemberRoles: curMembers.map((m) => m.teamRole),
        };
      }
    }

    let results = userRows
      .filter((u) => u.id !== req.authUser!.id && u.role !== 'ADMIN')
      .map((u) => {
        const p = profMap.get(u.id);
        const uSkills = skillMap.get(u.id) || [];
        const currentTeam = userTeamMap.get(u.id) || null;
        const compat = targetTeamCtx
          ? computeCompatibilityScores({
              userId: u.id,
              teamId: targetTeamCtx.teamId,
              userSkillNames: uSkills,
              preferredRole: p?.preferredRole ?? 'Full-Stack Developer',
              experienceLevel: p?.experienceLevel ?? 'Intermediate',
              projectInterests: p?.projectInterests ?? [],
              userCollabMode: p?.collaborationMode ?? 'Hybrid',
              requiredSkills: targetTeamCtx.requiredSkills,
              requiredRoles: targetTeamCtx.requiredRoles,
              currentMemberRoles: targetTeamCtx.currentMemberRoles,
              teamCategory: targetTeamCtx.category,
              teamExperienceReq: targetTeamCtx.experienceRequirement,
              teamCollabMode: targetTeamCtx.collaborationMode,
            })
          : null;

        return {
          id: u.id,
          fullName: sanitizeFullName(u.fullName, u.email),
          email: u.email,
          institution: u.institution,
          location: u.location,
          avatarUrl: p?.avatarUrl || '',
          bio: p?.bio || '',
          experienceLevel: p?.experienceLevel || 'Intermediate',
          preferredRole: p?.preferredRole || 'Full-Stack Developer',
          projectInterests: p?.projectInterests || [],
          collaborationMode: p?.collaborationMode || 'Hybrid',
          skills: uSkills,
          currentTeam,
          compatibility: compat,
        };
      });

    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      results = results.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.preferredRole.toLowerCase().includes(q) ||
          r.skills.some((s) => s.toLowerCase().includes(q)) ||
          r.institution.toLowerCase().includes(q)
      );
    }
    if (role && role !== 'ALL') {
      results = results.filter((r) => r.preferredRole === role);
    }
    if (experience && experience !== 'ALL') {
      results = results.filter((r) => r.experienceLevel === experience);
    }

    if (targetTeamCtx) {
      results.sort((a, b) => (b.compatibility?.overallScore ?? 0) - (a.compatibility?.overallScore ?? 0));
    }

    return res.json({ users: results });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Failed to fetch participants.' });
  }
});

router.get('/users/:id', requireAuth, async (req, res) => {
  const full = await getFullUserProfile(String(req.params.id));
  if (!full) return res.status(404).json({ error: 'Participant not found.' });
  return res.json({ user: full });
});

router.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
  const list = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, req.authUser!.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  const unreadCount = list.filter((n) => !n.isRead).length;
  return res.json({ notifications: list, unreadCount });
});

router.patch('/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, String(req.params.id)), eq(notifications.userId, req.authUser!.id)))
    .returning();
  return res.json({ notification: updated ?? null });
});

router.post('/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, req.authUser!.id));
  return res.json({ success: true });
});

export default router;
