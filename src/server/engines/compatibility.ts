import { db } from '../../db/index.ts';
import {
  compatibilityScores,
  eventSettings,
  profiles,
  skills,
  teamMembers,
  teamRequirements,
  teams,
  userSkills,
  users,
} from '../../db/schema.ts';
import { and, eq, inArray, notLike } from 'drizzle-orm';

const EXPERIENCE_RANK: Record<string, number> = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
  Expert: 4,
};

const RELATED_CATEGORIES: Record<string, string[]> = {
  'Artificial Intelligence': ['Healthcare', 'FinTech', 'Education', 'Smart Cities', 'Cybersecurity'],
  Healthcare: ['Artificial Intelligence', 'Sustainability'],
  FinTech: ['Artificial Intelligence', 'Cybersecurity'],
  Education: ['Artificial Intelligence', 'Sustainability'],
  Cybersecurity: ['FinTech', 'Artificial Intelligence', 'Smart Cities'],
  Sustainability: ['Smart Cities', 'Agriculture', 'Healthcare'],
  'Smart Cities': ['Sustainability', 'Artificial Intelligence', 'Cybersecurity'],
  Agriculture: ['Sustainability', 'Artificial Intelligence'],
};

const ROLE_ADJACENCY: Record<string, string[]> = {
  'Full-Stack Developer': ['Frontend Developer', 'Backend Developer'],
  'Frontend Developer': ['Full-Stack Developer', 'UI/UX Designer'],
  'Backend Developer': ['Full-Stack Developer', 'Data Analyst'],
  'AI/ML Developer': ['Data Analyst', 'Researcher', 'Backend Developer'],
  'Data Analyst': ['AI/ML Developer', 'Researcher'],
  'UI/UX Designer': ['Frontend Developer', 'Presenter'],
  'Project Manager': ['Presenter', 'Researcher'],
  Presenter: ['Project Manager', 'UI/UX Designer'],
  Researcher: ['Data Analyst', 'AI/ML Developer', 'Presenter'],
};

const SKILL_CATEGORY_FALLBACK: Record<string, string> = {
  html: 'Frontend',
  css: 'Frontend',
  javascript: 'Frontend',
  typescript: 'Frontend',
  react: 'Frontend',
  angular: 'Frontend',
  vue: 'Frontend',
  'next.js': 'Frontend',
  tailwind: 'Frontend',
  'node.js': 'Backend',
  express: 'Backend',
  nestjs: 'Backend',
  python: 'Backend',
  java: 'Backend',
  'spring boot': 'Backend',
  fastapi: 'Backend',
  postgresql: 'Database',
  mysql: 'Database',
  mongodb: 'Database',
  redis: 'Database',
  tensorflow: 'AI/ML',
  'scikit-learn': 'AI/ML',
  'machine learning': 'AI/ML',
  'data analysis': 'AI/ML',
  pytorch: 'AI/ML',
  figma: 'Design',
  'ui/ux': 'Design',
  prototyping: 'Design',
  aws: 'Cloud',
  azure: 'Cloud',
  docker: 'Cloud',
  kubernetes: 'Cloud',
};

export interface CompatibilityResult {
  userId: string;
  teamId: string;
  overallScore: number;
  skillScore: number;
  roleScore: number;
  experienceScore: number;
  interestScore: number;
  collaborationScore: number;
  explanation: string;
  matchingSkills: string[];
  missingSkills: string[];
  complementarySkills: string[];
  complementaryRoles: string[];
  suggestedContribution: string;
}

