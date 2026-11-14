import { db } from '../../db/index.ts';
import {
  eventSettings,
  profiles,
  skills,
  teamHealth,
  teamMembers,
  teamRequirements,
  teams,
  userSkills,
} from '../../db/schema.ts';
import { eq, inArray } from 'drizzle-orm';

export interface TeamHealthResult {
  teamId: string;
  overallScore: number;
  skillCoverageScore: number;
  roleCoverageScore: number;
  experienceBalanceScore: number;
  leadershipReadinessScore: number;
  requirementFulfillmentScore: number;
  statusLabel: 'Optimal' | 'Balanced' | 'Needs Improvement' | 'Critical';
  missingSkills: string[];
  missingRoles: string[];
  recommendations: string[];
}

export function computeTeamHealthScores(input: {
  teamId: string;
  maxCapacity: number;
  hasPrimaryLeader: boolean;
  hasSecondaryLeader: boolean;
  memberCount: number;
  memberRoles: string[];
  memberExperienceLevels: string[];
  memberSkillNames: string[];
  requiredSkills: string[];
  requiredRoles: string[];
  weights?: {
    skillCoverage: number;
    roleCoverage: number;
    experienceBalance: number;
    leadershipReadiness: number;
    requirementFulfillment: number;
  };
}): TeamHealthResult {
  const weights = input.weights ?? {
    skillCoverage: 0.35,
    roleCoverage: 0.3,
    experienceBalance: 0.15,
    leadershipReadiness: 0.1,
    requirementFulfillment: 0.1,
  };

  if (input.memberCount === 0) {
    return {
      teamId: input.teamId,
      overallScore: 0,
      skillCoverageScore: 0,
      roleCoverageScore: 0,
      experienceBalanceScore: 0,
      leadershipReadinessScore: 0,
      requirementFulfillmentScore: 0,
      statusLabel: 'Critical',
      missingSkills: input.requiredSkills,
      missingRoles: input.requiredRoles,
      recommendations: ['Recruit initial team members and assign a primary leader.'],
    };
  }

  const teamSkillsLower = new Set(input.memberSkillNames.map((s) => s.toLowerCase()));
  const missingSkills = input.requiredSkills.filter((req) => !teamSkillsLower.has(req.toLowerCase()));
  const skillCoverageScore =
    input.requiredSkills.length > 0
      ? Math.round(((input.requiredSkills.length - missingSkills.length) / input.requiredSkills.length) * 100)
      : Math.min(100, input.memberSkillNames.length * 15);

  const memberRolesLower = new Set(input.memberRoles.map((r) => r.toLowerCase()));
  const missingRoles = input.requiredRoles.filter((req) => !memberRolesLower.has(req.toLowerCase()));
  const roleCoverageScore =
    input.requiredRoles.length > 0
      ? Math.round(((input.requiredRoles.length - missingRoles.length) / input.requiredRoles.length) * 100)
      : Math.min(100, memberRolesLower.size * 25);

  // Experience Balance (0-100)
  const distinctLevels = new Set(input.memberExperienceLevels);
  const hasSenior =
    distinctLevels.has('Advanced') || distinctLevels.has('Expert');
  let experienceBalanceScore = 50;
  if (distinctLevels.size >= 3) experienceBalanceScore = 95;
  else if (distinctLevels.size === 2) experienceBalanceScore = 75;
  else experienceBalanceScore = 50;
  if (hasSenior && experienceBalanceScore < 100) {
    experienceBalanceScore = Math.min(100, experienceBalanceScore + 5);
  }

  // Leadership Readiness (0-100)
  let leadershipReadinessScore = 0;
  if (input.hasPrimaryLeader && input.hasSecondaryLeader) leadershipReadinessScore = 100;
  else if (input.hasPrimaryLeader) leadershipReadinessScore = 60;

  // Requirement Fulfillment (0-100)
  const capacityRatio = Math.min(1, input.memberCount / Math.max(1, input.maxCapacity));
  const reqFulfillRatio = (skillCoverageScore + roleCoverageScore) / 200;
  const requirementFulfillmentScore = Math.round((capacityRatio * 0.5 + reqFulfillRatio * 0.5) * 100);

  const overallScore = Number(
    (
      skillCoverageScore * weights.skillCoverage +
      roleCoverageScore * weights.roleCoverage +
      experienceBalanceScore * weights.experienceBalance +
      leadershipReadinessScore * weights.leadershipReadiness +
      requirementFulfillmentScore * weights.requirementFulfillment
    ).toFixed(1)
  );

  let statusLabel: TeamHealthResult['statusLabel'] = 'Critical';
  if (overallScore >= 82) statusLabel = 'Optimal';
  else if (overallScore >= 68) statusLabel = 'Balanced';
  else if (overallScore >= 45) statusLabel = 'Needs Improvement';

  const recommendations: string[] = [];
  for (const role of missingRoles) {
    if (role.toLowerCase().includes('presenter')) {
      recommendations.push('Assign a presentation lead or recruit a Presenter.');
    } else {
      recommendations.push(`Recruit a ${role}.`);
    }
  }
  if (missingSkills.length > 0) {
    recommendations.push(`Cover missing skills: ${missingSkills.slice(0, 4).join(', ')}.`);
  }
  if (!input.hasSecondaryLeader && input.memberCount >= 2) {
    recommendations.push('Designate a secondary leader to prevent leadership dependency.');
  }
  if (!hasSenior) {
    recommendations.push('Add an Advanced or Expert mentor/developer for technical balance.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Team skill and role coverage is well balanced across all requirements.');
  }

  return {
    teamId: input.teamId,
    overallScore,
    skillCoverageScore,
    roleCoverageScore,
    experienceBalanceScore,
    leadershipReadinessScore,
    requirementFulfillmentScore,
    statusLabel,
    missingSkills,
    missingRoles,
    recommendations,
  };
}

