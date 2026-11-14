import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  UserCircle,
  Compass,
  Sparkles,
  Users,
  Shield,
  Mail,
  Clock,
  Bell,
  Settings,
  Search,
  Plus,
  Check,
  X,
  ArrowRight,
  LogOut as LeaveIcon,
  CheckCircle2,
  Circle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { PortalShell, NavItem } from '../components/PortalShell.tsx';
import { UserAvatar } from '../components/UserAvatar.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../services/api.ts';
import {
  InvitationItem,
  ProfileChecklistItem,
  SkillItem,
  TeamDetails,
  TeamSummary,
  WaitlistEntryItem,
} from '../types/hackforge.ts';

const CATEGORIES = [
  'Artificial Intelligence',
  'Healthcare',
  'FinTech',
  'Education',
  'Cybersecurity',
  'Sustainability',
  'Smart Cities',
  'Agriculture',
];

const ROLES = [
  'Frontend Developer',
  'Backend Developer',
  'Full-Stack Developer',
  'AI/ML Developer',
  'UI/UX Designer',
  'Data Analyst',
  'Researcher',
  'Project Manager',
  'Presenter',
];

const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'] as const;
const COLLAB_MODES = ['Remote', 'On-site', 'Hybrid', 'Flexible'] as const;
const SKILL_CATEGORIES = ['ALL', 'Frontend', 'Backend', 'Database', 'AI/ML', 'Design', 'Cloud', 'Other'] as const;

interface ParticipantPortalProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onGoHome: () => void;
  onSwitchPortal: (target: 'PARTICIPANT' | 'TEAM_LEADER' | 'ADMIN') => void;
}

