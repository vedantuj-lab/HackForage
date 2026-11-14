import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  fullName: text('full_name').notNull(),
  role: text('role').notNull().default('PARTICIPANT'), // PARTICIPANT | TEAM_LEADER | ADMIN
  status: text('status').notNull().default('ACTIVE'), // ACTIVE | SUSPENDED
  institution: text('institution').notNull().default(''),
  location: text('location').notNull().default(''),
  resetToken: text('reset_token'),
  resetTokenExpiresAt: timestamp('reset_token_expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const profiles = pgTable('profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  avatarUrl: text('avatar_url').notNull().default(''),
  bio: text('bio').notNull().default(''),
  experienceLevel: text('experience_level').notNull().default('Intermediate'), // Beginner | Intermediate | Advanced | Expert
  preferredRole: text('preferred_role').notNull().default('Full-Stack Developer'),
  projectInterests: jsonb('project_interests').$type<string[]>().notNull().default([]),
  collaborationMode: text('collaboration_mode').notNull().default('Hybrid'), // Remote | On-site | Hybrid | Flexible
  completionPct: integer('completion_pct').notNull().default(40),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  category: text('category').notNull().default('Other'), // Frontend | Backend | Database | AI/ML | Design | Cloud | Other
  isCustom: boolean('is_custom').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userSkills = pgTable(
  'user_skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    skillId: uuid('skill_id')
      .references(() => skills.id, { onDelete: 'cascade' })
      .notNull(),
    proficiency: integer('proficiency').notNull().default(3),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_skills_user_skill_idx').on(table.userId, table.skillId)]
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(), // Artificial Intelligence | Healthcare | FinTech | Education | Cybersecurity | Sustainability | Smart Cities | Agriculture
    maxCapacity: integer('max_capacity').notNull().default(5),
    experienceRequirement: text('experience_requirement').notNull().default('Intermediate'),
    collaborationMode: text('collaboration_mode').notNull().default('Hybrid'),
    visibility: text('visibility').notNull().default('PUBLIC'), // PUBLIC | PRIVATE
    primaryLeaderId: uuid('primary_leader_id')
      .references(() => users.id)
      .notNull(),
    secondaryLeaderId: uuid('secondary_leader_id').references(() => users.id),
    isTestTeam: boolean('is_test_team').notNull().default(false),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | ARCHIVED
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('teams_category_idx').on(table.category), index('teams_status_idx').on(table.status)]
);

export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    teamRole: text('team_role').notNull().default('Full-Stack Developer'),
    isLeader: boolean('is_leader').notNull().default(false),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('team_members_team_user_idx').on(table.teamId, table.userId),
    index('team_members_team_idx').on(table.teamId),
  ]
);