export function computeCompatibilityScores(input: {
  userId: string;
  teamId: string;
  userSkillNames: string[];
  userSkillCategories?: Record<string, string>;
  preferredRole: string;
  experienceLevel: string;
  projectInterests: string[];
  userCollabMode: string;
  requiredSkills: string[];
  requiredRoles: string[];
  currentMemberRoles: string[];
  currentMemberSkills?: string[];
  teamCategory: string;
  teamExperienceReq: string;
  teamCollabMode: string;
  teamAvailableSeats?: number;
  teamMaxCapacity?: number;
  weights?: {
    skillMatch: number;
    roleComplementarity: number;
    experienceCompatibility: number;
    projectInterest: number;
    collaboration: number;
  };
}): CompatibilityResult {
  const weights = input.weights ?? {
    skillMatch: 0.35,
    roleComplementarity: 0.25,
    experienceCompatibility: 0.15,
    projectInterest: 0.15,
    collaboration: 0.1,
  };

  const getCategory = (skillName: string) =>
    input.userSkillCategories?.[skillName.toLowerCase()] ||
    SKILL_CATEGORY_FALLBACK[skillName.toLowerCase()] ||
    'Other';

  const userSkillsLower = new Set(input.userSkillNames.map((s) => s.toLowerCase()));
  const teamMemberSkillsLower = new Set((input.currentMemberSkills || []).map((s) => s.toLowerCase()));
  const matchingSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const reqSkill of input.requiredSkills) {
    if (userSkillsLower.has(reqSkill.toLowerCase())) {
      matchingSkills.push(reqSkill);
    } else {
      missingSkills.push(reqSkill);
    }
  }

  // Complementary skills = candidate skills that the team's current roster doesn't cover yet
  const complementarySkills = input.userSkillNames.filter(
    (s) => !teamMemberSkillsLower.has(s.toLowerCase())
  );

  // A. Skill Match (35%, 0-100)
  // Differentiates exact skill overlap + category-adjacent skills + filling skills absent from current roster
  let skillScore = 0;
  if (input.requiredSkills.length > 0) {
    const userCategoryCounts = new Map<string, number>();
    for (const s of input.userSkillNames) {
      const cat = getCategory(s);
      userCategoryCounts.set(cat, (userCategoryCounts.get(cat) || 0) + 1);
    }

    let weightedMatches = matchingSkills.length;
    for (const missing of missingSkills) {
      const cat = getCategory(missing);
      if ((userCategoryCounts.get(cat) || 0) > 0 && cat !== 'Other') {
        weightedMatches += 0.32;
      }
    }

    const baseRatioScore = (weightedMatches / input.requiredSkills.length) * 92;
    const gapFillBonus =
      matchingSkills.filter((s) => !teamMemberSkillsLower.has(s.toLowerCase())).length * 4;
    const breadthBonus =
      matchingSkills.length > 0
        ? Math.min(8, Math.max(0, input.userSkillNames.length - matchingSkills.length) * 2)
        : 0;

    if (
      matchingSkills.length === input.requiredSkills.length &&
      input.requiredSkills.length > 0
    ) {
      skillScore = 100;
    } else {
      skillScore = Math.min(100, Math.round(baseRatioScore + gapFillBonus + breadthBonus));
    }
  } else if (input.userSkillNames.length >= 3) {
    skillScore = 85;
  } else if (input.userSkillNames.length > 0) {
    skillScore = 55;
  }

  // B. Role Complementarity (25%, 0-100)
  const existingRoleCounts = new Map<string, number>();
  for (const r of input.currentMemberRoles) {
    const k = r.toLowerCase();
    existingRoleCounts.set(k, (existingRoleCounts.get(k) || 0) + 1);
  }
  const reqRolesLower = input.requiredRoles.map((r) => r.toLowerCase());
  const userRoleLower = input.preferredRole.toLowerCase();

  const uncoveredRequiredRoles = input.requiredRoles.filter(
    (r) => !existingRoleCounts.has(r.toLowerCase())
  );
  const adjacentRoles = (ROLE_ADJACENCY[input.preferredRole] || []).map((r) => r.toLowerCase());
  const fillsAdjacentUncovered = uncoveredRequiredRoles.some((r) =>
    adjacentRoles.includes(r.toLowerCase())
  );

  let roleScore = 40;
  const complementaryRoles: string[] = [];
  const existingSameRoleCount = existingRoleCounts.get(userRoleLower) || 0;
  const fullTeamPenalty = input.teamAvailableSeats === 0 ? 5 : 0;

  if (uncoveredRequiredRoles.some((r) => r.toLowerCase() === userRoleLower)) {
    roleScore = 100;
    complementaryRoles.push(input.preferredRole);
  } else if (fillsAdjacentUncovered && existingSameRoleCount === 0) {
    roleScore = Math.max(68, 82 - fullTeamPenalty);
    const targetAdj = uncoveredRequiredRoles.find((r) =>
      adjacentRoles.includes(r.toLowerCase())
    );
    if (targetAdj) complementaryRoles.push(`${input.preferredRole} (covers ${targetAdj})`);
  } else if (reqRolesLower.includes(userRoleLower)) {
    const baseRole = existingSameRoleCount >= 2 ? 48 : 74;
    const gapShift = Math.min(4, uncoveredRequiredRoles.length) + fullTeamPenalty;
    roleScore = Math.max(40, Math.min(84, baseRole - gapShift));
    complementaryRoles.push(input.preferredRole);
  } else if (existingSameRoleCount === 0) {
    // Non-required but unique role brings distinct perspective; differentiated by gap count & open seats
    roleScore = Math.max(54, 72 - uncoveredRequiredRoles.length * 3 - fullTeamPenalty);
    complementaryRoles.push(input.preferredRole);
  } else {
    roleScore = existingSameRoleCount >= 2 ? 35 : Math.max(38, 44 - fullTeamPenalty);
  }

  // C. Experience Compatibility (15%, 0-100)
  const userRank = EXPERIENCE_RANK[input.experienceLevel] ?? 2;
  const teamRank = EXPERIENCE_RANK[input.teamExperienceReq] ?? 2;
  const diff = userRank - teamRank;
  let experienceScore = 70;
  if (diff === 0) experienceScore = 100;
  else if (diff === 1) experienceScore = 92;
  else if (diff === -1) experienceScore = 74;
  else if (diff === 2) experienceScore = 78;
  else if (diff === -2) experienceScore = 48;
  else experienceScore = 30;

  // D. Project Interest Match (15%, 0-100)
  const interestsLower = input.projectInterests.map((i) => i.toLowerCase());
  const teamCatLower = input.teamCategory.toLowerCase();
  let interestScore = 28;
  if (interestsLower.includes(teamCatLower)) {
    interestScore = 100;
  } else {
    const related = RELATED_CATEGORIES[input.teamCategory] ?? [];
    const relatedHits = related.filter((cat) => interestsLower.includes(cat.toLowerCase())).length;
    if (relatedHits >= 2) {
      interestScore = 74;
    } else if (relatedHits === 1) {
      interestScore = 64;
    } else if (interestsLower.length > 0) {
      interestScore = 34;
    } else {
      // No interests configured yet — differentiate slightly by team openness
      interestScore = input.teamAvailableSeats === 0 ? 20 : 26;
    }
  }

  // E. Collaboration Preferences (10%, 0-100)
  let collaborationScore = 50;
  if (
    input.userCollabMode === input.teamCollabMode ||
    input.userCollabMode === 'Flexible' ||
    input.teamCollabMode === 'Flexible'
  ) {
    collaborationScore = 100;
  } else if (input.userCollabMode === 'Hybrid' || input.teamCollabMode === 'Hybrid') {
    collaborationScore = 74;
  } else {
    collaborationScore = 30;
  }

  const overallScore = Number(
    (
      skillScore * weights.skillMatch +
      roleScore * weights.roleComplementarity +
      experienceScore * weights.experienceCompatibility +
      interestScore * weights.projectInterest +
      collaborationScore * weights.collaboration
    ).toFixed(1)
  );

  const reasons: string[] = [];
  if (matchingSkills.length > 0) {
    reasons.push(
      `Matches ${matchingSkills.length}/${Math.max(1, input.requiredSkills.length)} required skills (${matchingSkills
        .slice(0, 3)
        .join(', ')})`
    );
  } else if (input.userSkillNames.length === 0) {
    reasons.push('Add technical skills in your profile to unlock skill-based matching');
  } else {
    reasons.push(
      `Brings ${complementarySkills.slice(0, 2).join(' & ') || 'adjacent'} capabilities outside core stack`
    );
  }

  if (roleScore >= 90) {
    reasons.push(`fills missing ${input.preferredRole} seat`);
  } else if (roleScore >= 78) {
    reasons.push(`covers uncovered role needs via ${input.preferredRole}`);
  } else if (roleScore >= 58) {
    reasons.push(`adds ${input.preferredRole} capacity`);
  } else {
    reasons.push(`role (${input.preferredRole}) already represented on roster`);
  }

  if (interestScore === 100) {
    reasons.push(`direct ${input.teamCategory} track alignment`);
  } else if (interestScore >= 60) {
    reasons.push(`related domain interest for ${input.teamCategory}`);
  }

  const explanation = reasons.join('; ') + '.';

  // Suggested contribution statement
  let suggestedContribution = '';
  const uncoveredRole = uncoveredRequiredRoles[0];
  const gapSkillsForTeam = matchingSkills.filter((s) => !teamMemberSkillsLower.has(s.toLowerCase()));
  if (uncoveredRequiredRoles.some((r) => r.toLowerCase() === userRoleLower)) {
    suggestedContribution = `Step directly into the open ${input.preferredRole} seat${
      gapSkillsForTeam.length > 0
        ? ` and contribute ${gapSkillsForTeam.slice(0, 3).join(', ')} where the current roster has gaps.`
        : matchingSkills.length > 0
        ? ` using ${matchingSkills.slice(0, 3).join(', ')}.`
        : '.'
    }`;
  } else if (gapSkillsForTeam.length > 0) {
    suggestedContribution = `Unblock ${gapSkillsForTeam.slice(0, 3).join(', ')} delivery${
      uncoveredRole ? ` while supporting ${uncoveredRole} workflows` : ''
    }.`;
  } else if (complementarySkills.length > 0) {
    suggestedContribution = `Add fresh ${complementarySkills.slice(0, 3).join(', ')} breadth as ${
      input.preferredRole
    }.`;
  } else {
    suggestedContribution = `Support execution capacity as ${input.preferredRole} (${input.experienceLevel}).`;
  }

  return {
    userId: input.userId,
    teamId: input.teamId,
    overallScore,
    skillScore,
    roleScore,
    experienceScore,
    interestScore,
    collaborationScore,
    explanation,
    matchingSkills,
    missingSkills,
    complementarySkills,
    complementaryRoles,
    suggestedContribution,
  };
}