export const ParticipantPortal: React.FC<ParticipantPortalProps> = ({
  activeTab,
  onSelectTab,
  onGoHome,
  onSwitchPortal,
}) => {
  const {
    user,
    notifications,
    unreadCount,
    pushToast,
    refreshSession,
    markNotificationRead,
    markAllNotificationsRead,
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [skillsCatalog, setSkillsCatalog] = useState<SkillItem[]>([]);
  const [myProfileData, setMyProfileData] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [teammates, setTeammates] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntryItem[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamDetails | null>(null);
  const [myTeamDetails, setMyTeamDetails] = useState<TeamDetails | null>(null);

  // Filters & sorting
  const [teamSearch, setTeamSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [availOnly, setAvailOnly] = useState(false);
  const [expFilter, setExpFilter] = useState('ALL');
  const [teamSort, setTeamSort] = useState<'match' | 'seats' | 'health'>('match');

  const [mateSearch, setMateSearch] = useState('');
  const [mateRole, setMateRole] = useState('ALL');
  const [mateExp, setMateExp] = useState('ALL');
  const [mateAvailOnly, setMateAvailOnly] = useState(false);
  const [inviteFilter, setInviteFilter] = useState<'ALL' | 'PENDING' | 'HISTORY'>('ALL');

  // Profile form state
  const [pFullName, setPFullName] = useState('');
  const [pInstitution, setPInstitution] = useState('');
  const [pLocation, setPLocation] = useState('');
  const [pBio, setPBio] = useState('');
  const [pExp, setPExp] = useState('Intermediate');
  const [pRole, setPRole] = useState('Full-Stack Developer');
  const [pCollab, setPCollab] = useState('Hybrid');
  const [pInterests, setPInterests] = useState<string[]>([]);
  const [pSkillIds, setPSkillIds] = useState<string[]>([]);
  const [skillSearch, setSkillSearch] = useState('');
  const [skillCategoryFilter, setSkillCategoryFilter] = useState<string>('ALL');
  const [customSkillName, setCustomSkillName] = useState('');
  const [customSkillCat, setCustomSkillCat] = useState('Other');
  const [savingProfile, setSavingProfile] = useState(false);

  // Create team modal
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [newTeamCat, setNewTeamCat] = useState('Artificial Intelligence');
  const [newTeamCap, setNewTeamCap] = useState(5);

  const syncProfileForm = useCallback((p: any) => {
    if (!p) return;
    setPFullName(p.fullName || '');
    setPInstitution(p.institution || '');
    setPLocation(p.location || '');
    setPBio(p.profile?.bio || '');
    setPExp(p.profile?.experienceLevel || 'Intermediate');
    setPRole(p.profile?.preferredRole || 'Full-Stack Developer');
    setPCollab(p.profile?.collaborationMode || 'Hybrid');
    setPInterests(p.profile?.projectInterests || []);
    setPSkillIds((p.skills || []).map((s: SkillItem) => s.id));
  }, []);

  const userId = user?.id;

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [profRes, skillsRes, teamsRes, recRes, invRes, wlRes, usersRes] = await Promise.allSettled([
        apiFetch<{ profile: any }>('/api/users/profile'),
        apiFetch<{ skills: SkillItem[] }>('/api/skills'),
        apiFetch<{ teams: TeamSummary[] }>('/api/teams'),
        apiFetch<{ recommendations: any[] }>(`/api/compatibility/users/${userId}`),
        apiFetch<{ invitations: InvitationItem[] }>('/api/invitations'),
        apiFetch<{ entries: WaitlistEntryItem[] }>('/api/waitlist/me'),
        apiFetch<{ users: any[] }>('/api/users'),
      ]);

      if (profRes.status === 'fulfilled') {
        setMyProfileData(profRes.value.profile);
        syncProfileForm(profRes.value.profile);

        const p = profRes.value.profile;
        if (p.teams && p.teams.length > 0) {
          try {
            const td = await apiFetch<{ team: TeamDetails }>(`/api/teams/${p.teams[0].teamId}`);
            setMyTeamDetails(td.team);
          } catch {
            setMyTeamDetails(null);
          }
        } else {
          setMyTeamDetails(null);
        }
      } else {
        setLoadError('Unable to load your participant profile.');
      }

      if (skillsRes.status === 'fulfilled') setSkillsCatalog(skillsRes.value.skills);
      if (teamsRes.status === 'fulfilled') setTeams(teamsRes.value.teams);
      if (recRes.status === 'fulfilled') setRecommendations(recRes.value.recommendations);
      if (invRes.status === 'fulfilled') setInvitations(invRes.value.invitations);
      if (wlRes.status === 'fulfilled') setWaitlistEntries(wlRes.value.entries);
      if (usersRes.status === 'fulfilled') setTeammates(usersRes.value.users);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load participant workspace.');
    } finally {
      setLoading(false);
    }
  }, [userId, syncProfileForm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openTeamDetails = async (teamId: string) => {
    try {
      const res = await apiFetch<{ team: TeamDetails }>(`/api/teams/${teamId}`);
      setSelectedTeam(res.team);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to load team details.');
    }
  };

  const handleJoinTeam = async (teamId: string) => {
    try {
      await apiFetch(`/api/teams/${teamId}/join`, {
        method: 'POST',
        body: JSON.stringify({ requestedRole: pRole }),
      });
      pushToast('success', 'Seat allocated atomically. Welcome to the team.');
      setSelectedTeam(null);
      await loadData();
      onSelectTab('my-team');
    } catch (err: any) {
      pushToast('error', err.message || 'Could not join team.');
    }
  };

  const handleJoinWaitlist = async (teamId: string) => {
    try {
      const res = await apiFetch<{ entry: WaitlistEntryItem }>(`/api/teams/${teamId}/waitlist`, {
        method: 'POST',
      });
      pushToast('success', `Added to Smart Waitlist at Queue #${res.entry.queuePosition}.`);
      setSelectedTeam(null);
      await loadData();
    } catch (err: any) {
      pushToast('error', err.message || 'Could not join waitlist.');
    }
  };

  const handleSendJoinRequest = async (teamId: string) => {
    try {
      await apiFetch(`/api/teams/${teamId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'REQUEST',
          proposedRole: pRole,
          message: `Hi! I'd like to contribute as ${pRole}.`,
        }),
      });
      pushToast('success', 'Membership request sent to team leader.');
      await loadData();
    } catch (err: any) {
      pushToast('error', err.message || 'Could not send request.');
    }
  };

  const handleLeaveTeam = async (teamId: string) => {
    try {
      await apiFetch(`/api/teams/${teamId}/leave`, { method: 'POST' });
      pushToast('info', 'You left the team. Vacancy triggered waitlist & succession checks.');
      await loadData();
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to leave team.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiFetch<{ profile: any }>('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: pFullName,
          institution: pInstitution,
          location: pLocation,
          bio: pBio,
          experienceLevel: pExp,
          preferredRole: pRole,
          projectInterests: pInterests,
          collaborationMode: pCollab,
          skillIds: pSkillIds,
        }),
      });
      if (res.profile) {
        setMyProfileData(res.profile);
        syncProfileForm(res.profile);
      }
      pushToast('success', 'Profile saved & compatibility scores recalculated.');
      await refreshSession();
      if (user) {
        const [recRes, teamsRes] = await Promise.allSettled([
          apiFetch<{ recommendations: any[] }>(`/api/compatibility/users/${user.id}`),
          apiFetch<{ teams: TeamSummary[] }>('/api/teams'),
        ]);
        if (recRes.status === 'fulfilled') setRecommendations(recRes.value.recommendations);
        if (teamsRes.status === 'fulfilled') setTeams(teamsRes.value.teams);
      }
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddCustomSkill = async () => {
    if (!customSkillName.trim()) return;
    try {
      const res = await apiFetch<{ skill: SkillItem }>('/api/skills', {
        method: 'POST',
        body: JSON.stringify({ name: customSkillName.trim(), category: customSkillCat }),
      });
      setSkillsCatalog((prev) =>
        prev.some((s) => s.id === res.skill.id) ? prev : [...prev, res.skill]
      );
      setPSkillIds((prev) => (prev.includes(res.skill.id) ? prev : [...prev, res.skill.id]));
      setCustomSkillName('');
      pushToast('success', `Skill "${res.skill.name}" added to your selection. Click Save Profile to persist.`);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to add skill.');
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: newTeamName,
          description: newTeamDesc,
          category: newTeamCat,
          maxCapacity: newTeamCap,
          requiredSkills: ['React', 'Node.js', 'PostgreSQL', 'Figma'],
          requiredRoles: ['Full-Stack Developer', 'AI/ML Developer', 'UI/UX Designer'],
        }),
      });
      pushToast('success', 'Team created! Your account now has Team Leader permissions.');
      setCreateTeamOpen(false);
      await refreshSession();
      onSwitchPortal('TEAM_LEADER');
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to create team.');
    }
  };

  const handleQuickInvite = async (candidateId: string, candidateName: string, proposedRole: string) => {
    if (!myTeamDetails) return;
    try {
      await apiFetch(`/api/teams/${myTeamDetails.id}/invitations`, {
        method: 'POST',
        body: JSON.stringify({
          userId: candidateId,
          type: 'INVITE',
          proposedRole,
          message: `Join ${myTeamDetails.name} as ${proposedRole}!`,
        }),
      });
      pushToast('success', `Invitation sent to ${candidateName}.`);
      await loadData();
    } catch (err: any) {
      pushToast('error', err.message || 'Could not send invitation.');
    }
  };

  const pendingIncomingInvites = invitations.filter(
    (i) => i.userId === user?.id && i.type === 'INVITE' && i.status === 'PENDING'
  );

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" />, section: 'Discover & Match' },
    { id: 'discover', label: 'Discover Teams', icon: <Compass className="w-4 h-4" />, section: 'Discover & Match' },
    { id: 'recommended', label: 'Recommended Teams', icon: <Sparkles className="w-4 h-4" />, section: 'Discover & Match' },
    { id: 'teammates', label: 'Find Teammates', icon: <Users className="w-4 h-4" />, section: 'Discover & Match' },
    { id: 'my-team', label: 'My Team', icon: <Shield className="w-4 h-4" />, section: 'My Workspace' },
    {
      id: 'invitations',
      label: 'Invitations',
      icon: <Mail className="w-4 h-4" />,
      badge: pendingIncomingInvites.length,
      section: 'My Workspace',
    },
    { id: 'waitlist', label: 'Smart Waitlist', icon: <Clock className="w-4 h-4" />, section: 'My Workspace' },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-4 h-4" />,
      badge: unreadCount,
      section: 'My Workspace',
    },
    { id: 'profile', label: 'My Profile', icon: <UserCircle className="w-4 h-4" />, section: 'Account' },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" />, section: 'Account' },
  ];

  // Live completion checklist preview synced with form state while preserving saved server checklist
  const savedCompletionPct: number = myProfileData?.completionPct ?? myProfileData?.profile?.completionPct ?? 0;
  const savedChecklist: ProfileChecklistItem[] = myProfileData?.completionChecklist || [];

  const liveChecklistPreview = useMemo(() => {
    const nameOk = pFullName.trim().length >= 2;
    const instOk = pInstitution.trim().length >= 2;
    const locOk = pLocation.trim().length >= 2;
    const bioOk = pBio.trim().length >= 20;
    const roleOk = Boolean(pRole && pExp && pCollab);
    const interestsOk = pInterests.length >= 1;
    const skillCount = pSkillIds.length;
    const skillEarned = skillCount >= 3 ? 25 : skillCount >= 1 ? 15 : 0;
    const pct =
      (nameOk ? 15 : 0) +
      (instOk ? 8 : 0) +
      (locOk ? 7 : 0) +
      (bioOk ? 15 : 0) +
      (roleOk ? 15 : 0) +
      (interestsOk ? 15 : 0) +
      skillEarned;
    return {
      pct: Math.min(100, pct),
      items: [
        { id: 'identity', label: 'Full Name', points: 15, earned: nameOk ? 15 : 0, completed: nameOk, hint: nameOk ? 'Display name set' : 'Add your full name' },
        {
          id: 'affiliation',
          label: 'Institution & Location',
          points: 15,
          earned: (instOk ? 8 : 0) + (locOk ? 7 : 0),
          completed: instOk && locOk,
          hint: instOk && locOk ? 'College and city provided' : 'Add both college/org and city',
        },
        { id: 'bio', label: 'Builder Biography', points: 15, earned: bioOk ? 15 : 0, completed: bioOk, hint: bioOk ? 'Bio ready for leaders' : `${Math.max(0, 20 - pBio.trim().length)} more chars needed (min 20)` },
        { id: 'role', label: 'Role, Exp & Mode', points: 15, earned: roleOk ? 15 : 0, completed: roleOk, hint: `${pRole} · ${pExp}` },
        { id: 'interests', label: 'Track Interests', points: 15, earned: interestsOk ? 15 : 0, completed: interestsOk, hint: interestsOk ? `${pInterests.length} selected` : 'Pick at least 1 track' },
        { id: 'skills', label: 'Technical Skills (3+)', points: 25, earned: skillEarned, completed: skillCount >= 3, hint: skillCount >= 3 ? `${skillCount} skills selected` : `${skillCount}/3 skills selected` },
      ],
    };
  }, [pFullName, pInstitution, pLocation, pBio, pRole, pExp, pCollab, pInterests, pSkillIds]);

  const selectedSkillsObjects = useMemo(
    () => skillsCatalog.filter((s) => pSkillIds.includes(s.id)),
    [skillsCatalog, pSkillIds]
  );

  const availableSkillsFiltered = useMemo(() => {
    const q = skillSearch.trim().toLowerCase();
    return skillsCatalog.filter((s) => {
      if (pSkillIds.includes(s.id)) return false;
      if (skillCategoryFilter !== 'ALL' && s.category !== skillCategoryFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.category.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [skillsCatalog, pSkillIds, skillCategoryFilter, skillSearch]);

  const mySkillNameSet = useMemo(
    () => new Set(selectedSkillsObjects.map((s) => s.name.toLowerCase())),
    [selectedSkillsObjects]
  );

  const filteredTeams = useMemo(() => {
    const list = teams.filter((t) => {
      if (catFilter !== 'ALL' && t.category !== catFilter) return false;
      if (expFilter !== 'ALL' && t.experienceRequirement !== expFilter) return false;
      if (availOnly && t.availableSeats <= 0) return false;
      if (teamSearch.trim()) {
        const q = teamSearch.trim().toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.requiredSkills.some((s) => s.toLowerCase().includes(q))
        );
      }
      return true;
    });
    return [...list].sort((a, b) => {
      if (teamSort === 'seats') return b.availableSeats - a.availableSeats;
      if (teamSort === 'health') return (b.health?.overallScore ?? 0) - (a.health?.overallScore ?? 0);
      return (b.compatibility?.overallScore ?? 0) - (a.compatibility?.overallScore ?? 0);
    });
  }, [teams, catFilter, expFilter, availOnly, teamSearch, teamSort]);

  const filteredTeammates = useMemo(() => {
    return teammates.filter((m) => {
      if (mateRole !== 'ALL' && m.preferredRole !== mateRole) return false;
      if (mateExp !== 'ALL' && m.experienceLevel !== mateExp) return false;
      if (mateAvailOnly && m.currentTeam) return false;
      if (mateSearch.trim()) {
        const q = mateSearch.trim().toLowerCase();
        return (
          m.fullName.toLowerCase().includes(q) ||
          m.preferredRole.toLowerCase().includes(q) ||
          (m.institution || '').toLowerCase().includes(q) ||
          m.skills.some((s: string) => s.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [teammates, mateRole, mateExp, mateAvailOnly, mateSearch]);

  const filteredInvitations = useMemo(() => {
    if (inviteFilter === 'PENDING') return invitations.filter((i) => i.status === 'PENDING');
    if (inviteFilter === 'HISTORY') return invitations.filter((i) => i.status !== 'PENDING');
    return invitations;
  }, [invitations, inviteFilter]);

  const viewerLeadsMyTeam = Boolean(
    myTeamDetails &&
      user &&
      (myTeamDetails.primaryLeaderId === user.id || myTeamDetails.secondaryLeaderId === user.id)
  );

  const hasUnsavedProfileEdits = useMemo(() => {
    if (!myProfileData) return false;
    const savedIds = new Set((myProfileData.skills || []).map((s: SkillItem) => s.id));
    if (savedIds.size !== pSkillIds.length || pSkillIds.some((id) => !savedIds.has(id))) return true;
    return (
      pFullName !== (myProfileData.fullName || '') ||
      pInstitution !== (myProfileData.institution || '') ||
      pLocation !== (myProfileData.location || '') ||
      pBio !== (myProfileData.profile?.bio || '') ||
      pExp !== (myProfileData.profile?.experienceLevel || 'Intermediate') ||
      pRole !== (myProfileData.profile?.preferredRole || 'Full-Stack Developer') ||
      pCollab !== (myProfileData.profile?.collaborationMode || 'Hybrid') ||
      JSON.stringify(pInterests) !== JSON.stringify(myProfileData.profile?.projectInterests || [])
    );
  }, [myProfileData, pFullName, pInstitution, pLocation, pBio, pExp, pRole, pCollab, pInterests, pSkillIds]);

  return (
    <PortalShell
      portalTitle="Participant Portal"
      portalSubtitle="Builder Workspace"
      portalRoleKey="PARTICIPANT"
      accentColor="#1E9782"
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={onSelectTab}
      onSwitchPortal={onSwitchPortal}
      onGoHome={onGoHome}
    >
      {loading ? (
        <div className="space-y-4">
          <div className="h-24 bg-white rounded-xl border border-[#192230]/10 animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-white rounded-xl border border-[#192230]/10 animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-white rounded-xl border border-[#192230]/10 animate-pulse" />
        </div>
      ) : loadError ? (
        <div className="bg-white border border-[#EF6853]/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-8 h-8 text-[#EF6853] mx-auto" />
          <h2 className="font-display text-lg font-bold mt-3">Unable to load workspace</h2>
          <p className="text-sm text-[#66717E] mt-1">{loadError}</p>
          <button
            onClick={loadData}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#192230] text-white text-xs font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : (
        <>
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white border border-[#192230]/10 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <UserAvatar name={myProfileData?.fullName || user?.fullName || 'Builder'} size="lg" />
                  <div>
                    <h1 className="font-display text-2xl font-bold text-[#192230]">
                      Welcome back, {myProfileData?.fullName || user?.fullName}
                    </h1>
                    <p className="text-sm text-[#66717E] mt-0.5">
                      {myProfileData?.profile?.preferredRole || 'Full-Stack Developer'} ·{' '}
                      {myProfileData?.profile?.experienceLevel || 'Intermediate'} ·{' '}
                      {myProfileData?.institution || user?.institution || 'HackForge Builder'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => onSelectTab('discover')}
                    className="px-4 py-2 rounded-lg bg-[#1E9782] text-white text-xs font-semibold hover:bg-[#1E9782]/90 whitespace-nowrap"
                  >
                    Discover Teams
                  </button>
                  <button
                    onClick={() => setCreateTeamOpen(true)}
                    className="px-4 py-2 rounded-lg bg-[#192230] text-[#F7F5EF] text-xs font-semibold hover:bg-[#192230]/90 whitespace-nowrap"
                  >
                    Create Team
                  </button>
                </div>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  type="button"
                  onClick={() => onSelectTab('profile')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#1E9782]/50 rounded-xl p-5 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-[#66717E]">
                    <span>Profile Completion</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#1E9782]" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-[#1E9782] mt-1 tabular-nums">
                    {savedCompletionPct}%
                  </div>
                  <div className="w-full h-1.5 bg-[#F7F5EF] rounded-full overflow-hidden mt-2.5">
                    <div
                      className="h-full bg-[#1E9782] rounded-full transition-all"
                      style={{ width: `${savedCompletionPct}%` }}
                    />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectTab(myTeamDetails ? 'my-team' : 'discover')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#192230]/35 rounded-xl p-5 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-[#66717E]">
                    <span>Current Team</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#66717E]" />
                  </div>
                  <div className="font-display text-lg font-bold text-[#192230] mt-1 truncate">
                    {myTeamDetails ? myTeamDetails.name : 'Unassigned'}
                  </div>
                  <div className="text-xs text-[#66717E] mt-1">
                    {myTeamDetails
                      ? `${myTeamDetails.memberCount}/${myTeamDetails.maxCapacity} seats · Health ${myTeamDetails.health?.overallScore ?? 0}`
                      : 'Browse balanced squads'}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectTab('invitations')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#EF6853]/50 rounded-xl p-5 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-[#66717E]">
                    <span>Pending Invitations</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#EF6853]" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-[#EF6853] mt-1 tabular-nums">
                    {pendingIncomingInvites.length}
                  </div>
                  <div className="text-xs text-[#66717E] mt-1">
                    {invitations.length} total invitation records
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectTab('waitlist')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#8070C4]/50 rounded-xl p-5 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-[#66717E]">
                    <span>Active Waitlists</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#8070C4]" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-[#8070C4] mt-1 tabular-nums">
                    {waitlistEntries.filter((w) => w.status === 'WAITING' || w.status === 'INVITED').length}
                  </div>
                  <div className="text-xs text-[#66717E] mt-1">FIFO queue protection</div>
                </button>
              </div>

              {/* Prompt to finish profile if < 80% */}
              {savedCompletionPct < 85 && (
                <div className="bg-[#FDF4DF]/70 border border-[#E6AB43]/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#192230]">
                      Complete your skills & profile for sharper team compatibility ({savedCompletionPct}%)
                    </div>
                    <div className="text-xs text-[#66717E] mt-0.5">
                      {savedChecklist.find((c) => !c.completed)?.hint ||
                        'Select at least 3 technical skills so teams can evaluate your fit accurately.'}
                    </div>
                  </div>
                  <button
                    onClick={() => onSelectTab('profile')}
                    className="px-3.5 py-2 rounded-lg bg-[#192230] text-white text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    Update Profile
                  </button>
                </div>
              )}

              {/* Top Compatibility Matches + Recent Activity */}
              <div className="grid lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white border border-[#192230]/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-display text-lg font-semibold">Top Recommended Teams</h2>
                      <p className="text-xs text-[#66717E]">Ranked live from your saved skills, role, and track interests</p>
                    </div>
                    <button
                      onClick={() => onSelectTab('recommended')}
                      className="text-xs font-semibold text-[#1E9782] hover:underline whitespace-nowrap"
                    >
                      Full breakdown
                    </button>
                  </div>
                  <div className="divide-y divide-[#192230]/10">
                    {recommendations.slice(0, 4).map((rec) => (
                      <div key={rec.teamId} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#192230] truncate">{rec.teamName}</span>
                            <span className="text-[11px] text-[#66717E] font-mono shrink-0">
                              {rec.memberCount ?? 0}/{rec.maxCapacity ?? 5} seats
                            </span>
                          </div>
                          <div className="text-xs text-[#66717E] mt-0.5 line-clamp-1">
                            {rec.teamCategory} · {rec.suggestedContribution || rec.explanation}
                          </div>
                          <div className="w-full max-w-xs h-1.5 bg-[#F7F5EF] rounded-full overflow-hidden mt-2">
                            <div
                              className="h-full bg-[#8070C4] rounded-full"
                              style={{ width: `${rec.overallScore}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono text-sm font-bold text-[#8070C4] tabular-nums">
                            {rec.overallScore}%
                          </span>
                          <button
                            onClick={() => openTeamDetails(rec.teamId)}
                            className="px-3 py-1.5 rounded-lg border border-[#192230]/15 text-xs font-semibold hover:bg-[#F7F5EF]"
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    ))}
                    {recommendations.length === 0 && (
                      <div className="py-8 text-center text-xs text-[#66717E]">
                        No open team recommendations found yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white border border-[#192230]/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-lg font-semibold">Recent Activity</h2>
                    <button
                      onClick={() => onSelectTab('notifications')}
                      className="text-xs font-semibold text-[#1E9782] hover:underline"
                    >
                      View all
                    </button>
                  </div>
                  <div className="divide-y divide-[#192230]/10">
                    {notifications.slice(0, 5).map((n) => (
                      <div key={n.id} className="py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#192230] truncate">{n.title}</span>
                          {!n.isRead && <span className="text-[11px] font-medium text-[#EF6853] shrink-0">New</span>}
                        </div>
                        <div className="text-xs text-[#66717E] mt-0.5 line-clamp-2">{n.message}</div>
                      </div>
                    ))}
                    {notifications.length === 0 && (
                      <div className="py-8 text-center text-xs text-[#66717E]">No recent notifications.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MY PROFILE (BUG B FIX: ACCURATE COMPLETION + SKILL PERSISTENCE + CHECKLIST) */}
          {activeTab === 'profile' && (
            <div className="grid lg:grid-cols-12 gap-6 items-start">
              <form
                onSubmit={handleSaveProfile}
                className="lg:col-span-8 bg-white border border-[#192230]/10 rounded-xl p-6 space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#192230]/10 pb-4">
                  <div>
                    <h1 className="font-display text-xl font-bold">Participant Profile & Skills</h1>
                    <p className="text-xs text-[#66717E] mt-1">
                      Saved directly to PostgreSQL. Updates immediately recalculate your team compatibility scores.
                    </p>
                  </div>
                  {hasUnsavedProfileEdits && (
                    <span className="text-xs font-semibold text-[#EF6853] bg-[#FDECE9] px-3 py-1 rounded-lg self-start sm:self-center">
                      Unsaved changes
                    </span>
                  )}
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Full Name</label>
                    <input
                      type="text"
                      required
                      value={pFullName}
                      onChange={(e) => setPFullName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm focus:outline-none focus:border-[#1E9782]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">College / Institution</label>
                    <input
                      type="text"
                      value={pInstitution}
                      onChange={(e) => setPInstitution(e.target.value)}
                      placeholder="e.g., SLRTCE Mumbai"
                      className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm focus:outline-none focus:border-[#1E9782]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Location</label>
                    <input
                      type="text"
                      value={pLocation}
                      onChange={(e) => setPLocation(e.target.value)}
                      placeholder="e.g., Mumbai"
                      className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm focus:outline-none focus:border-[#1E9782]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold">Short Biography</label>
                    <span className="font-mono text-[11px] text-[#66717E] tabular-nums">
                      {pBio.trim().length} / 20+ chars
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={pBio}
                    onChange={(e) => setPBio(e.target.value)}
                    placeholder="Describe what you build best in 48 hours..."
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm focus:outline-none focus:border-[#1E9782]"
                  />
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Experience Level</label>
                    <select
                      value={pExp}
                      onChange={(e) => setPExp(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                    >
                      {EXPERIENCE_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Preferred Role</label>
                    <select
                      value={pRole}
                      onChange={(e) => setPRole(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Collaboration Mode</label>
                    <select
                      value={pCollab}
                      onChange={(e) => setPCollab(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                    >
                      {COLLAB_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-2">
                    Project Interests ({pInterests.length} selected)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => {
                      const selected = pInterests.includes(cat);
                      return (
                        <button
                          type="button"
                          key={cat}
                          onClick={() =>
                            setPInterests((prev) =>
                              selected ? prev.filter((x) => x !== cat) : [...prev, cat]
                            )
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            selected
                              ? 'bg-[#192230] text-white border-[#192230]'
                              : 'bg-[#F7F5EF] text-[#192230] border-[#192230]/15 hover:border-[#192230]/40'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected vs Available Skills */}
                <div className="space-y-4 pt-2 border-t border-[#192230]/10">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-[#192230]">
                        Your Selected Skills ({selectedSkillsObjects.length})
                      </label>
                      {selectedSkillsObjects.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setPSkillIds([])}
                          className="text-[11px] font-medium text-[#EF6853] hover:underline"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="min-h-[54px] p-3 rounded-xl bg-[#E5F3ED]/60 border border-[#1E9782]/25 flex flex-wrap gap-2 items-center">
                      {selectedSkillsObjects.length === 0 ? (
                        <span className="text-xs text-[#66717E]">
                          No technical skills selected yet. Pick skills from the catalog below and click Save Profile.
                        </span>
                      ) : (
                        selectedSkillsObjects.map((sk) => (
                          <button
                            type="button"
                            key={sk.id}
                            onClick={() => setPSkillIds((prev) => prev.filter((id) => id !== sk.id))}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1E9782] text-white text-xs font-semibold hover:bg-[#1E9782]/90"
                            title={`Remove ${sk.name}`}
                          >
                            <span>{sk.name}</span>
                            <X className="w-3 h-3" />
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Available Catalog + Custom Skill */}
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <label className="text-xs font-semibold text-[#192230]">
                        Available Skills Catalog ({availableSkillsFiltered.length})
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customSkillName}
                          onChange={(e) => setCustomSkillName(e.target.value)}
                          placeholder="Add custom skill..."
                          className="px-2.5 py-1.5 rounded-lg border border-[#192230]/15 text-xs w-36 sm:w-44"
                        />
                        <select
                          value={customSkillCat}
                          onChange={(e) => setCustomSkillCat(e.target.value)}
                          className="px-2 py-1.5 rounded-lg border border-[#192230]/15 text-xs bg-white"
                        >
                          {['Frontend', 'Backend', 'Database', 'AI/ML', 'Design', 'Cloud', 'Other'].map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleAddCustomSkill}
                          className="px-3 py-1.5 rounded-lg bg-[#F7F5EF] border border-[#192230]/15 text-xs font-semibold hover:bg-[#192230] hover:text-white transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 mb-3">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-[#66717E] absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={skillSearch}
                          onChange={(e) => setSkillSearch(e.target.value)}
                          placeholder="Filter available skills..."
                          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#192230]/15 text-xs"
                        />
                      </div>
                      <select
                        value={skillCategoryFilter}
                        onChange={(e) => setSkillCategoryFilter(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-[#192230]/15 text-xs bg-white"
                      >
                        {SKILL_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c === 'ALL' ? 'All Skill Categories' : c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="max-h-56 overflow-y-auto p-3 rounded-xl border border-[#192230]/10 bg-[#F7F5EF]/50 flex flex-wrap gap-2">
                      {availableSkillsFiltered.length === 0 ? (
                        <span className="text-xs text-[#66717E]">
                          No unselected skills match this filter.
                        </span>
                      ) : (
                        availableSkillsFiltered.map((sk) => (
                          <button
                            type="button"
                            key={sk.id}
                            onClick={() => setPSkillIds((prev) => [...prev, sk.id])}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-[#192230] border border-[#192230]/15 hover:border-[#1E9782] hover:text-[#1E9782] text-xs font-medium transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            <span>{sk.name}</span>
                            <span className="text-[10px] text-[#66717E]">· {sk.category}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#192230]/10 flex items-center justify-between gap-3">
                  <span className="text-xs text-[#66717E]">
                    Saved completion: <strong className="font-mono text-[#192230]">{savedCompletionPct}%</strong>
                  </span>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-5 py-2.5 rounded-lg bg-[#192230] text-[#F7F5EF] text-sm font-semibold hover:bg-[#192230]/90 disabled:opacity-50"
                  >
                    {savingProfile ? 'Saving & Recalculating...' : 'Save Profile'}
                  </button>
                </div>
              </form>

              {/* Profile Completion Checklist Sidebar */}
              <aside className="lg:col-span-4 bg-white border border-[#192230]/10 rounded-xl p-6 space-y-5 lg:sticky lg:top-20">
                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold">Completion Checklist</h2>
                    <span className="font-mono text-xl font-bold text-[#1E9782] tabular-nums">
                      {liveChecklistPreview.pct}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#F7F5EF] rounded-full overflow-hidden mt-3">
                    <div
                      className="h-full bg-[#1E9782] rounded-full transition-all duration-300"
                      style={{ width: `${liveChecklistPreview.pct}%` }}
                    />
                  </div>
                  {hasUnsavedProfileEdits && (
                    <p className="text-[11px] text-[#EF6853] mt-2">
                      Previewing {liveChecklistPreview.pct}% (Saved in DB: {savedCompletionPct}%). Click Save Profile to persist.
                    </p>
                  )}
                </div>

                <div className="divide-y divide-[#192230]/10">
                  {liveChecklistPreview.items.map((item) => (
                    <div key={item.id} className="py-3 flex items-start gap-3">
                      {item.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-[#1E9782] shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-[#66717E]/50 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#192230]">
                          <span>{item.label}</span>
                          <span className="font-mono text-[#66717E] tabular-nums">
                            {item.earned}/{item.points}%
                          </span>
                        </div>
                        <div className="text-[11px] text-[#66717E] mt-0.5">{item.hint}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          )}

          {/* DISCOVER TEAMS */}
          {activeTab === 'discover' && (
            <div className="space-y-5">
              <div className="bg-white border border-[#192230]/10 rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="relative sm:col-span-2">
                  <Search className="w-4 h-4 text-[#66717E] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    placeholder="Search team name, track, or skill..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                  />
                </div>
                <select
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                >
                  <option value="ALL">All Categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={expFilter}
                  onChange={(e) => setExpFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                >
                  <option value="ALL">Any Experience</option>
                  {EXPERIENCE_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <select
                  value={teamSort}
                  onChange={(e) => setTeamSort(e.target.value as 'match' | 'seats' | 'health')}
                  className="px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                >
                  <option value="match">Sort: Highest Match</option>
                  <option value="seats">Sort: Open Seats</option>
                  <option value="health">Sort: Team Health</option>
                </select>
                <button
                  type="button"
                  onClick={() => setAvailOnly((v) => !v)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap transition-colors ${
                    availOnly
                      ? 'bg-[#1E9782] text-white border-[#1E9782]'
                      : 'bg-white text-[#192230] border-[#192230]/15 hover:border-[#192230]/35'
                  }`}
                >
                  {availOnly ? 'Open Seats Only' : 'All Teams'}
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                {filteredTeams.map((team) => {
                  const fillPct = Math.round((team.memberCount / team.maxCapacity) * 100);
                  return (
                    <div
                      key={team.id}
                      className="bg-white border border-[#192230]/10 rounded-xl p-6 flex flex-col justify-between hover:border-[#192230]/25 transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs text-[#66717E]">
                          <span>
                            {team.category} · {team.collaborationMode} · {team.experienceRequirement}
                          </span>
                          <span
                            className={`font-mono font-semibold tabular-nums ${
                              team.availableSeats > 0 ? 'text-[#1E9782]' : 'text-[#EF6853]'
                            }`}
                          >
                            {team.memberCount}/{team.maxCapacity} Seats
                          </span>
                        </div>
                        <h3 className="font-display text-xl font-bold mt-2 text-[#192230]">{team.name}</h3>
                        <p className="text-sm text-[#66717E] mt-1.5 line-clamp-2">{team.description}</p>

                        <div className="mt-3 w-full h-1.5 bg-[#F7F5EF] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#192230]"
                            style={{ width: `${Math.min(100, fillPct)}%` }}
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {team.requiredSkills.slice(0, 6).map((sk) => {
                            const matched = mySkillNameSet.has(sk.toLowerCase());
                            return (
                              <span
                                key={sk}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                  matched
                                    ? 'bg-[#E5F3ED] text-[#1E9782] border-[#1E9782]/25'
                                    : 'bg-[#F7F5EF] text-[#66717E] border-[#192230]/10'
                                }`}
                              >
                                {sk}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-[#192230]/10 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-4 text-xs">
                          <span>
                            Health:{' '}
                            <strong className="font-mono text-[#E6AB43] tabular-nums">
                              {team.health?.overallScore ?? 0}/100
                            </strong>
                          </span>
                          {team.compatibility && (
                            <span>
                              Match:{' '}
                              <strong className="font-mono text-[#8070C4] tabular-nums">
                                {team.compatibility.overallScore}%
                              </strong>
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => openTeamDetails(team.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#192230] text-white text-xs font-semibold hover:bg-[#192230]/90 whitespace-nowrap"
                        >
                          <span>View Details</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filteredTeams.length === 0 && (
                  <div className="md:col-span-2 bg-white border border-[#192230]/10 rounded-xl p-10 text-center text-sm text-[#66717E]">
                    No teams match your current filters.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RECOMMENDED TEAMS (BUG C FIX: EXPLAINABLE WEIGHTED COMPATIBILITY ENGINE) */}
          {activeTab === 'recommended' && (
            <div className="space-y-5">
              <div className="bg-white border border-[#192230]/10 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold">
                    Explainable Compatibility Ranking (35% Skill · 25% Role · 15% Experience · 15% Interest · 10% Collaboration)
                  </h2>
                  <p className="text-xs text-[#66717E] mt-1 max-w-3xl">
                    Calculated directly from your saved skills ({selectedSkillsObjects.length}), preferred role ({pRole}), experience ({pExp}), track interests, and live team gaps. Compatibility scores guide transparent discovery and never auto-reject applicants.
                  </p>
                </div>
                <button
                  onClick={() => onSelectTab('profile')}
                  className="px-3.5 py-2 rounded-lg border border-[#192230]/15 text-xs font-semibold hover:bg-[#F7F5EF] whitespace-nowrap shrink-0"
                >
                  Edit Profile & Skills
                </button>
              </div>

              {recommendations.map((rec) => {
                const factorBars = [
                  { label: 'Skill Match', weight: '35%', score: rec.skillScore, color: '#1E9782' },
                  { label: 'Role Fit', weight: '25%', score: rec.roleScore, color: '#8070C4' },
                  { label: 'Experience', weight: '15%', score: rec.experienceScore, color: '#E6AB43' },
                  { label: 'Interest', weight: '15%', score: rec.interestScore, color: '#EF6853' },
                  { label: 'Collaboration', weight: '10%', score: rec.collaborationScore, color: '#192230' },
                ];
                return (
                  <div key={rec.teamId} className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-5">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-xs text-[#66717E] flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[#192230]">{rec.teamCategory}</span>
                          <span>·</span>
                          <span>{rec.teamCollabMode || 'Hybrid'}</span>
                          <span>·</span>
                          <span>{rec.teamExperienceReq || 'Intermediate'}</span>
                          <span>·</span>
                          <span className="font-mono">
                            {rec.memberCount ?? 0}/{rec.maxCapacity ?? 5} Seats
                          </span>
                        </div>
                        <h3 className="font-display text-xl font-bold text-[#192230]">{rec.teamName}</h3>
                        <p className="text-sm text-[#66717E]">{rec.explanation}</p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="font-mono text-3xl font-bold text-[#8070C4] tabular-nums">
                            {rec.overallScore}%
                          </div>
                          <div className="text-[11px] text-[#66717E]">Compatibility</div>
                        </div>
                        <button
                          onClick={() => openTeamDetails(rec.teamId)}
                          className="px-4 py-2 rounded-lg bg-[#1E9782] text-white text-xs font-semibold hover:bg-[#1E9782]/90 whitespace-nowrap"
                        >
                          Open Team
                        </button>
                      </div>
                    </div>

                    {/* 5 Weighted Component Progress Bars */}
                    <div className="grid sm:grid-cols-5 gap-4 pt-4 border-t border-[#192230]/10">
                      {factorBars.map((fb) => (
                        <div key={fb.label}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[#66717E] font-medium">
                              {fb.label} <span className="font-mono text-[10px]">({fb.weight})</span>
                            </span>
                            <span className="font-mono font-semibold text-[#192230] tabular-nums">
                              {fb.score}%
                            </span>
                          </div>
                          <div className="w-full h-2 bg-[#F7F5EF] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${fb.score}%`, backgroundColor: fb.color }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Matching, Missing, Complementary Skills & Suggested Contribution */}
                    <div className="grid md:grid-cols-3 gap-4 pt-4 border-t border-[#192230]/10 text-xs">
                      <div>
                        <div className="font-semibold text-[#192230] mb-1.5">Matching Skills</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(rec.matchingSkills || []).length > 0 ? (
                            rec.matchingSkills.map((s: string) => (
                              <span key={s} className="px-2 py-0.5 rounded bg-[#E5F3ED] text-[#1E9782] font-medium">
                                {s}
                              </span>
                            ))
                          ) : (
                            <span className="text-[#66717E]">None directly matched</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold text-[#192230] mb-1.5">Complementary Skills You Bring</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(rec.complementarySkills || []).length > 0 ? (
                            rec.complementarySkills.map((s: string) => (
                              <span key={s} className="px-2 py-0.5 rounded bg-[#EEE9FA] text-[#8070C4] font-medium">
                                {s}
                              </span>
                            ))
                          ) : (
                            <span className="text-[#66717E]">Add skills to highlight unique strengths</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold text-[#192230] mb-1.5">Team Still Needs</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(rec.missingSkills || []).length > 0 ? (
                            rec.missingSkills.slice(0, 5).map((s: string) => (
                              <span key={s} className="px-2 py-0.5 rounded bg-[#F7F5EF] text-[#66717E] border border-[#192230]/10">
                                {s}
                              </span>
                            ))
                          ) : (
                            <span className="text-[#1E9782] font-medium">All required skills covered</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {rec.suggestedContribution && (
                      <div className="p-3 rounded-lg bg-[#F7F5EF] border border-[#192230]/10 text-xs text-[#192230]">
                        <strong className="font-semibold">Suggested Contribution: </strong>
                        {rec.suggestedContribution}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* FIND TEAMMATES (DIVERSE INITIALS AVATARS, ZERO DUPLICATE PHOTOS) */}
          {activeTab === 'teammates' && (
            <div className="space-y-5">
              <div className="bg-white border border-[#192230]/10 rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="relative lg:col-span-2">
                  <Search className="w-4 h-4 text-[#66717E] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={mateSearch}
                    onChange={(e) => setMateSearch(e.target.value)}
                    placeholder="Search participants by name, skill, or institution..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                  />
                </div>
                <select
                  value={mateRole}
                  onChange={(e) => setMateRole(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                >
                  <option value="ALL">All Preferred Roles</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select
                  value={mateExp}
                  onChange={(e) => setMateExp(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                >
                  <option value="ALL">Any Experience</option>
                  {EXPERIENCE_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setMateAvailOnly((v) => !v)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                    mateAvailOnly
                      ? 'bg-[#1E9782] text-white border-[#1E9782]'
                      : 'bg-white text-[#192230] border-[#192230]/15'
                  }`}
                >
                  {mateAvailOnly ? 'Available Only' : 'All Builders'}
                </button>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTeammates.map((m) => (
                  <div
                    key={m.id}
                    className="bg-white border border-[#192230]/10 rounded-xl p-5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={m.fullName} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[#192230] truncate">{m.fullName}</div>
                          <div className="text-xs text-[#66717E] truncate">
                            {m.preferredRole} · {m.experienceLevel}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-[#66717E] mt-3 line-clamp-2">
                        {m.bio || `${m.institution || 'HackForge Builder'} · ${m.collaborationMode || 'Hybrid'}`}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {m.skills.slice(0, 5).map((sk: string) => (
                          <span
                            key={sk}
                            className="px-2 py-0.5 rounded bg-[#F7F5EF] border border-[#192230]/10 text-[11px] font-medium text-[#192230]"
                          >
                            {sk}
                          </span>
                        ))}
                        {m.skills.length === 0 && (
                          <span className="text-[11px] text-[#66717E]">Profile skills updating</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#192230]/10 flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          m.currentTeam ? 'text-[#66717E]' : 'text-[#1E9782]'
                        }`}
                      >
                        {m.currentTeam ? `In ${m.currentTeam.teamName}` : 'Available to join'}
                      </span>
                      {viewerLeadsMyTeam && !m.currentTeam && (
                        <button
                          type="button"
                          onClick={() => handleQuickInvite(m.id, m.fullName, m.preferredRole)}
                          className="px-2.5 py-1 rounded-md bg-[#192230] text-white text-[11px] font-semibold hover:bg-[#192230]/90"
                        >
                          Invite
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {filteredTeammates.length === 0 && (
                  <div className="sm:col-span-2 lg:col-span-3 bg-white border border-[#192230]/10 rounded-xl p-10 text-center text-sm text-[#66717E]">
                    No teammates match your search filters.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MY TEAM */}
          {activeTab === 'my-team' && (
            <div className="space-y-6">
              {!myTeamDetails ? (
                <div className="bg-white border border-[#192230]/10 rounded-xl p-12 text-center">
                  <h2 className="font-display text-xl font-bold">You are not in a team yet</h2>
                  <p className="text-sm text-[#66717E] mt-2 max-w-md mx-auto">
                    Explore open teams matched to your skills, or start your own balanced squad.
                  </p>
                  <div className="mt-6 flex justify-center gap-3">
                    <button
                      onClick={() => onSelectTab('discover')}
                      className="px-4 py-2 rounded-lg bg-[#1E9782] text-white text-xs font-semibold"
                    >
                      Browse Teams
                    </button>
                    <button
                      onClick={() => setCreateTeamOpen(true)}
                      className="px-4 py-2 rounded-lg border border-[#192230]/15 text-xs font-semibold"
                    >
                      Create Team
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-white border border-[#192230]/10 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-[#66717E]">
                        {myTeamDetails.category} · {myTeamDetails.collaborationMode} · {myTeamDetails.memberCount}/
                        {myTeamDetails.maxCapacity} Members
                      </div>
                      <h2 className="font-display text-2xl font-bold mt-1">{myTeamDetails.name}</h2>
                      <p className="text-sm text-[#66717E] mt-1">{myTeamDetails.description}</p>
                    </div>
                    <button
                      onClick={() => handleLeaveTeam(myTeamDetails.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#EF6853]/40 text-[#EF6853] text-xs font-semibold hover:bg-[#EF6853]/10 whitespace-nowrap shrink-0"
                    >
                      <LeaveIcon className="w-3.5 h-3.5" />
                      <span>Leave Team</span>
                    </button>
                  </div>

                  <div className="grid lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-7 bg-white border border-[#192230]/10 rounded-xl p-6">
                      <h3 className="font-display text-lg font-semibold mb-4">Team Roster</h3>
                      <div className="divide-y divide-[#192230]/10">
                        {myTeamDetails.members.map((m) => (
                          <div key={m.id} className="py-3.5 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <UserAvatar name={m.fullName} size="sm" />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-[#192230] truncate">
                                  {m.fullName}
                                  {m.userId === myTeamDetails.primaryLeaderId && (
                                    <span className="ml-2 text-[11px] font-mono text-[#EF6853]">Primary Leader</span>
                                  )}
                                  {m.userId === myTeamDetails.secondaryLeaderId && (
                                    <span className="ml-2 text-[11px] font-mono text-[#1E9782]">Secondary Leader</span>
                                  )}
                                </div>
                                <div className="text-xs text-[#66717E] truncate">
                                  {m.teamRole} · {m.experienceLevel || 'Intermediate'} ·{' '}
                                  {m.skills.slice(0, 4).join(', ') || 'Skills syncing'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="lg:col-span-5 bg-white border border-[#192230]/10 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-display text-lg font-semibold">Team Health</h3>
                        <span className="font-mono text-xl font-bold text-[#E6AB43] tabular-nums">
                          {myTeamDetails.health?.overallScore ?? 0}/100
                        </span>
                      </div>
                      <div className="text-xs font-medium text-[#66717E] mb-4">
                        Status: {myTeamDetails.health?.statusLabel || 'Evaluating'}
                      </div>
                      {myTeamDetails.health && (
                        <>
                          <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={[
                                  { name: 'Skills', score: myTeamDetails.health.skillCoverageScore },
                                  { name: 'Roles', score: myTeamDetails.health.roleCoverageScore },
                                  { name: 'Exp', score: myTeamDetails.health.experienceBalanceScore },
                                  { name: 'Leader', score: myTeamDetails.health.leadershipReadinessScore },
                                  { name: 'Reqs', score: myTeamDetails.health.requirementFulfillmentScore },
                                ]}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Bar dataKey="score" name="Score" fill="#1E9782" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          {myTeamDetails.health.missingRoles.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-[#192230]/10 text-xs text-[#66717E]">
                              <strong className="text-[#192230]">Missing Roles:</strong>{' '}
                              {myTeamDetails.health.missingRoles.join(', ')}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* INVITATIONS */}
          {activeTab === 'invitations' && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">Team Invitations & Requests</h2>
                  <p className="text-xs text-[#66717E]">Accepting an invitation allocates your seat atomically.</p>
                </div>
                <div className="flex gap-1.5 bg-[#F7F5EF] p-1 rounded-lg border border-[#192230]/10 self-start">
                  {(['ALL', 'PENDING', 'HISTORY'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setInviteFilter(f)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                        inviteFilter === f ? 'bg-[#192230] text-white' : 'text-[#66717E] hover:text-[#192230]'
                      }`}
                    >
                      {f === 'ALL' ? 'All' : f === 'PENDING' ? 'Pending' : 'Resolved'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-[#192230]/10">
                {filteredInvitations.map((inv) => (
                  <div key={inv.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-[#66717E]">
                        {inv.type} · {inv.teamCategory} ·{' '}
                        <span
                          className={`font-semibold ${
                            inv.status === 'ACCEPTED'
                              ? 'text-[#1E9782]'
                              : inv.status === 'PENDING'
                              ? 'text-[#E6AB43]'
                              : 'text-[#66717E]'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-[#192230] mt-0.5">
                        {inv.teamName} — Role: {inv.proposedRole}
                      </div>
                      {inv.message && <p className="text-xs text-[#66717E] mt-1">{inv.message}</p>}
                    </div>
                    {inv.status === 'PENDING' && inv.type === 'INVITE' && inv.userId === user?.id && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={async () => {
                            try {
                              await apiFetch(`/api/invitations/${inv.id}/accept`, { method: 'POST' });
                              pushToast('success', `Joined ${inv.teamName}!`);
                              await loadData();
                            } catch (err: any) {
                              pushToast('error', err.message);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1E9782] text-white text-xs font-semibold"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept</span>
                        </button>
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/invitations/${inv.id}/decline`, { method: 'POST' });
                            pushToast('info', 'Invitation declined.');
                            await loadData();
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#192230]/15 text-xs font-semibold"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {filteredInvitations.length === 0 && (
                  <div className="py-10 text-center text-xs text-[#66717E]">
                    No invitations or requests match this filter.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SMART WAITLIST */}
          {activeTab === 'waitlist' && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
              <div className="mb-4">
                <h2 className="font-display text-lg font-semibold">My Smart Waitlist Positions</h2>
                <p className="text-xs text-[#66717E] mt-1">
                  Positions are strictly FIFO ordered. Accepting a promoted seat uses PostgreSQL SELECT FOR UPDATE concurrency protection.
                </p>
              </div>
              <div className="divide-y divide-[#192230]/10">
                {waitlistEntries.map((w) => (
                  <div key={w.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-[#66717E]">
                        <span className="font-mono font-bold text-[#192230]">Queue #{w.queuePosition}</span> ·
                        Compatibility{' '}
                        <span className="font-mono font-semibold text-[#8070C4]">{w.compatibilityScore}%</span> ·
                        Status: <span className="font-semibold text-[#192230]">{w.status}</span>
                      </div>
                      <div className="text-sm font-semibold text-[#192230] mt-0.5">{w.teamName}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {w.status === 'INVITED' && (
                        <button
                          onClick={async () => {
                            try {
                              await apiFetch(`/api/waitlist/${w.id}/accept`, { method: 'POST' });
                              pushToast('success', `Seat confirmed in ${w.teamName}!`);
                              await loadData();
                            } catch (err: any) {
                              pushToast('error', err.message);
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-[#1E9782] text-white text-xs font-semibold"
                        >
                          Accept Open Seat
                        </button>
                      )}
                      {(w.status === 'WAITING' || w.status === 'INVITED') && (
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/waitlist/${w.id}/decline`, { method: 'POST' });
                            pushToast('info', 'Waitlist entry updated.');
                            await loadData();
                          }}
                          className="px-3 py-1.5 rounded-lg border border-[#192230]/15 text-xs font-semibold"
                        >
                          {w.status === 'INVITED' ? 'Decline' : 'Leave Waitlist'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {waitlistEntries.length === 0 && (
                  <div className="py-10 text-center text-xs text-[#66717E]">
                    You have not joined any team waitlists.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-semibold">Notification History</h2>
                <button
                  onClick={() => markAllNotificationsRead()}
                  className="text-xs font-semibold text-[#1E9782] hover:underline"
                >
                  Mark all as read
                </button>
              </div>
              <div className="divide-y divide-[#192230]/10">
                {notifications.map((n) => (
                  <div key={n.id} className="py-3.5 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-[#192230]">{n.title}</div>
                      <div className="text-xs text-[#66717E] mt-1">{n.message}</div>
                      <div className="font-mono text-[11px] text-[#66717E] mt-1">
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>
                    {!n.isRead && (
                      <button
                        onClick={() => markNotificationRead(n.id)}
                        className="px-2.5 py-1 rounded bg-[#F7F5EF] text-xs font-medium shrink-0"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div className="py-10 text-center text-xs text-[#66717E]">No notifications yet.</div>
                )}
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {activeTab === 'settings' && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Account & Workspace Settings</h2>
                <p className="text-xs text-[#66717E] mt-1">
                  Signed in as <strong className="text-[#192230]">{user?.email}</strong> ({user?.role})
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-[#F7F5EF] border border-[#192230]/10">
                  <div className="font-semibold text-[#192230]">Identity & Profile</div>
                  <div className="text-[#66717E] mt-1">
                    Display name: {myProfileData?.fullName || user?.fullName} · Completion: {savedCompletionPct}%
                  </div>
                  <button
                    onClick={() => onSelectTab('profile')}
                    className="mt-3 text-xs font-semibold text-[#1E9782] hover:underline"
                  >
                    Manage Profile & Skills →
                  </button>
                </div>
                <div className="p-4 rounded-xl bg-[#F7F5EF] border border-[#192230]/10">
                  <div className="font-semibold text-[#192230]">Lead Your Own Team</div>
                  <div className="text-[#66717E] mt-1">
                    Start a new hackathon team to unlock Team Health diagnostics and Succession controls.
                  </div>
                  <button
                    onClick={() => setCreateTeamOpen(true)}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EF6853] text-white text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create New Team</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Team Details Modal */}
      {selectedTeam && (
        <div className="fixed inset-0 z-50 bg-[#192230]/55 flex items-center justify-center p-4">
          <div className="bg-white border border-[#192230]/15 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-[#66717E]">
                  {selectedTeam.category} · {selectedTeam.collaborationMode} · {selectedTeam.memberCount}/
                  {selectedTeam.maxCapacity} Members
                </div>
                <h2 className="font-display text-2xl font-bold mt-1">{selectedTeam.name}</h2>
              </div>
              <button
                onClick={() => setSelectedTeam(null)}
                className="p-1.5 rounded-lg border border-[#192230]/15 hover:bg-[#F7F5EF]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-[#66717E]">{selectedTeam.description}</p>

            <div className="grid sm:grid-cols-2 gap-4 bg-[#F7F5EF] p-4 rounded-xl border border-[#192230]/10">
              <div>
                <div className="text-xs text-[#66717E]">Team Health Score</div>
                <div className="font-mono text-2xl font-bold text-[#E6AB43] tabular-nums mt-0.5">
                  {selectedTeam.health?.overallScore ?? 0}/100
                </div>
                <div className="text-xs text-[#192230] mt-1">{selectedTeam.health?.statusLabel}</div>
              </div>
              <div>
                <div className="text-xs text-[#66717E]">Your Compatibility</div>
                <div className="font-mono text-2xl font-bold text-[#8070C4] tabular-nums mt-0.5">
                  {selectedTeam.compatibility?.overallScore ?? 0}%
                </div>
                <div className="text-xs text-[#66717E] mt-1 line-clamp-2">
                  {selectedTeam.compatibility?.explanation}
                </div>
              </div>
            </div>

            {selectedTeam.compatibility?.suggestedContribution && (
              <div className="p-3 rounded-lg bg-[#E5F3ED]/60 border border-[#1E9782]/25 text-xs text-[#192230]">
                <strong>Suggested Contribution: </strong>
                {selectedTeam.compatibility.suggestedContribution}
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold text-[#192230] mb-2">
                Current Members ({selectedTeam.members.length}/{selectedTeam.maxCapacity})
              </h3>
              <div className="divide-y divide-[#192230]/10 border border-[#192230]/10 rounded-lg">
                {selectedTeam.members.map((m) => (
                  <div key={m.id} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar name={m.fullName} size="sm" />
                      <span className="font-medium text-[#192230]">{m.fullName}</span>
                    </div>
                    <span className="text-[#66717E]">
                      {m.teamRole} {m.isLeader ? '· Leader' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-[#66717E]">
              <strong className="text-[#192230]">Required Skills:</strong>{' '}
              {selectedTeam.requirements.requiredSkills.join(', ') || 'None specified'}
            </div>

            <div className="pt-4 border-t border-[#192230]/10 flex flex-wrap items-center justify-end gap-3">
              {selectedTeam.isViewerMember ? (
                <span className="text-xs font-semibold text-[#1E9782]">You are already a member</span>
              ) : selectedTeam.availableSeats > 0 ? (
                <>
                  <button
                    onClick={() => handleSendJoinRequest(selectedTeam.id)}
                    className="px-4 py-2 rounded-lg border border-[#192230]/15 text-xs font-semibold hover:bg-[#F7F5EF]"
                  >
                    Send Join Request
                  </button>
                  <button
                    onClick={() => handleJoinTeam(selectedTeam.id)}
                    className="px-4 py-2 rounded-lg bg-[#1E9782] text-white text-xs font-semibold hover:bg-[#1E9782]/90"
                  >
                    Join Team Immediately (Race-Proof)
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleJoinWaitlist(selectedTeam.id)}
                  className="px-4 py-2 rounded-lg bg-[#8070C4] text-white text-xs font-semibold hover:bg-[#8070C4]/90"
                >
                  Team Full — Join Smart Waitlist
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {createTeamOpen && (
        <div className="fixed inset-0 z-50 bg-[#192230]/55 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTeam}
            className="bg-white border border-[#192230]/15 rounded-xl max-w-lg w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Create a New Team</h2>
              <button type="button" onClick={() => setCreateTeamOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Team Name</label>
              <input
                type="text"
                required
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g., QuantumPulse"
                className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Project Description</label>
              <textarea
                rows={3}
                required
                value={newTeamDesc}
                onChange={(e) => setNewTeamDesc(e.target.value)}
                placeholder="What problem is your team solving?"
                className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Category</label>
                <select
                  value={newTeamCat}
                  onChange={(e) => setNewTeamCat(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Max Capacity</label>
                <input
                  type="number"
                  min={2}
                  max={6}
                  value={newTeamCap}
                  onChange={(e) => setNewTeamCap(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateTeamOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#192230]/15 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#EF6853] text-white text-xs font-semibold"
              >
                Create Team
              </button>
            </div>
          </form>
        </div>
      )}
    </PortalShell>
  );
};
