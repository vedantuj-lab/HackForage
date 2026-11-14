import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Shield,
  PlusCircle,
  Users,
  ListChecks,
  Activity,
  UserPlus,
  Mail,
  Clock,
  GitBranch,
  History,
  Settings,
  Check,
  X,
  Trash2,
  RefreshCw,
  Search,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Legend,
} from 'recharts';
import { PortalShell, NavItem } from '../components/PortalShell.tsx';
import { UserAvatar } from '../components/UserAvatar.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../services/api.ts';
import {
  InvitationItem,
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

interface LeaderPortalProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onGoHome: () => void;
  onSwitchPortal: (target: 'PARTICIPANT' | 'TEAM_LEADER' | 'ADMIN') => void;
}

export const LeaderPortal: React.FC<LeaderPortalProps> = ({
  activeTab,
  onSelectTab,
  onGoHome,
  onSwitchPortal,
}) => {
  const { user, pushToast, refreshSession } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadingTeamDetails, setLoadingTeamDetails] = useState(false);
  const [teamDetailsError, setTeamDetailsError] = useState<string | null>(null);

  const [ledTeams, setLedTeams] = useState<TeamSummary[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [teamDetails, setTeamDetails] = useState<TeamDetails | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntryItem[]>([]);
  const [leadershipHistory, setLeadershipHistory] = useState<any[]>([]);
  const [skillsCatalog, setSkillsCatalog] = useState<SkillItem[]>([]);

  // Create team form
  const [cName, setCName] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cCat, setCCat] = useState('Artificial Intelligence');
  const [cCap, setCCap] = useState(5);
  const [cExp, setCExp] = useState('Intermediate');
  const [cCollab, setCCollab] = useState('Hybrid');
  const [cVis, setCVis] = useState('PUBLIC');
  const [cReqSkills, setCReqSkills] = useState<string[]>(['React', 'Node.js', 'PostgreSQL', 'Python']);
  const [cReqRoles, setCReqRoles] = useState<string[]>([
    'Frontend Developer',
    'Backend Developer',
    'AI/ML Developer',
    'UI/UX Designer',
  ]);

  // Edit requirements / team settings
  const [reqSkillsEdit, setReqSkillsEdit] = useState<string[]>([]);
  const [reqRolesEdit, setReqRolesEdit] = useState<string[]>([]);
  const [reqSkillFilter, setReqSkillFilter] = useState('');
  const [minExpEdit, setMinExpEdit] = useState('Intermediate');
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamDesc, setEditTeamDesc] = useState('');
  const [editTeamCap, setEditTeamCap] = useState(5);
  const [editTeamCollab, setEditTeamCollab] = useState('Hybrid');
  const [editTeamVis, setEditTeamVis] = useState('PUBLIC');

  // Leadership actions
  const [secondaryTarget, setSecondaryTarget] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Find Members & Invitations filters
  const [candSearch, setCandSearch] = useState('');
  const [candRole, setCandRole] = useState('ALL');
  const [candExp, setCandExp] = useState('ALL');
  const [candUnassignedOnly, setCandUnassignedOnly] = useState(true);
  const [inviteRoleMap, setInviteRoleMap] = useState<Record<string, string>>({});
  const [invStatusTab, setInvStatusTab] = useState<'ALL' | 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'>('ALL');

  const syncTeamEditForms = useCallback((team: TeamDetails) => {
    setReqSkillsEdit(team.requirements?.requiredSkills || team.requiredSkills || []);
    setReqRolesEdit(team.requirements?.requiredRoles || team.requiredRoles || []);
    setMinExpEdit(team.requirements?.minExperience || team.experienceRequirement || 'Intermediate');
    setEditTeamName(team.name || '');
    setEditTeamDesc(team.description || '');
    setEditTeamCap(team.maxCapacity || 5);
    setEditTeamCollab(team.collaborationMode || 'Hybrid');
    setEditTeamVis(team.visibility || 'PUBLIC');
  }, []);

  const loadSelectedTeamDetails = useCallback(
    async (teamId: string) => {
      if (!teamId) {
        setTeamDetails(null);
        setTeamDetailsError(null);
        return;
      }
      setLoadingTeamDetails(true);
      setTeamDetailsError(null);

      try {
        // Fetch team details independently first so auxiliary latency/errors NEVER blank out My Team
        const detailRes = await apiFetch<{ team: TeamDetails }>(`/api/teams/${teamId}`);
        setTeamDetails(detailRes.team);
        syncTeamEditForms(detailRes.team);
      } catch (err: any) {
        setTeamDetailsError(err.message || 'Unable to load selected team details.');
        setLoadingTeamDetails(false);
        return;
      } finally {
        setLoadingTeamDetails(false);
      }

      // Auxiliary endpoints load concurrently without blocking My Team
      const [candRes, wlRes, histRes] = await Promise.allSettled([
        apiFetch<{ candidates: any[] }>(`/api/compatibility/teams/${teamId}`),
        apiFetch<{ waitlist: WaitlistEntryItem[] }>(`/api/teams/${teamId}/waitlist`),
        apiFetch<{ history: any[] }>(`/api/teams/${teamId}/leadership/history`),
      ]);

      if (candRes.status === 'fulfilled') setCandidates(candRes.value.candidates);
      else setCandidates([]);

      if (wlRes.status === 'fulfilled') setWaitlist(wlRes.value.waitlist);
      else setWaitlist([]);

      if (histRes.status === 'fulfilled') setLeadershipHistory(histRes.value.history);
      else setLeadershipHistory([]);
    },
    [syncTeamEditForms]
  );

  const loadTeamsAndData = useCallback(
    async (preferredTeamId?: string) => {
      if (!user) return;
      setLoading(true);
      setTeamDetailsError(null);
      try {
        const [teamsRes, skillsRes, invRes] = await Promise.allSettled([
          apiFetch<{ teams: TeamSummary[] }>('/api/teams'),
          apiFetch<{ skills: SkillItem[] }>('/api/skills'),
          apiFetch<{ invitations: InvitationItem[] }>('/api/invitations'),
        ]);

        if (skillsRes.status === 'fulfilled') setSkillsCatalog(skillsRes.value.skills);
        if (invRes.status === 'fulfilled') setInvitations(invRes.value.invitations);

        if (teamsRes.status !== 'fulfilled') {
          setTeamDetailsError('Failed to fetch managed teams.');
          setLoading(false);
          return;
        }

        const mine = teamsRes.value.teams.filter(
          (t) =>
            t.primaryLeaderId === user.id ||
            t.secondaryLeaderId === user.id ||
            user.role === 'ADMIN'
        );
        setLedTeams(mine);

        const targetId =
          preferredTeamId && mine.some((m) => m.id === preferredTeamId)
            ? preferredTeamId
            : selectedTeamId && mine.some((m) => m.id === selectedTeamId)
            ? selectedTeamId
            : mine[0]?.id || '';

        setSelectedTeamId(targetId);
        if (targetId) {
          setLoadingTeamDetails(true);
          setLoading(false);
          await loadSelectedTeamDetails(targetId);
        } else {
          setTeamDetails(null);
          setLoading(false);
        }
      } catch (err: any) {
        setTeamDetailsError(err.message || 'Failed to load Team Leader portal.');
        setLoading(false);
      }
    },
    [user, selectedTeamId, loadSelectedTeamDetails]
  );

  useEffect(() => {
    loadTeamsAndData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSelectTeam = (id: string) => {
    setSelectedTeamId(id);
    loadSelectedTeamDetails(id);
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ team: TeamDetails }>('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: cName,
          description: cDesc,
          category: cCat,
          maxCapacity: cCap,
          experienceRequirement: cExp,
          collaborationMode: cCollab,
          visibility: cVis,
          requiredSkills: cReqSkills,
          requiredRoles: cReqRoles,
        }),
      });
      pushToast('success', `Team "${res.team.name}" created.`);
      setCName('');
      setCDesc('');
      await refreshSession();
      await loadTeamsAndData(res.team.id);
      onSelectTab('my-team');
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to create team.');
    }
  };

  const handleUpdateRequirements = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamDetails) return;
    try {
      await apiFetch(`/api/teams/${teamDetails.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          requiredSkills: reqSkillsEdit,
          requiredRoles: reqRolesEdit,
          experienceRequirement: minExpEdit,
        }),
      });
      pushToast('success', 'Team requirements updated & Team Health recalculated.');
      await loadSelectedTeamDetails(teamDetails.id);
    } catch (err: any) {
      pushToast('error', err.message || 'Update failed.');
    }
  };

  const handleUpdateTeamSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamDetails) return;
    try {
      await apiFetch(`/api/teams/${teamDetails.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editTeamName,
          description: editTeamDesc,
          maxCapacity: editTeamCap,
          collaborationMode: editTeamCollab,
          visibility: editTeamVis,
        }),
      });
      pushToast('success', 'Team settings saved.');
      await loadTeamsAndData(teamDetails.id);
    } catch (err: any) {
      pushToast('error', err.message || 'Update failed.');
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!teamDetails) return;
    try {
      await apiFetch(`/api/teams/${teamDetails.id}/members/${targetUserId}`, { method: 'DELETE' });
      pushToast('info', 'Member removed and Smart Waitlist checked for vacancies.');
      setConfirmRemoveId(null);
      await loadTeamsAndData(teamDetails.id);
    } catch (err: any) {
      pushToast('error', err.message || 'Could not remove member.');
    }
  };

  const handleInviteCandidate = async (candidateId: string, defaultRole: string) => {
    if (!teamDetails) return;
    const role = inviteRoleMap[candidateId] || defaultRole;
    try {
      await apiFetch(`/api/teams/${teamDetails.id}/invitations`, {
        method: 'POST',
        body: JSON.stringify({
          userId: candidateId,
          type: 'INVITE',
          proposedRole: role,
          message: `Join ${teamDetails.name} as our ${role}!`,
        }),
      });
      pushToast('success', 'Invitation sent to candidate.');
      await loadTeamsAndData(teamDetails.id);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to send invitation.');
    }
  };

  const handleAssignSecondary = async () => {
    if (!teamDetails || !secondaryTarget) return;
    try {
      await apiFetch(`/api/teams/${teamDetails.id}/leadership/secondary`, {
        method: 'POST',
        body: JSON.stringify({ targetUserId: secondaryTarget }),
      });
      pushToast('success', 'Secondary leader assigned.');
      setSecondaryTarget('');
      await loadSelectedTeamDetails(teamDetails.id);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to assign secondary leader.');
    }
  };

  const handleTransferLeadership = async () => {
    if (!teamDetails || !transferTarget) return;
    try {
      await apiFetch(`/api/teams/${teamDetails.id}/leadership/transfer`, {
        method: 'POST',
        body: JSON.stringify({ newLeaderId: transferTarget, reason: transferReason }),
      });
      pushToast('success', 'Primary leadership transferred transactionally.');
      setTransferReason('');
      setTransferTarget('');
      await refreshSession();
      await loadTeamsAndData(teamDetails.id);
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to transfer leadership.');
    }
  };

  const teamInvitations = useMemo(
    () => invitations.filter((i) => i.teamId === selectedTeamId),
    [invitations, selectedTeamId]
  );
  const pendingRequests = useMemo(
    () => teamInvitations.filter((i) => i.type === 'REQUEST' && i.status === 'PENDING'),
    [teamInvitations]
  );
  const filteredTeamInvitations = useMemo(() => {
    if (invStatusTab === 'ALL') return teamInvitations;
    return teamInvitations.filter((i) => i.status === invStatusTab);
  }, [teamInvitations, invStatusTab]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" />, section: 'Operations' },
    { id: 'my-team', label: 'My Team', icon: <Shield className="w-4 h-4" />, section: 'Operations' },
    { id: 'create-team', label: 'Create Team', icon: <PlusCircle className="w-4 h-4" />, section: 'Operations' },
    { id: 'members', label: 'Team Members', icon: <Users className="w-4 h-4" />, section: 'Roster & Matching' },
    { id: 'requirements', label: 'Team Requirements', icon: <ListChecks className="w-4 h-4" />, section: 'Roster & Matching' },
    { id: 'health', label: 'Team Health', icon: <Activity className="w-4 h-4" />, section: 'Roster & Matching' },
    { id: 'find-members', label: 'Find Members', icon: <UserPlus className="w-4 h-4" />, section: 'Roster & Matching' },
    {
      id: 'invitations',
      label: 'Invitations',
      icon: <Mail className="w-4 h-4" />,
      badge: pendingRequests.length,
      section: 'Governance',
    },
    { id: 'waitlist', label: 'Smart Waitlist', icon: <Clock className="w-4 h-4" />, section: 'Governance' },
    { id: 'leadership', label: 'Leadership', icon: <GitBranch className="w-4 h-4" />, section: 'Governance' },
    { id: 'history', label: 'Activity History', icon: <History className="w-4 h-4" />, section: 'Configuration' },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" />, section: 'Configuration' },
  ];

  const nonPrimaryMembers = useMemo(
    () => (teamDetails?.members || []).filter((m) => m.userId !== teamDetails?.primaryLeaderId),
    [teamDetails]
  );

  // Derived coverage metrics for My Team
  const memberRolesSet = useMemo(
    () => new Set((teamDetails?.members || []).map((m) => m.teamRole)),
    [teamDetails]
  );
  const memberSkillsSet = useMemo(
    () => new Set((teamDetails?.members || []).flatMap((m) => m.skills.map((s) => s.toLowerCase()))),
    [teamDetails]
  );

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (candRole !== 'ALL' && c.preferredRole !== candRole) return false;
      if (candExp !== 'ALL' && c.experienceLevel !== candExp) return false;
      if (candUnassignedOnly && c.currentTeam) return false;
      if (candSearch.trim()) {
        const q = candSearch.trim().toLowerCase();
        return (
          c.fullName.toLowerCase().includes(q) ||
          c.preferredRole.toLowerCase().includes(q) ||
          (c.institution || '').toLowerCase().includes(q) ||
          (c.skills || []).some((s: string) => s.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [candidates, candRole, candExp, candUnassignedOnly, candSearch]);

  const activeTeamSummary = ledTeams.find((t) => t.id === selectedTeamId);

  return (
    <PortalShell
      portalTitle="Team Leader Portal"
      portalSubtitle="Team Operations"
      portalRoleKey="TEAM_LEADER"
      accentColor="#EF6853"
      sidebarDark
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={onSelectTab}
      onSwitchPortal={onSwitchPortal}
      onGoHome={onGoHome}
    >
      {/* Active Team Selector Bar */}
      {ledTeams.length > 0 && activeTab !== 'create-team' && (
        <div className="mb-6 bg-white border border-[#192230]/10 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[#66717E]">Managed Team:</span>
            <select
              value={selectedTeamId}
              onChange={(e) => handleSelectTeam(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#192230]/15 text-sm font-semibold bg-[#F7F5EF] text-[#192230]"
            >
              {ledTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.memberCount}/{t.maxCapacity})
                </option>
              ))}
            </select>
          </div>
          {(teamDetails || activeTeamSummary) && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#66717E]">
              <span>
                Category:{' '}
                <strong className="text-[#192230]">
                  {teamDetails?.category || activeTeamSummary?.category}
                </strong>
              </span>
              <span>
                Health:{' '}
                <strong className="font-mono text-[#E6AB43] tabular-nums">
                  {teamDetails?.health?.overallScore ?? activeTeamSummary?.health?.overallScore ?? 0}/100
                </strong>
              </span>
              <button
                type="button"
                onClick={() => selectedTeamId && loadSelectedTeamDetails(selectedTeamId)}
                className="inline-flex items-center gap-1 text-[#192230] font-semibold hover:text-[#EF6853]"
                title="Refresh selected team"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTeamDetails ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          )}
        </div>
      )}

      {loading || (loadingTeamDetails && !teamDetails && activeTab !== 'create-team') ? (
        <div className="space-y-4">
          <div className="h-28 bg-white rounded-xl border border-[#192230]/10 animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-white rounded-xl border border-[#192230]/10 animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-white rounded-xl border border-[#192230]/10 animate-pulse" />
        </div>
      ) : teamDetailsError && activeTab !== 'create-team' ? (
        <div className="bg-white border border-[#EF6853]/30 rounded-xl p-10 text-center">
          <AlertCircle className="w-8 h-8 text-[#EF6853] mx-auto" />
          <h2 className="font-display text-lg font-bold mt-3">Could not load team details</h2>
          <p className="text-sm text-[#66717E] mt-1">{teamDetailsError}</p>
          <button
            onClick={() => (selectedTeamId ? loadSelectedTeamDetails(selectedTeamId) : loadTeamsAndData())}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#192230] text-white text-xs font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : !teamDetails && activeTab !== 'create-team' ? (
        <div className="bg-white border border-[#192230]/10 rounded-xl p-12 text-center">
          <h2 className="font-display text-xl font-bold">No Managed Teams Found</h2>
          <p className="text-sm text-[#66717E] mt-2 max-w-md mx-auto">
            Create a team to unlock Team Health diagnostics, candidate compatibility, and leadership succession controls.
          </p>
          <button
            onClick={() => onSelectTab('create-team')}
            className="mt-5 px-5 py-2.5 rounded-lg bg-[#EF6853] text-white text-xs font-semibold"
          >
            Create Your Team
          </button>
        </div>
      ) : (
        <>
          {/* OVERVIEW */}
          {activeTab === 'overview' && teamDetails && (
            <div className="space-y-6">
              {ledTeams.length > 1 && (
                <div className="bg-white border border-[#192230]/10 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[#66717E]">
                      Your Managed Teams ({ledTeams.length})
                    </h2>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {ledTeams.map((t) => {
                      const active = t.id === selectedTeamId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            handleSelectTeam(t.id);
                            onSelectTab('my-team');
                          }}
                          className={`text-left p-4 rounded-xl border transition-colors ${
                            active
                              ? 'bg-[#192230] text-[#F7F5EF] border-[#192230]'
                              : 'bg-[#F7F5EF]/60 text-[#192230] border-[#192230]/10 hover:border-[#192230]/35'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display font-bold text-sm truncate">{t.name}</span>
                            <span className="font-mono text-xs tabular-nums shrink-0">
                              {t.memberCount}/{t.maxCapacity}
                            </span>
                          </div>
                          <div className={`text-xs mt-1 ${active ? 'text-[#F7F5EF]/70' : 'text-[#66717E]'}`}>
                            {t.category} · Health {t.health?.overallScore ?? 0}/100
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  type="button"
                  onClick={() => onSelectTab('my-team')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#192230]/35 rounded-xl p-5"
                >
                  <div className="text-xs text-[#66717E]">Seat Capacity</div>
                  <div className="font-mono text-2xl font-bold mt-1 tabular-nums">
                    {teamDetails.memberCount}/{teamDetails.maxCapacity}
                  </div>
                  <div className="text-xs text-[#1E9782] mt-0.5">
                    {teamDetails.availableSeats} open seat{teamDetails.availableSeats === 1 ? '' : 's'}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('health')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#E6AB43]/60 rounded-xl p-5"
                >
                  <div className="text-xs text-[#66717E]">Team Health Score</div>
                  <div className="font-mono text-2xl font-bold text-[#E6AB43] mt-1 tabular-nums">
                    {teamDetails.health?.overallScore ?? 0}/100
                  </div>
                  <div className="text-xs text-[#66717E] mt-0.5">{teamDetails.health?.statusLabel}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('invitations')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#EF6853]/50 rounded-xl p-5"
                >
                  <div className="text-xs text-[#66717E]">Pending Join Requests</div>
                  <div className="font-mono text-2xl font-bold text-[#EF6853] mt-1 tabular-nums">
                    {pendingRequests.length}
                  </div>
                  <div className="text-xs text-[#66717E] mt-0.5">{teamInvitations.length} total invitations</div>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('waitlist')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#8070C4]/50 rounded-xl p-5"
                >
                  <div className="text-xs text-[#66717E]">Waitlist Queue</div>
                  <div className="font-mono text-2xl font-bold text-[#8070C4] mt-1 tabular-nums">
                    {waitlist.filter((w) => w.status === 'WAITING' || w.status === 'INVITED').length}
                  </div>
                  <div className="text-xs text-[#66717E] mt-0.5">FIFO auto-promotion ready</div>
                </button>
              </div>

              <div className="grid lg:grid-cols-12 gap-6">
                <div className="lg:col-span-6 bg-white border border-[#192230]/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display text-lg font-semibold">Health Action Items</h2>
                    <button
                      onClick={() => onSelectTab('health')}
                      className="text-xs font-semibold text-[#EF6853] hover:underline"
                    >
                      Full Diagnostics
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {(teamDetails.health?.recommendations || []).map((rec, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-[#F7F5EF] border border-[#192230]/10 text-xs text-[#192230]"
                      >
                        {i + 1}. {rec}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-6 bg-white border border-[#192230]/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display text-lg font-semibold">Top Compatible Candidates</h2>
                    <button
                      onClick={() => onSelectTab('find-members')}
                      className="text-xs font-semibold text-[#1E9782] hover:underline"
                    >
                      Recruit Members
                    </button>
                  </div>
                  <div className="divide-y divide-[#192230]/10">
                    {candidates.slice(0, 4).map((c) => (
                      <div key={c.userId} className="py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar name={c.fullName} size="sm" />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{c.fullName}</div>
                            <div className="text-xs text-[#66717E] truncate">
                              {c.preferredRole} · {c.experienceLevel}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-sm font-bold text-[#8070C4] tabular-nums shrink-0">
                          {c.overallScore}%
                        </span>
                      </div>
                    ))}
                    {candidates.length === 0 && (
                      <div className="py-6 text-center text-xs text-[#66717E]">
                        No open candidates computed yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MY TEAM (PRIORITY BUG E FIX: FULL WORKSPACE + ROSTER + COVERAGE + ACTIONS) */}
          {activeTab === 'my-team' && teamDetails && (
            <div className="space-y-6">
              {/* Summary Header Card */}
              <div className="bg-white border border-[#192230]/10 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#66717E]">
                    <span className="font-semibold text-[#192230]">{teamDetails.category}</span>
                    <span>·</span>
                    <span>{teamDetails.collaborationMode}</span>
                    <span>·</span>
                    <span>Min {teamDetails.experienceRequirement}</span>
                    <span>·</span>
                    <span className="font-mono">{teamDetails.visibility}</span>
                  </div>
                  <h1 className="font-display text-2xl font-bold text-[#192230]">{teamDetails.name}</h1>
                  <p className="text-sm text-[#66717E] max-w-2xl">{teamDetails.description}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => onSelectTab('find-members')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#EF6853] text-white text-xs font-semibold hover:bg-[#EF6853]/90"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Find Members</span>
                  </button>
                  <button
                    onClick={() => onSelectTab('requirements')}
                    className="px-3.5 py-2 rounded-lg border border-[#192230]/15 text-xs font-semibold hover:bg-[#F7F5EF]"
                  >
                    Requirements
                  </button>
                  <button
                    onClick={() => onSelectTab('settings')}
                    className="px-3.5 py-2 rounded-lg border border-[#192230]/15 text-xs font-semibold hover:bg-[#F7F5EF]"
                  >
                    Edit Settings
                  </button>
                </div>
              </div>

              {/* Quick Team KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-[#192230]/10 rounded-xl p-5">
                  <div className="text-xs text-[#66717E]">Active Roster</div>
                  <div className="font-mono text-2xl font-bold text-[#192230] mt-1 tabular-nums">
                    {teamDetails.memberCount}/{teamDetails.maxCapacity}
                  </div>
                  <div className="w-full h-1.5 bg-[#F7F5EF] rounded-full overflow-hidden mt-2.5">
                    <div
                      className="h-full bg-[#192230] rounded-full"
                      style={{
                        width: `${Math.min(100, Math.round((teamDetails.memberCount / teamDetails.maxCapacity) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="bg-white border border-[#192230]/10 rounded-xl p-5">
                  <div className="text-xs text-[#66717E]">Open Seats</div>
                  <div
                    className={`font-mono text-2xl font-bold mt-1 tabular-nums ${
                      teamDetails.availableSeats > 0 ? 'text-[#1E9782]' : 'text-[#EF6853]'
                    }`}
                  >
                    {teamDetails.availableSeats}
                  </div>
                  <div className="text-xs text-[#66717E] mt-1">
                    {teamDetails.availableSeats > 0 ? 'Ready for direct join or invite' : 'Full · Waitlist active'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectTab('health')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#E6AB43] rounded-xl p-5"
                >
                  <div className="flex items-center justify-between text-xs text-[#66717E]">
                    <span>Team Health</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#E6AB43]" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-[#E6AB43] mt-1 tabular-nums">
                    {teamDetails.health?.overallScore ?? 0}/100
                  </div>
                  <div className="text-xs text-[#66717E] mt-1">{teamDetails.health?.statusLabel || 'Evaluated'}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab(pendingRequests.length > 0 ? 'invitations' : 'waitlist')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#8070C4] rounded-xl p-5"
                >
                  <div className="flex items-center justify-between text-xs text-[#66717E]">
                    <span>Requests / Waitlist</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#8070C4]" />
                  </div>
                  <div className="font-mono text-2xl font-bold text-[#8070C4] mt-1 tabular-nums">
                    {pendingRequests.length} / {teamDetails.waitlistCount}
                  </div>
                  <div className="text-xs text-[#66717E] mt-1">Pending requests · Queued waitlist</div>
                </button>
              </div>

              {/* Roster + Coverage Grid */}
              <div className="grid lg:grid-cols-12 gap-6">
                {/* Active Members List */}
                <div className="lg:col-span-7 bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-lg font-semibold">
                        Active Team Members ({teamDetails.members.length})
                      </h2>
                      <p className="text-xs text-[#66717E]">
                        Leader designations, assigned roles, and verified skills
                      </p>
                    </div>
                    <button
                      onClick={() => onSelectTab('members')}
                      className="text-xs font-semibold text-[#EF6853] hover:underline"
                    >
                      Manage Roster
                    </button>
                  </div>

                  <div className="divide-y divide-[#192230]/10 border border-[#192230]/10 rounded-xl overflow-hidden">
                    {teamDetails.members.map((m) => (
                      <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                        <div className="flex items-start gap-3 min-w-0">
                          <UserAvatar name={m.fullName} size="md" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-[#192230]">{m.fullName}</span>
                              {m.userId === teamDetails.primaryLeaderId && (
                                <span className="px-2 py-0.5 rounded bg-[#FDECE9] text-[#EF6853] text-[10px] font-semibold">
                                  Primary Leader
                                </span>
                              )}
                              {m.userId === teamDetails.secondaryLeaderId && (
                                <span className="px-2 py-0.5 rounded bg-[#E5F3ED] text-[#1E9782] text-[10px] font-semibold">
                                  Secondary Leader
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#66717E] mt-0.5">
                              {m.teamRole} · {m.experienceLevel || 'Intermediate'} · {m.institution || 'HackForge'}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {m.skills.length > 0 ? (
                                m.skills.slice(0, 6).map((sk) => (
                                  <span
                                    key={sk}
                                    className="px-2 py-0.5 rounded bg-[#F7F5EF] border border-[#192230]/10 text-[11px] font-medium text-[#192230]"
                                  >
                                    {sk}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-[#66717E]">No skills saved yet</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {teamDetails.members.length === 0 && (
                      <div className="p-8 text-center text-xs text-[#66717E]">No members seated yet.</div>
                    )}
                  </div>
                </div>

                {/* Role & Skill Coverage Matrix */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-lg font-semibold">Role Coverage</h2>
                      <button
                        onClick={() => onSelectTab('requirements')}
                        className="text-xs font-semibold text-[#1E9782] hover:underline"
                      >
                        Edit Roles
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(teamDetails.requirements?.requiredRoles || []).map((role) => {
                        const covered = memberRolesSet.has(role);
                        return (
                          <div
                            key={role}
                            className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between ${
                              covered
                                ? 'bg-[#E5F3ED]/60 border-[#1E9782]/25 text-[#192230]'
                                : 'bg-[#FDECE9]/60 border-[#EF6853]/25 text-[#192230]'
                            }`}
                          >
                            <span className="font-medium">{role}</span>
                            <span className={`font-semibold ${covered ? 'text-[#1E9782]' : 'text-[#EF6853]'}`}>
                              {covered ? 'Covered' : 'Missing'}
                            </span>
                          </div>
                        );
                      })}
                      {(teamDetails.requirements?.requiredRoles || []).length === 0 && (
                        <div className="text-xs text-[#66717E]">No required roles configured.</div>
                      )}
                    </div>
                    {(teamDetails.health?.missingRoles?.length ?? 0) > 0 && (
                      <button
                        onClick={() => {
                          setCandRole(teamDetails.health?.missingRoles[0] || 'ALL');
                          onSelectTab('find-members');
                        }}
                        className="w-full py-2 rounded-lg bg-[#192230] text-white text-xs font-semibold hover:bg-[#192230]/90"
                      >
                        Recruit {teamDetails.health?.missingRoles[0]} →
                      </button>
                    )}
                  </div>

                  <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-3">
                    <h2 className="font-display text-lg font-semibold">Required Skills Coverage</h2>
                    <div className="flex flex-wrap gap-1.5">
                      {(teamDetails.requirements?.requiredSkills || []).map((sk) => {
                        const covered = memberSkillsSet.has(sk.toLowerCase());
                        return (
                          <span
                            key={sk}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                              covered
                                ? 'bg-[#E5F3ED] text-[#1E9782] border-[#1E9782]/30'
                                : 'bg-[#F7F5EF] text-[#EF6853] border-[#EF6853]/30'
                            }`}
                          >
                            {covered ? '✓ ' : 'Missing: '}
                            {sk}
                          </span>
                        );
                      })}
                      {(teamDetails.requirements?.requiredSkills || []).length === 0 && (
                        <span className="text-xs text-[#66717E]">No required skills configured.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CREATE TEAM */}
          {activeTab === 'create-team' && (
            <form onSubmit={handleCreateTeam} className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-5">
              <div className="border-b border-[#192230]/10 pb-4">
                <h2 className="font-display text-xl font-bold">Create a New Team</h2>
                <p className="text-xs text-[#66717E] mt-1">
                  You will be designated Primary Leader and automatically seated as member #1.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Team Name</label>
                  <input
                    type="text"
                    required
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    placeholder="e.g., PulseGrid AI"
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Project Category</label>
                  <select
                    value={cCat}
                    onChange={(e) => setCCat(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Description</label>
                <textarea
                  rows={3}
                  required
                  value={cDesc}
                  onChange={(e) => setCDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Max Capacity</label>
                  <input
                    type="number"
                    min={2}
                    max={6}
                    value={cCap}
                    onChange={(e) => setCCap(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Min Experience</label>
                  <select
                    value={cExp}
                    onChange={(e) => setCExp(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                  >
                    {EXPERIENCE_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Collaboration</label>
                  <select
                    value={cCollab}
                    onChange={(e) => setCCollab(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                  >
                    {['Remote', 'On-site', 'Hybrid', 'Flexible'].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Visibility</label>
                  <select
                    value={cVis}
                    onChange={(e) => setCVis(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                  >
                    <option value="PUBLIC">PUBLIC</option>
                    <option value="PRIVATE">PRIVATE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2">Required Roles</label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => {
                    const active = cReqRoles.includes(r);
                    return (
                      <button
                        type="button"
                        key={r}
                        onClick={() =>
                          setCReqRoles((prev) => (active ? prev.filter((x) => x !== r) : [...prev, r]))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                          active
                            ? 'bg-[#EF6853] text-white border-[#EF6853]'
                            : 'bg-white text-[#192230] border-[#192230]/15'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2">Required Skills</label>
                <div className="flex flex-wrap gap-2">
                  {skillsCatalog.slice(0, 24).map((s) => {
                    const active = cReqSkills.includes(s.name);
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() =>
                          setCReqSkills((prev) =>
                            active ? prev.filter((x) => x !== s.name) : [...prev, s.name]
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                          active
                            ? 'bg-[#192230] text-white border-[#192230]'
                            : 'bg-white text-[#192230] border-[#192230]/15'
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-[#EF6853] text-white text-sm font-semibold hover:bg-[#EF6853]/90"
                >
                  Create Team
                </button>
              </div>
            </form>
          )}

          {/* TEAM MEMBERS */}
          {activeTab === 'members' && teamDetails && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-semibold">
                    Manage Team Members ({teamDetails.memberCount}/{teamDetails.maxCapacity})
                  </h2>
                  <p className="text-xs text-[#66717E]">
                    Removing a member frees a seat atomically and triggers Smart Waitlist promotion.
                  </p>
                </div>
                <button
                  onClick={() => onSelectTab('find-members')}
                  className="px-3.5 py-2 rounded-lg bg-[#EF6853] text-white text-xs font-semibold"
                >
                  Invite Members
                </button>
              </div>

              <div className="divide-y divide-[#192230]/10 border border-[#192230]/10 rounded-xl">
                {teamDetails.members.map((m) => (
                  <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar name={m.fullName} size="md" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#192230]">
                          {m.fullName}
                          {m.userId === teamDetails.primaryLeaderId && (
                            <span className="ml-2 text-xs font-mono text-[#EF6853]">· Primary Leader</span>
                          )}
                          {m.userId === teamDetails.secondaryLeaderId && (
                            <span className="ml-2 text-xs font-mono text-[#1E9782]">· Secondary Leader</span>
                          )}
                        </div>
                        <div className="text-xs text-[#66717E] truncate">
                          {m.email} · {m.teamRole} · {m.experienceLevel || 'Intermediate'}
                        </div>
                      </div>
                    </div>

                    {m.userId !== user?.id && (
                      <div className="flex items-center gap-2 shrink-0">
                        {confirmRemoveId === m.userId ? (
                          <>
                            <button
                              onClick={() => handleRemoveMember(m.userId)}
                              className="px-3 py-1.5 rounded-lg bg-[#EF6853] text-white text-xs font-semibold"
                            >
                              Confirm Remove
                            </button>
                            <button
                              onClick={() => setConfirmRemoveId(null)}
                              className="px-2.5 py-1.5 rounded-lg border border-[#192230]/15 text-xs font-semibold"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmRemoveId(m.userId)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#EF6853]/35 text-[#EF6853] text-xs font-semibold hover:bg-[#EF6853]/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TEAM REQUIREMENTS */}
          {activeTab === 'requirements' && teamDetails && (
            <form onSubmit={handleUpdateRequirements} className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-5">
              <div className="border-b border-[#192230]/10 pb-4">
                <h2 className="font-display text-lg font-semibold">Team Skill & Role Requirements</h2>
                <p className="text-xs text-[#66717E] mt-1">
                  Updating requirements immediately recalculates Team Health and candidate Compatibility rankings.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Minimum Experience</label>
                <select
                  value={minExpEdit}
                  onChange={(e) => setMinExpEdit(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                >
                  {EXPERIENCE_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2">
                  Required Roles ({reqRolesEdit.length} selected)
                </label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => {
                    const active = reqRolesEdit.includes(r);
                    return (
                      <button
                        type="button"
                        key={r}
                        onClick={() =>
                          setReqRolesEdit((prev) => (active ? prev.filter((x) => x !== r) : [...prev, r]))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                          active
                            ? 'bg-[#EF6853] text-white border-[#EF6853]'
                            : 'bg-white text-[#192230] border-[#192230]/15'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-semibold">
                    Required Technical Skills ({reqSkillsEdit.length} selected)
                  </label>
                  <input
                    type="text"
                    value={reqSkillFilter}
                    onChange={(e) => setReqSkillFilter(e.target.value)}
                    placeholder="Filter skills..."
                    className="px-3 py-1.5 rounded-lg border border-[#192230]/15 text-xs"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {skillsCatalog
                    .filter(
                      (s) =>
                        !reqSkillFilter.trim() ||
                        s.name.toLowerCase().includes(reqSkillFilter.toLowerCase()) ||
                        s.category.toLowerCase().includes(reqSkillFilter.toLowerCase())
                    )
                    .map((s) => {
                      const active = reqSkillsEdit.includes(s.name);
                      return (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() =>
                            setReqSkillsEdit((prev) =>
                              active ? prev.filter((x) => x !== s.name) : [...prev, s.name]
                            )
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                            active
                              ? 'bg-[#192230] text-white border-[#192230]'
                              : 'bg-white text-[#192230] border-[#192230]/15'
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-[#192230]/10">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-[#192230] text-white text-sm font-semibold"
                >
                  Save Requirements & Recalculate
                </button>
              </div>
            </form>
          )}

          {/* TEAM HEALTH ENGINE */}
          {activeTab === 'health' && teamDetails && teamDetails.health && (
            <div className="space-y-6">
              <div className="bg-white border border-[#192230]/10 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-[#E6AB43]">Team Health Engine (35 / 30 / 15 / 10 / 10)</div>
                  <h2 className="font-display text-2xl font-bold mt-1">
                    {teamDetails.name} — {teamDetails.health.statusLabel}
                  </h2>
                  <p className="text-xs text-[#66717E] mt-1">
                    Evaluated live from PostgreSQL roster, skill mappings, leadership readiness, and team requirements.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-mono text-4xl font-bold text-[#EF6853] tabular-nums">
                      {teamDetails.health.overallScore}/100
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await apiFetch(`/api/teams/${teamDetails.id}/health/recalculate`, { method: 'POST' });
                      pushToast('success', 'Team Health recalculated from database.');
                      await loadSelectedTeamDetails(teamDetails.id);
                    }}
                    className="p-2.5 rounded-lg border border-[#192230]/15 hover:bg-[#F7F5EF]"
                    title="Recalculate Health"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid lg:grid-cols-12 gap-6">
                <div className="lg:col-span-6 bg-white border border-[#192230]/10 rounded-xl p-6">
                  <h3 className="font-display text-base font-semibold mb-4">Component Coverage Breakdown</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { metric: 'Skill (35%)', score: teamDetails.health.skillCoverageScore },
                          { metric: 'Role (30%)', score: teamDetails.health.roleCoverageScore },
                          { metric: 'Exp (15%)', score: teamDetails.health.experienceBalanceScore },
                          { metric: 'Lead (10%)', score: teamDetails.health.leadershipReadinessScore },
                          { metric: 'Reqs (10%)', score: teamDetails.health.requirementFulfillmentScore },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="score" name="Coverage Score" fill="#EF6853" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-6 bg-white border border-[#192230]/10 rounded-xl p-6">
                  <h3 className="font-display text-base font-semibold mb-4">Balance Radar</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart
                        data={[
                          { dim: 'Skills', val: teamDetails.health.skillCoverageScore },
                          { dim: 'Roles', val: teamDetails.health.roleCoverageScore },
                          { dim: 'Experience', val: teamDetails.health.experienceBalanceScore },
                          { dim: 'Leadership', val: teamDetails.health.leadershipReadinessScore },
                          { dim: 'Requirements', val: teamDetails.health.requirementFulfillmentScore },
                        ]}
                      >
                        <PolarGrid />
                        <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Radar name="Balance" dataKey="val" stroke="#E6AB43" fill="#E6AB43" fillOpacity={0.35} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-white border border-[#192230]/10 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-[#192230]">Missing Roles</h3>
                  <ul className="mt-3 space-y-1.5 text-xs text-[#EF6853] font-medium">
                    {teamDetails.health.missingRoles.length === 0 ? (
                      <li className="text-[#1E9782]">All required roles covered</li>
                    ) : (
                      teamDetails.health.missingRoles.map((r) => <li key={r}>Missing {r}</li>)
                    )}
                  </ul>
                </div>
                <div className="bg-white border border-[#192230]/10 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-[#192230]">Missing Skills</h3>
                  <ul className="mt-3 space-y-1.5 text-xs text-[#66717E]">
                    {teamDetails.health.missingSkills.length === 0 ? (
                      <li className="text-[#1E9782]">All required skills covered</li>
                    ) : (
                      teamDetails.health.missingSkills.map((s) => <li key={s}>{s}</li>)
                    )}
                  </ul>
                </div>
                <div className="bg-white border border-[#192230]/10 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-[#192230]">Recommendations</h3>
                  <ul className="mt-3 space-y-1.5 text-xs text-[#192230]">
                    {teamDetails.health.recommendations.map((rec, i) => (
                      <li key={i}>
                        {i + 1}. {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* FIND MEMBERS */}
          {activeTab === 'find-members' && teamDetails && (
            <div className="space-y-4">
              <div className="bg-white border border-[#192230]/10 rounded-xl p-5 space-y-4">
                <div>
                  <h2 className="font-display text-lg font-semibold">
                    Candidate Compatibility Ranking for {teamDetails.name}
                  </h2>
                  <p className="text-xs text-[#66717E]">
                    Sorted by weighted compatibility score (35% Skill · 25% Role · 15% Exp · 15% Interest · 10% Collab).
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="relative lg:col-span-2">
                    <Search className="w-4 h-4 text-[#66717E] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={candSearch}
                      onChange={(e) => setCandSearch(e.target.value)}
                      placeholder="Filter by name, skill, or institution..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                    />
                  </div>
                  <select
                    value={candRole}
                    onChange={(e) => setCandRole(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                  >
                    <option value="ALL">All Roles</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <select
                    value={candExp}
                    onChange={(e) => setCandExp(e.target.value)}
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
                    onClick={() => setCandUnassignedOnly((v) => !v)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                      candUnassignedOnly
                        ? 'bg-[#192230] text-white border-[#192230]'
                        : 'bg-white text-[#192230] border-[#192230]/15'
                    }`}
                  >
                    {candUnassignedOnly ? 'Available Only' : 'All Builders'}
                  </button>
                </div>
              </div>

              {filteredCandidates.map((c) => (
                <div key={c.userId} className="bg-white border border-[#192230]/10 rounded-xl p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <UserAvatar name={c.fullName} size="md" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-display text-lg font-bold text-[#192230]">{c.fullName}</span>
                          <span className="font-mono text-sm font-bold text-[#8070C4] tabular-nums">
                            {c.overallScore}% Match
                          </span>
                        </div>
                        <div className="text-xs text-[#66717E] mt-0.5">
                          {c.preferredRole} · {c.experienceLevel} · {c.institution || 'HackForge Builder'}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(c.skills || []).slice(0, 6).map((sk: string) => (
                            <span
                              key={sk}
                              className="px-2 py-0.5 rounded bg-[#F7F5EF] border border-[#192230]/10 text-[11px] font-medium"
                            >
                              {sk}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-[#192230] mt-2">
                          {c.suggestedContribution || c.explanation}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={inviteRoleMap[c.userId] || c.preferredRole}
                        onChange={(e) =>
                          setInviteRoleMap((prev) => ({ ...prev, [c.userId]: e.target.value }))
                        }
                        className="px-2.5 py-2 rounded-lg border border-[#192230]/15 text-xs bg-white"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleInviteCandidate(c.userId, c.preferredRole)}
                        className="px-4 py-2 rounded-lg bg-[#EF6853] text-white text-xs font-semibold hover:bg-[#EF6853]/90 whitespace-nowrap"
                      >
                        Invite to Team
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-[#192230]/10 text-xs">
                    {[
                      { label: 'Skill (35%)', val: c.skillScore },
                      { label: 'Role (25%)', val: c.roleScore },
                      { label: 'Exp (15%)', val: c.experienceScore },
                      { label: 'Interest (15%)', val: c.interestScore },
                      { label: 'Collab (10%)', val: c.collaborationScore },
                    ].map((f) => (
                      <div key={f.label}>
                        <div className="flex justify-between text-[#66717E]">
                          <span>{f.label}</span>
                          <span className="font-mono font-semibold text-[#192230] tabular-nums">{f.val}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-[#F7F5EF] rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-[#8070C4] rounded-full" style={{ width: `${f.val}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {filteredCandidates.length === 0 && (
                <div className="bg-white border border-[#192230]/10 rounded-xl p-10 text-center text-sm text-[#66717E]">
                  No candidates match your current filters.
                </div>
              )}
            </div>
          )}

          {/* INVITATIONS */}
          {activeTab === 'invitations' && teamDetails && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">
                    Membership Requests & Outgoing Invitations
                  </h2>
                  <p className="text-xs text-[#66717E]">
                    Approving a join request runs a PostgreSQL transaction with row-level locking.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 bg-[#F7F5EF] p-1 rounded-lg border border-[#192230]/10">
                  {(['ALL', 'PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setInvStatusTab(st)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                        invStatusTab === st ? 'bg-[#192230] text-white' : 'text-[#66717E] hover:text-[#192230]'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-[#192230]/10">
                {filteredTeamInvitations.map((inv) => (
                  <div key={inv.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={inv.candidateName} size="sm" />
                      <div>
                        <div className="text-xs text-[#66717E]">
                          {inv.type} · Role: {inv.proposedRole} ·{' '}
                          <span className="font-semibold text-[#192230]">{inv.status}</span>
                        </div>
                        <div className="text-sm font-semibold mt-0.5">
                          {inv.candidateName} ({inv.candidateEmail})
                        </div>
                        {inv.message && <p className="text-xs text-[#66717E] mt-1">{inv.message}</p>}
                      </div>
                    </div>
                    {inv.status === 'PENDING' && inv.type === 'REQUEST' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={async () => {
                            try {
                              await apiFetch(`/api/invitations/${inv.id}/accept`, { method: 'POST' });
                              pushToast('success', 'Join request approved atomically.');
                              await loadTeamsAndData(teamDetails.id);
                            } catch (err: any) {
                              pushToast('error', err.message);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1E9782] text-white text-xs font-semibold"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/invitations/${inv.id}/decline`, { method: 'POST' });
                            pushToast('info', 'Request declined.');
                            await loadTeamsAndData(teamDetails.id);
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
                {filteredTeamInvitations.length === 0 && (
                  <div className="py-10 text-center text-xs text-[#66717E]">
                    No invitations or requests match this filter.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SMART WAITLIST */}
          {activeTab === 'waitlist' && teamDetails && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
              <h2 className="font-display text-lg font-semibold mb-1">
                Smart Waitlist Queue for {teamDetails.name}
              </h2>
              <p className="text-xs text-[#66717E] mb-4">
                When a team member leaves, the next eligible WAITING candidate is promoted automatically in strict FIFO order.
              </p>
              <div className="divide-y divide-[#192230]/10">
                {waitlist.map((w) => (
                  <div key={w.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-[#192230] w-7">#{w.queuePosition}</span>
                      <UserAvatar name={w.fullName || 'Builder'} size="sm" />
                      <div>
                        <div className="font-semibold text-sm text-[#192230]">{w.fullName}</div>
                        <div className="text-[#66717E]">
                          {w.preferredRole} · {w.experienceLevel}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-mono text-[#8070C4] font-semibold tabular-nums">
                        {w.compatibilityScore}% Match
                      </span>
                      <span className="font-semibold text-[#192230]">{w.status}</span>
                    </div>
                  </div>
                ))}
                {waitlist.length === 0 && (
                  <div className="py-10 text-center text-xs text-[#66717E]">Waitlist queue is empty.</div>
                )}
              </div>
            </div>
          )}

          {/* LEADERSHIP SUCCESSION */}
          {activeTab === 'leadership' && teamDetails && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
                  <h3 className="font-display text-lg font-semibold">Assign Secondary Leader</h3>
                  <p className="text-xs text-[#66717E]">
                    Prevents leadership dependency. If the Primary Leader leaves, the Secondary Leader automatically succeeds.
                  </p>
                  <select
                    value={secondaryTarget}
                    onChange={(e) => setSecondaryTarget(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                  >
                    <option value="">Select a team member...</option>
                    {nonPrimaryMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.fullName} ({m.teamRole})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssignSecondary}
                    disabled={!secondaryTarget}
                    className="px-4 py-2 rounded-lg bg-[#1E9782] text-white text-xs font-semibold disabled:opacity-40"
                  >
                    Assign Secondary Leader
                  </button>
                </div>

                <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
                  <h3 className="font-display text-lg font-semibold">Transfer Primary Leadership</h3>
                  <p className="text-xs text-[#66717E]">
                    Transactional authority transfer with PostgreSQL row-level locking ensuring exactly one primary leader.
                  </p>
                  <select
                    value={transferTarget}
                    onChange={(e) => setTransferTarget(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                  >
                    <option value="">Select successor...</option>
                    {nonPrimaryMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.fullName} ({m.teamRole})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="Reason for leadership transfer"
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                  />
                  <button
                    onClick={handleTransferLeadership}
                    disabled={!transferTarget}
                    className="px-4 py-2 rounded-lg bg-[#EF6853] text-white text-xs font-semibold disabled:opacity-40"
                  >
                    Transfer Primary Leadership
                  </button>
                </div>
              </div>

              <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
                <h3 className="font-display text-lg font-semibold mb-4">Leadership Succession History</h3>
                <div className="divide-y divide-[#192230]/10">
                  {leadershipHistory.map((h) => (
                    <div key={h.id} className="py-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-[#192230]">{h.action}</span>
                        <span className="text-[#66717E] ml-2">
                          {h.previousLeaderName
                            ? `${h.previousLeaderName} → ${h.newLeaderName}`
                            : `Assigned: ${h.newLeaderName}`}
                        </span>
                        <div className="text-[#66717E] mt-0.5">{h.reason}</div>
                      </div>
                      <span className="font-mono text-[#66717E] shrink-0">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {leadershipHistory.length === 0 && (
                    <div className="py-6 text-center text-xs text-[#66717E]">No leadership transitions recorded yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ACTIVITY HISTORY */}
          {activeTab === 'history' && teamDetails && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
              <h2 className="font-display text-lg font-semibold mb-4">Team Leadership & Activity Timeline</h2>
              <div className="divide-y divide-[#192230]/10">
                {leadershipHistory.map((h) => (
                  <div key={h.id} className="py-3 text-xs">
                    <div className="font-semibold text-[#192230]">
                      {h.action} · {h.newLeaderName}
                    </div>
                    <div className="text-[#66717E] mt-0.5">
                      {h.reason} · {new Date(h.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
                {leadershipHistory.length === 0 && (
                  <div className="py-8 text-center text-xs text-[#66717E]">No team activity logs yet.</div>
                )}
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {activeTab === 'settings' && teamDetails && (
            <form onSubmit={handleUpdateTeamSettings} className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold">Team Settings</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Team Name</label>
                  <input
                    type="text"
                    required
                    value={editTeamName}
                    onChange={(e) => setEditTeamName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Max Capacity</label>
                  <input
                    type="number"
                    min={teamDetails.memberCount}
                    max={8}
                    value={editTeamCap}
                    onChange={(e) => setEditTeamCap(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editTeamDesc}
                  onChange={(e) => setEditTeamDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Collaboration Mode</label>
                  <select
                    value={editTeamCollab}
                    onChange={(e) => setEditTeamCollab(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                  >
                    {['Remote', 'On-site', 'Hybrid', 'Flexible'].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Visibility</label>
                  <select
                    value={editTeamVis}
                    onChange={(e) => setEditTeamVis(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm bg-white"
                  >
                    <option value="PUBLIC">PUBLIC</option>
                    <option value="PRIVATE">PRIVATE</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-[#192230] text-white text-sm font-semibold"
                >
                  Save Team Settings
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </PortalShell>
  );
};
