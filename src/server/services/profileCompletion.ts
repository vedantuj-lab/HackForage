export interface ProfileChecklistItem {
  id: string;
  label: string;
  points: number;
  earned: number;
  completed: boolean;
  hint: string;
}

export interface ProfileCompletionSummary {
  completionPct: number;
  checklist: ProfileChecklistItem[];
}

/**
 * Strips leading numeric roll/badge prefixes (e.g. "137 Vedant Dalvi" -> "Vedant Dalvi")
 * while leaving valid names untouched.
 */
export function sanitizeFullName(rawName: string | undefined | null, fallbackEmail?: string): string {
  const raw = (rawName || '').trim();
  const stripped = raw.replace(/^\d{1,5}[\s._-]+(?=[A-Za-z])/, '').trim();
  if (stripped.length >= 2) return stripped;
  if (raw.length >= 2) return raw;
  const emailPrefix = (fallbackEmail || '').split('@')[0]?.replace(/^\d+/, '').trim();
  return emailPrefix && emailPrefix.length >= 2 ? emailPrefix : 'HackForge Builder';
}

export function computeProfileCompletion(input: {
  fullName?: string | null;
  institution?: string | null;
  location?: string | null;
  bio?: string | null;
  experienceLevel?: string | null;
  preferredRole?: string | null;
  collaborationMode?: string | null;
  projectInterests?: string[] | null;
  skillCount: number;
}): ProfileCompletionSummary {
  const nameOk = (input.fullName || '').trim().length >= 2;
  const instOk = (input.institution || '').trim().length >= 2;
  const locOk = (input.location || '').trim().length >= 2;
  const bioOk = (input.bio || '').trim().length >= 20;
  const roleOk = Boolean(
    input.preferredRole?.trim() && input.experienceLevel?.trim() && input.collaborationMode?.trim()
  );
  const interestsCount = Array.isArray(input.projectInterests) ? input.projectInterests.length : 0;
  const interestsOk = interestsCount >= 1;

  const skillCount = Math.max(0, Number(input.skillCount) || 0);
  const skillEarned = skillCount >= 3 ? 25 : skillCount >= 1 ? 15 : 0;

  const instLocEarned = (instOk ? 8 : 0) + (locOk ? 7 : 0);

  const checklist: ProfileChecklistItem[] = [
    {
      id: 'identity',
      label: 'Full Name',
      points: 15,
      earned: nameOk ? 15 : 0,
      completed: nameOk,
      hint: nameOk ? 'Verified display name set' : 'Add your full name',
    },
    {
      id: 'affiliation',
      label: 'Institution & Location',
      points: 15,
      earned: instLocEarned,
      completed: instOk && locOk,
      hint:
        instOk && locOk
          ? 'College/organization and city saved'
          : !instOk && !locOk
          ? 'Add your college/institution and city'
          : !instOk
          ? 'Add your college or organization'
          : 'Add your city or location',
    },
    {
      id: 'bio',
      label: 'Builder Biography',
      points: 15,
      earned: bioOk ? 15 : 0,
      completed: bioOk,
      hint: bioOk ? 'Bio ready for team leaders' : 'Write at least 20 characters about what you build',
    },
    {
      id: 'role',
      label: 'Role, Experience & Collaboration Mode',
      points: 15,
      earned: roleOk ? 15 : 0,
      completed: roleOk,
      hint: roleOk ? 'Role and collaboration style configured' : 'Select preferred role and experience',
    },
    {
      id: 'interests',
      label: 'Project Track Interests',
      points: 15,
      earned: interestsOk ? 15 : 0,
      completed: interestsOk,
      hint: interestsOk
        ? `${interestsCount} track interest${interestsCount > 1 ? 's' : ''} selected`
        : 'Select at least 1 hackathon track',
    },
    {
      id: 'skills',
      label: 'Technical Skills (3+ recommended)',
      points: 25,
      earned: skillEarned,
      completed: skillCount >= 3,
      hint:
        skillCount >= 3
          ? `${skillCount} technical skills saved`
          : skillCount > 0
          ? `${skillCount}/3 skills selected — add ${3 - skillCount} more for full score`
          : 'Select at least 3 technical skills to enable accurate matching',
    },
  ];

  const completionPct = Math.min(
    100,
    checklist.reduce((sum, item) => sum + item.earned, 0)
  );

  return { completionPct, checklist };
}