export async function recalculateAndPersistTeamHealth(teamId: string): Promise<TeamHealthResult | null> {
  const [teamRow] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!teamRow) return null;

  const members = await db
    .select({
      userId: teamMembers.userId,
      teamRole: teamMembers.teamRole,
    })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));

  const memberIds = members.map((m) => m.userId);
  const [reqs] = await db.select().from(teamRequirements).where(eq(teamRequirements.teamId, teamId)).limit(1);
  const [settings] = await db.select().from(eventSettings).limit(1);

  let memberExp: string[] = [];
  let memberSkillNames: string[] = [];

  if (memberIds.length > 0) {
    const profs = await db
      .select({ experienceLevel: profiles.experienceLevel })
      .from(profiles)
      .where(inArray(profiles.userId, memberIds));
    memberExp = profs.map((p) => p.experienceLevel);

    const skillRows = await db
      .select({ name: skills.name })
      .from(userSkills)
      .innerJoin(skills, eq(userSkills.skillId, skills.id))
      .where(inArray(userSkills.userId, memberIds));
    memberSkillNames = Array.from(new Set(skillRows.map((s) => s.name)));
  }

  const result = computeTeamHealthScores({
    teamId,
    maxCapacity: teamRow.maxCapacity,
    hasPrimaryLeader: Boolean(teamRow.primaryLeaderId),
    hasSecondaryLeader: Boolean(teamRow.secondaryLeaderId),
    memberCount: members.length,
    memberRoles: members.map((m) => m.teamRole),
    memberExperienceLevels: memberExp,
    memberSkillNames,
    requiredSkills: reqs?.requiredSkills ?? [],
    requiredRoles: reqs?.requiredRoles ?? [],
    weights: settings?.healthWeights,
  });

  await db
    .insert(teamHealth)
    .values({
      teamId,
      overallScore: result.overallScore,
      skillCoverageScore: result.skillCoverageScore,
      roleCoverageScore: result.roleCoverageScore,
      experienceBalanceScore: result.experienceBalanceScore,
      leadershipReadinessScore: result.leadershipReadinessScore,
      requirementFulfillmentScore: result.requirementFulfillmentScore,
      statusLabel: result.statusLabel,
      missingSkills: result.missingSkills,
      missingRoles: result.missingRoles,
      recommendations: result.recommendations,
      calculatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: teamHealth.teamId,
      set: {
        overallScore: result.overallScore,
        skillCoverageScore: result.skillCoverageScore,
        roleCoverageScore: result.roleCoverageScore,
        experienceBalanceScore: result.experienceBalanceScore,
        leadershipReadinessScore: result.leadershipReadinessScore,
        requirementFulfillmentScore: result.requirementFulfillmentScore,
        statusLabel: result.statusLabel,
        missingSkills: result.missingSkills,
        missingRoles: result.missingRoles,
        recommendations: result.recommendations,
        calculatedAt: new Date(),
      },
    });

  return result;
}