export const teamRequirements = pgTable('team_requirements', {
  id: uuid('id').defaultRandom().primaryKey(),
  teamId: uuid('team_id')
    .references(() => teams.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  requiredSkills: jsonb('required_skills').$type<string[]>().notNull().default([]),
  requiredRoles: jsonb('required_roles').$type<string[]>().notNull().default([]),
  minExperience: text('min_experience').notNull().default('Intermediate'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    invitedById: uuid('invited_by_id')
      .references(() => users.id)
      .notNull(),
    type: text('type').notNull().default('INVITE'), // INVITE | REQUEST
    proposedRole: text('proposed_role').notNull().default('Developer'),
    message: text('message').notNull().default(''),
    status: text('status').notNull().default('PENDING'), // PENDING | ACCEPTED | DECLINED | EXPIRED | CANCELLED
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('invitations_team_idx').on(table.teamId), index('invitations_user_idx').on(table.userId)]
);

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    queuePosition: integer('queue_position').notNull(),
    compatibilityScore: doublePrecision('compatibility_score').notNull().default(0),
    status: text('status').notNull().default('WAITING'), // WAITING | INVITED | ACCEPTED | DECLINED | EXPIRED | CANCELLED | COMPLETED
    invitedAt: timestamp('invited_at'),
    expiresAt: timestamp('expires_at'),
    acceptedAt: timestamp('accepted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('waitlist_team_status_idx').on(table.teamId, table.status),
    index('waitlist_user_idx').on(table.userId),
  ]
);

export const compatibilityScores = pgTable(
  'compatibility_scores',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    teamId: uuid('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    overallScore: doublePrecision('overall_score').notNull(),
    skillScore: doublePrecision('skill_score').notNull(),
    roleScore: doublePrecision('role_score').notNull(),
    experienceScore: doublePrecision('experience_score').notNull(),
    interestScore: doublePrecision('interest_score').notNull(),
    collaborationScore: doublePrecision('collaboration_score').notNull(),
    explanation: text('explanation').notNull(),
    matchingSkills: jsonb('matching_skills').$type<string[]>().notNull().default([]),
    missingSkills: jsonb('missing_skills').$type<string[]>().notNull().default([]),
    complementaryRoles: jsonb('complementary_roles').$type<string[]>().notNull().default([]),
    calculatedAt: timestamp('calculated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('compatibility_user_team_idx').on(table.userId, table.teamId)]
);

export const teamHealth = pgTable('team_health', {
  id: uuid('id').defaultRandom().primaryKey(),
  teamId: uuid('team_id')
    .references(() => teams.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  overallScore: doublePrecision('overall_score').notNull(),
  skillCoverageScore: doublePrecision('skill_coverage_score').notNull(),
  roleCoverageScore: doublePrecision('role_coverage_score').notNull(),
  experienceBalanceScore: doublePrecision('experience_balance_score').notNull(),
  leadershipReadinessScore: doublePrecision('leadership_readiness_score').notNull(),
  requirementFulfillmentScore: doublePrecision('requirement_fulfillment_score').notNull(),
  statusLabel: text('status_label').notNull(), // Optimal | Balanced | Needs Improvement | Critical
  missingSkills: jsonb('missing_skills').$type<string[]>().notNull().default([]),
  missingRoles: jsonb('missing_roles').$type<string[]>().notNull().default([]),
  recommendations: jsonb('recommendations').$type<string[]>().notNull().default([]),
  calculatedAt: timestamp('calculated_at').defaultNow().notNull(),
});

export const leadershipHistory = pgTable(
  'leadership_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    previousLeaderId: uuid('previous_leader_id').references(() => users.id),
    newLeaderId: uuid('new_leader_id')
      .references(() => users.id)
      .notNull(),
    action: text('action').notNull(), // ASSIGN_PRIMARY | ASSIGN_SECONDARY | TRANSFER | AUTO_SUCCESSION | ADMIN_OVERRIDE
    reason: text('reason').notNull(),
    actorId: uuid('actor_id')
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('leadership_history_team_idx').on(table.teamId)]
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    entityType: text('entity_type').notNull().default('SYSTEM'),
    entityId: text('entity_id').notNull().default(''),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('notifications_user_read_idx').on(table.userId, table.isRead)]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('audit_logs_created_idx').on(table.createdAt)]
);

export const eventSettings = pgTable('event_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventName: text('event_name').notNull().default('HackForge Global 2026'),
  maxTeamCapacity: integer('max_team_capacity').notNull().default(5),
  waitlistExpiryMinutes: integer('waitlist_expiry_minutes').notNull().default(60),
  allowTeamCreation: boolean('allow_team_creation').notNull().default(true),
  autoWaitlistPromotion: boolean('auto_waitlist_promotion').notNull().default(true),
  healthWeights: jsonb('health_weights')
    .$type<{
      skillCoverage: number;
      roleCoverage: number;
      experienceBalance: number;
      leadershipReadiness: number;
      requirementFulfillment: number;
    }>()
    .notNull()
    .default({
      skillCoverage: 0.35,
      roleCoverage: 0.3,
      experienceBalance: 0.15,
      leadershipReadiness: 0.1,
      requirementFulfillment: 0.1,
    }),
  compatibilityWeights: jsonb('compatibility_weights')
    .$type<{
      skillMatch: number;
      roleComplementarity: number;
      experienceCompatibility: number;
      projectInterest: number;
      collaboration: number;
    }>()
    .notNull()
    .default({
      skillMatch: 0.35,
      roleComplementarity: 0.25,
      experienceCompatibility: 0.15,
      projectInterest: 0.15,
      collaboration: 0.1,
    }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Drizzle Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  userSkills: many(userSkills),
  teamMemberships: many(teamMembers),
  notifications: many(notifications),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));

export const userSkillsRelations = relations(userSkills, ({ one }) => ({
  user: one(users, { fields: [userSkills.userId], references: [users.id] }),
  skill: one(skills, { fields: [userSkills.skillId], references: [skills.id] }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  primaryLeader: one(users, { fields: [teams.primaryLeaderId], references: [users.id] }),
  members: many(teamMembers),
  requirements: one(teamRequirements, { fields: [teams.id], references: [teamRequirements.teamId] }),
  health: one(teamHealth, { fields: [teams.id], references: [teamHealth.teamId] }),
  waitlist: many(waitlistEntries),
  invitations: many(invitations),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));