export async function calculateAndPersistCompatibility(
  userId: string,
  teamId: string
): Promise<CompatibilityResult | null> {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [profileRow] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const [teamRow] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!userRow || !teamRow) return null;

  const uSkills = await db
    .select({ name: skills.name, category: skills.category })
    .from(userSkills)
    .innerJoin(skills, eq(userSkills.skillId, skills.id))
    .where(eq(userSkills.userId, userId));

  const userSkillCategories: Record<string, string> = {};
  for (const s of uSkills) {
    userSkillCategories[s.name.toLowerCase()] = s.category;
  }

  const [reqs] = await db
    .select()
    .from(teamRequirements)
    .where(eq(teamRequirements.teamId, teamId))
    .limit(1);
  const members = await db
    .select({ userId: teamMembers.userId, teamRole: teamMembers.teamRole })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));

  const memberIds = members.map((m) => m.userId);
  let currentMemberSkills: string[] = [];
  if (memberIds.length > 0) {
    const mSkills = await db
      .select({ name: skills.name })
      .from(userSkills)
      .innerJoin(skills, eq(userSkills.skillId, skills.id))
      .where(inArray(userSkills.userId, memberIds));
    currentMemberSkills = Array.from(new Set(mSkills.map((m) => m.name)));
  }

  const [settings] = await db.select().from(eventSettings).limit(1);

  const result = computeCompatibilityScores({
    userId,
    teamId,
    userSkillNames: uSkills.map((s) => s.name),
    userSkillCategories,
    preferredRole: profileRow?.preferredRole ?? 'Full-Stack Developer',
    experienceLevel: profileRow?.experienceLevel ?? 'Intermediate',
    projectInterests: profileRow?.projectInterests ?? [],
    userCollabMode: profileRow?.collaborationMode ?? 'Hybrid',
    requiredSkills: reqs?.requiredSkills ?? [],
    requiredRoles: reqs?.requiredRoles ?? [],
    currentMemberRoles: members.map((m) => m.teamRole),
    currentMemberSkills,
    teamCategory: teamRow.category,
    teamExperienceReq: reqs?.minExperience ?? teamRow.experienceRequirement,
    teamCollabMode: teamRow.collaborationMode,
    teamAvailableSeats: Math.max(0, teamRow.maxCapacity - members.length),
    teamMaxCapacity: teamRow.maxCapacity,
    weights: settings?.compatibilityWeights,
  });

  await db
    .insert(compatibilityScores)
    .values({
      userId,
      teamId,
      overallScore: result.overallScore,
      skillScore: result.skillScore,
      roleScore: result.roleScore,
      experienceScore: result.experienceScore,
      interestScore: result.interestScore,
      collaborationScore: result.collaborationScore,
      explanation: result.explanation,
      matchingSkills: result.matchingSkills,
      missingSkills: result.missingSkills,
      complementaryRoles: result.complementaryRoles,
      calculatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [compatibilityScores.userId, compatibilityScores.teamId],
      set: {
        overallScore: result.overallScore,
        skillScore: result.skillScore,
        roleScore: result.roleScore,
        experienceScore: result.experienceScore,
        interestScore: result.interestScore,
        collaborationScore: result.collaborationScore,
        explanation: result.explanation,
        matchingSkills: result.matchingSkills,
        missingSkills: result.missingSkills,
        complementaryRoles: result.complementaryRoles,
        calculatedAt: new Date(),
      },
    });

  return result;
}

export async function recalculateCompatibilityForTeam(teamId: string) {
  const allUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.status, 'ACTIVE'), notLike(users.email, '%@hackforge.test')));
  for (const u of allUsers) {
    await calculateAndPersistCompatibility(u.id, teamId);
  }
}

export async function recalculateCompatibilityForUser(userId: string) {
  const allTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.status, 'ACTIVE'), eq(teams.isTestTeam, false)));
  for (const t of allTeams) {
    await calculateAndPersistCompatibility(userId, t.id);
  }
}
