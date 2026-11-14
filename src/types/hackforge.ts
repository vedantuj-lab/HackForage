export type UserRole = 'PARTICIPANT' | 'TEAM_LEADER' | 'ADMIN';

export interface ProfileChecklistItem {
  id: string;
  label: string;
  points: number;
  earned: number;
  completed: boolean;
  hint: string;
}

export interface ProfileData {
  id: string;
  userId: string;
  avatarUrl: string;
  bio: string;
  experienceLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  preferredRole: string;
  projectInterests: string[];
  collaborationMode: 'Remote' | 'On-site' | 'Hybrid' | 'Flexible';
  completionPct: number;
}

export interface SkillItem {
  id: string;
  name: string;
  category: string;
  proficiency?: number;
  isCustom?: boolean;
}

export interface AuthUser {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: string;
  institution: string;
  location: string;
  profile: ProfileData | null;
}

export interface CompatibilityBreakdown {
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
  complementarySkills?: string[];
  complementaryRoles: string[];
  suggestedContribution?: string;
}

export interface TeamHealthData {
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
  calculatedAt?: string;
}

export interface TeamMemberItem {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  institution: string;
  teamRole: string;
  isLeader: boolean;
  joinedAt: string;
  experienceLevel?: string;
  preferredRole?: string;
  avatarUrl?: string;
  skills: string[];
}

export interface TeamSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  maxCapacity: number;
  experienceRequirement: string;
  collaborationMode: string;
  visibility: string;
  primaryLeaderId: string;
  secondaryLeaderId: string | null;
  leaderName?: string;
  memberCount: number;
  availableSeats: number;
  isViewerMember?: boolean;
  requiredSkills: string[];
  requiredRoles: string[];
  health: TeamHealthData | null;
  compatibility: CompatibilityBreakdown | null;
  status: string;
}

export interface TeamDetails extends TeamSummary {
  waitlistCount: number;
  requirements: {
    requiredSkills: string[];
    requiredRoles: string[];
    minExperience: string;
  };
  members: TeamMemberItem[];
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  isRead: boolean;
  createdAt: string;
}

export interface WaitlistEntryItem {
  id: string;
  teamId: string;
  teamName?: string;
  teamCategory?: string;
  maxCapacity?: number;
  userId: string;
  fullName?: string;
  email?: string;
  preferredRole?: string;
  experienceLevel?: string;
  queuePosition: number;
  compatibilityScore: number;
  status: 'WAITING' | 'INVITED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED';
  invitedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface InvitationItem {
  id: string;
  teamId: string;
  teamName: string;
  teamCategory: string;
  userId: string;
  candidateName: string;
  candidateEmail: string;
  invitedById: string;
  type: 'INVITE' | 'REQUEST';
  proposedRole: string;
  message: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  createdAt: string;
}

export interface ConcurrencyReport {
  teamId: string;
  teamName: string;
  maxCapacity: number;
  initialMembers: number;
  availableSeatsBefore: number;
  concurrentRequests: number;
  successfulJoins: number;
  rejectedJoins: number;
  finalMembers: number;
  overbooking: number;
  durationMs: number;
  winningParticipant: string | null;
  results: Array<{
    requestIndex: number;
    email: string;
    status: number;
    success: boolean;
    code: string;
    message: string;
    latencyMs: number;
  }>;
}
