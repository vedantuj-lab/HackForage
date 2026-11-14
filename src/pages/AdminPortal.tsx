import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Shield,
  Sparkles,
  Activity,
  Scale,
  Clock,
  FlaskConical,
  FileText,
  Sliders,
  Server,
  Play,
  Search,
  X,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { PortalShell, NavItem } from '../components/PortalShell.tsx';
import { UserAvatar } from '../components/UserAvatar.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../services/api.ts';
import { ConcurrencyReport, TeamDetails } from '../types/hackforge.ts';

const CHART_COLORS = ['#1E9782', '#EF6853', '#E6AB43', '#8070C4', '#192230'];

interface AdminPortalProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onGoHome: () => void;
  onSwitchPortal: (target: 'PARTICIPANT' | 'TEAM_LEADER' | 'ADMIN') => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  activeTab,
  onSelectTab,
  onGoHome,
  onSwitchPortal,
}) => {
  const { pushToast } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<any>(null);
  const [fairness, setFairness] = useState<any>(null);
  const [teamsAnalytics, setTeamsAnalytics] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [adminTeams, setAdminTeams] = useState<any[]>([]);
  const [waitlists, setWaitlists] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  // Drawers
  const [selectedParticipant, setSelectedParticipant] = useState<any | null>(null);
  const [selectedTeamDetail, setSelectedTeamDetail] = useState<TeamDetails | null>(null);
  const [loadingTeamDrawer, setLoadingTeamDrawer] = useState(false);

  // Concurrency Lab state
  const [labState, setLabState] = useState<{
    teamId: string;
    teamName: string;
    maxCapacity: number;
    currentMembers: number;
    availableSeats: number;
    simulatedContenders: number;
  } | null>(null);
  const [runningBlast, setRunningBlast] = useState(false);
  const [concurrencyReport, setConcurrencyReport] = useState<ConcurrencyReport | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'ACCEPTED' | 'REJECTED'>('ALL');

  // Filters
  const [pSearch, setPSearch] = useState('');
  const [pRoleFilter, setPRoleFilter] = useState('ALL');
  const [pStatusFilter, setPStatusFilter] = useState('ALL');
  const [tSearch, setTSearch] = useState('');
  const [tCatFilter, setTCatFilter] = useState('ALL');
  const [wlStatusFilter, setWlStatusFilter] = useState('ALL');
  const [logSearch, setLogSearch] = useState('');

  // Settings form
  const [sEventName, setSEventName] = useState('');
  const [sMaxCap, setSMaxCap] = useState(5);
  const [sExpiry, setSExpiry] = useState(60);
  const [sAllowCreate, setSAllowCreate] = useState(true);
  const [sAutoWaitlist, setSAutoWaitlist] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [dashRes, fairRes, anaRes, partRes, teamRes, wlRes, logRes, setRes, labRes] =
        await Promise.allSettled([
          apiFetch<{ metrics: any }>('/api/admin/dashboard'),
          apiFetch<{ fairness: any }>('/api/admin/fairness'),
          apiFetch<{ teamsAnalytics: any[] }>('/api/admin/analytics'),
          apiFetch<{ participants: any[] }>('/api/admin/participants'),
          apiFetch<{ teams: any[] }>('/api/admin/teams'),
          apiFetch<{ waitlists: any[] }>('/api/admin/waitlists'),
          apiFetch<{ logs: any[] }>('/api/admin/audit-logs'),
          apiFetch<{ settings: any }>('/api/admin/settings'),
          apiFetch<any>('/api/admin/concurrency-test/state'),
        ]);

      if (dashRes.status === 'fulfilled') setMetrics(dashRes.value.metrics);
      else setLoadError('Unable to load admin operations dashboard.');

      if (fairRes.status === 'fulfilled') setFairness(fairRes.value.fairness);
      if (anaRes.status === 'fulfilled') setTeamsAnalytics(anaRes.value.teamsAnalytics);
      if (partRes.status === 'fulfilled') setParticipants(partRes.value.participants);
      if (teamRes.status === 'fulfilled') setAdminTeams(teamRes.value.teams);
      if (wlRes.status === 'fulfilled') setWaitlists(wlRes.value.waitlists);
      if (logRes.status === 'fulfilled') setAuditLogs(logRes.value.logs);
      if (labRes.status === 'fulfilled') setLabState(labRes.value);

      if (setRes.status === 'fulfilled' && setRes.value.settings) {
        const s = setRes.value.settings;
        setSettings(s);
        setSEventName(s.eventName);
        setSMaxCap(s.maxTeamCapacity);
        setSExpiry(s.waitlistExpiryMinutes);
        setSAllowCreate(s.allowTeamCreation);
        setSAutoWaitlist(s.autoWaitlistPromotion);
      }
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load admin portal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleOpenTeamDrawer = async (teamId: string) => {
    setLoadingTeamDrawer(true);
    try {
      const res = await apiFetch<{ team: TeamDetails }>(`/api/teams/${teamId}`);
      setSelectedTeamDetail(res.team);
    } catch (err: any) {
      pushToast('error', err.message || 'Could not load team details.');
    } finally {
      setLoadingTeamDrawer(false);
    }
  };

  const handleRunConcurrencyTest = async () => {
    setRunningBlast(true);
    try {
      const res = await apiFetch<{ report: ConcurrencyReport }>('/api/admin/concurrency-test', {
        method: 'POST',
      });
      setConcurrencyReport(res.report);
      setLabState((prev) =>
        prev
          ? {
              ...prev,
              currentMembers: res.report.finalMembers,
              availableSeats: Math.max(0, res.report.maxCapacity - res.report.finalMembers),
            }
          : prev
      );
      pushToast(
        res.report.overbooking === 0 && res.report.successfulJoins === 1 ? 'success' : 'error',
        `50-user test complete: ${res.report.successfulJoins} joined, ${res.report.rejectedJoins} rejected, ${res.report.overbooking} overbooked.`
      );
      const logRes = await apiFetch<{ logs: any[] }>('/api/admin/audit-logs');
      setAuditLogs(logRes.logs);
    } catch (err: any) {
      pushToast('error', err.message || 'Concurrency test failed.');
    } finally {
      setRunningBlast(false);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const next = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await apiFetch(`/api/admin/participants/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      pushToast('success', `Account status updated to ${next}.`);
      setSelectedParticipant((prev: any) => (prev && prev.id === userId ? { ...prev, status: next } : prev));
      await loadAll();
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to update status.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          eventName: sEventName,
          maxTeamCapacity: sMaxCap,
          waitlistExpiryMinutes: sExpiry,
          allowTeamCreation: sAllowCreate,
          autoWaitlistPromotion: sAutoWaitlist,
        }),
      });
      pushToast('success', 'Event settings saved and audited.');
      await loadAll();
    } catch (err: any) {
      pushToast('error', err.message || 'Failed to save event settings.');
    }
  };

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" />, section: 'Operations' },
    { id: 'participants', label: 'Participants', icon: <Users className="w-4 h-4" />, section: 'Operations' },
    { id: 'teams', label: 'Teams', icon: <Shield className="w-4 h-4" />, section: 'Operations' },
    { id: 'compat-analytics', label: 'Compatibility Analytics', icon: <Sparkles className="w-4 h-4" />, section: 'Analytics & Fairness' },
    { id: 'health-analytics', label: 'Team Health Analytics', icon: <Activity className="w-4 h-4" />, section: 'Analytics & Fairness' },
    { id: 'fairness', label: 'Fairness Dashboard', icon: <Scale className="w-4 h-4" />, section: 'Analytics & Fairness' },
    { id: 'waitlist-mgmt', label: 'Waitlist Management', icon: <Clock className="w-4 h-4" />, section: 'Concurrency & Audit' },
    { id: 'concurrency-lab', label: 'Concurrency Lab', icon: <FlaskConical className="w-4 h-4" />, section: 'Concurrency & Audit' },
    { id: 'audit-logs', label: 'Audit Logs', icon: <FileText className="w-4 h-4" />, section: 'Concurrency & Audit' },
    { id: 'event-settings', label: 'Event Settings', icon: <Sliders className="w-4 h-4" />, section: 'Configuration' },
    { id: 'system-settings', label: 'System Settings', icon: <Server className="w-4 h-4" />, section: 'Configuration' },
  ];

  const filteredParticipants = useMemo(() => {
    return participants.filter((p) => {
      if (pRoleFilter !== 'ALL' && p.role !== pRoleFilter) return false;
      if (pStatusFilter !== 'ALL' && p.status !== pStatusFilter) return false;
      if (pSearch.trim()) {
        const q = pSearch.trim().toLowerCase();
        return (
          p.fullName.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          (p.institution || '').toLowerCase().includes(q) ||
          (p.preferredRole || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [participants, pRoleFilter, pStatusFilter, pSearch]);

  const teamCategories = useMemo(
    () => Array.from(new Set(adminTeams.map((t) => t.category))).sort(),
    [adminTeams]
  );

  const filteredAdminTeams = useMemo(() => {
    return adminTeams.filter((t) => {
      if (tCatFilter !== 'ALL' && t.category !== tCatFilter) return false;
      if (tSearch.trim()) {
        const q = tSearch.trim().toLowerCase();
        return t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [adminTeams, tCatFilter, tSearch]);

  const filteredLedgerResults = useMemo(() => {
    if (!concurrencyReport) return [];
    if (ledgerFilter === 'ACCEPTED') return concurrencyReport.results.filter((r) => r.success);
    if (ledgerFilter === 'REJECTED') return concurrencyReport.results.filter((r) => !r.success);
    return concurrencyReport.results;
  }, [concurrencyReport, ledgerFilter]);

  const filteredWaitlists = useMemo(() => {
    if (wlStatusFilter === 'ALL') return waitlists;
    return waitlists.filter((w) => w.status === wlStatusFilter);
  }, [waitlists, wlStatusFilter]);

  const filteredAuditLogs = useMemo(() => {
    if (!logSearch.trim()) return auditLogs;
    const q = logSearch.trim().toLowerCase();
    return auditLogs.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        (l.actorEmail || '').toLowerCase().includes(q) ||
        (l.entityType || '').toLowerCase().includes(q)
    );
  }, [auditLogs, logSearch]);

  return (
    <PortalShell
      portalTitle="Admin Console"
      portalSubtitle="Platform Governance"
      portalRoleKey="ADMIN"
      accentColor="#E6AB43"
      sidebarDark
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
        <div className="bg-white border border-[#EF6853]/30 rounded-xl p-10 text-center">
          <AlertCircle className="w-8 h-8 text-[#EF6853] mx-auto" />
          <h2 className="font-display text-lg font-bold mt-3">Unable to load admin metrics</h2>
          <p className="text-sm text-[#66717E] mt-1">{loadError}</p>
          <button
            onClick={loadAll}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#192230] text-white text-xs font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : (
        <>
          {/* OVERVIEW */}
          {activeTab === 'overview' && metrics && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold">Platform Operations Overview</h1>
                  <p className="text-xs text-[#66717E] mt-1">
                    Live PostgreSQL aggregates · {settings?.eventName || 'HackForge Global 2026'}
                  </p>
                </div>
                <button
                  onClick={() => onSelectTab('concurrency-lab')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#192230] text-[#F7F5EF] text-xs font-semibold hover:bg-[#192230]/90 whitespace-nowrap"
                >
                  <FlaskConical className="w-4 h-4 text-[#1E9782]" />
                  <span>Open Concurrency Lab</span>
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  type="button"
                  onClick={() => onSelectTab('participants')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#192230]/35 rounded-xl p-5"
                >
                  <div className="text-xs text-[#66717E]">Registered Participants</div>
                  <div className="font-mono text-2xl font-bold mt-1 tabular-nums">
                    {metrics.totalParticipants}
                  </div>
                  <div className="text-xs text-[#66717E] mt-0.5">
                    {metrics.unassignedParticipants} unassigned
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('teams')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#192230]/35 rounded-xl p-5"
                >
                  <div className="text-xs text-[#66717E]">Active Teams</div>
                  <div className="font-mono text-2xl font-bold mt-1 tabular-nums">
                    {metrics.activeTeams}
                  </div>
                  <div className="text-xs text-[#66717E] mt-0.5">{metrics.fullTeams} at full capacity</div>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('health-analytics')}
                  className="text-left bg-white border border-[#192230]/10 hover:border-[#E6AB43] rounded-xl p-5"
                >
                  <div className="text-xs text-[#66717E]">Avg Team Health</div>
                  <div className="font-mono text-2xl font-bold text-[#E6AB43] mt-1 tabular-nums">
                    {metrics.avgTeamHealth}/100
                  </div>
                  <div className="text-xs text-[#66717E] mt-0.5">Avg Match: {metrics.avgCompatibility}%</div>
                </button>
                <div className="bg-white border border-[#192230]/10 rounded-xl p-5">
                  <div className="text-xs text-[#66717E]">Seat Utilization</div>
                  <div className="font-mono text-2xl font-bold text-[#1E9782] mt-1 tabular-nums">
                    {metrics.capacityUtilization}%
                  </div>
                  <div className="text-xs text-[#66717E] mt-0.5">
                    {metrics.totalSeatsOccupied}/{metrics.totalSeatsAvailable} seats filled
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
                <h2 className="font-display text-lg font-semibold mb-4">Team Health & Seat Fill Across Teams</h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={teamsAnalytics.map((t) => ({
                        name: t.name,
                        health: t.health?.overallScore ?? 0,
                        fillPct: Math.round((t.memberCount / t.maxCapacity) * 100),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="health" name="Health Score" fill="#E6AB43" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="fillPct" name="Seat Fill %" fill="#1E9782" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* CONCURRENCY LAB */}
          {activeTab === 'concurrency-lab' && (
            <div className="space-y-6">
              <div className="bg-[#192230] text-[#F7F5EF] rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <div className="text-xs font-medium text-[#1E9782]">
                    PostgreSQL Row-Level Locking Verification
                  </div>
                  <h1 className="font-display text-2xl font-bold mt-1">
                    Concurrency Lab — Race-Proof Team Formation
                  </h1>
                  <p className="text-sm text-[#F7F5EF]/75 mt-1.5 max-w-2xl">
                    Executes 50 simultaneous HTTP POST /join requests against a controlled PostgreSQL team (Max Capacity = 5, 4 Existing Members, 1 Open Seat) protected by SELECT ... FOR UPDATE transactions.
                  </p>
                </div>
                <button
                  onClick={handleRunConcurrencyTest}
                  disabled={runningBlast}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#EF6853] text-white text-sm font-semibold hover:bg-[#EF6853]/90 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Play className="w-4 h-4" />
                  <span>{runningBlast ? 'Executing 50 Concurrent Requests...' : 'RUN 50-USER TEST'}</span>
                </button>
              </div>

              {labState && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <div className="bg-white border border-[#192230]/10 rounded-xl p-4">
                    <div className="text-xs text-[#66717E]">Controlled Team</div>
                    <div className="font-display text-sm font-bold mt-1">{labState.teamName}</div>
                  </div>
                  <div className="bg-white border border-[#192230]/10 rounded-xl p-4">
                    <div className="text-xs text-[#66717E]">Max Capacity</div>
                    <div className="font-mono text-2xl font-bold mt-1 tabular-nums">{labState.maxCapacity}</div>
                  </div>
                  <div className="bg-white border border-[#192230]/10 rounded-xl p-4">
                    <div className="text-xs text-[#66717E]">Current Members</div>
                    <div className="font-mono text-2xl font-bold mt-1 tabular-nums">{labState.currentMembers}</div>
                  </div>
                  <div className="bg-white border border-[#192230]/10 rounded-xl p-4">
                    <div className="text-xs text-[#66717E]">Available Seats</div>
                    <div className="font-mono text-2xl font-bold text-[#1E9782] mt-1 tabular-nums">
                      {labState.availableSeats}
                    </div>
                  </div>
                  <div className="bg-white border border-[#192230]/10 rounded-xl p-4">
                    <div className="text-xs text-[#66717E]">Simulated Contenders</div>
                    <div className="font-mono text-2xl font-bold text-[#EF6853] mt-1 tabular-nums">
                      {labState.simulatedContenders}
                    </div>
                  </div>
                </div>
              )}

              {concurrencyReport && (
                <div className="space-y-6">
                  <div className="bg-[#E5F3ED] border border-[#1E9782]/35 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#1E9782] shrink-0" />
                      <div className="text-xs text-[#192230]">
                        <strong>Invariant Verified:</strong> Exactly{' '}
                        <span className="font-mono font-bold">{concurrencyReport.successfulJoins}</span> winner (
                        <span className="font-mono">{concurrencyReport.winningParticipant}</span>) claimed seat #5;{' '}
                        <span className="font-mono font-bold">{concurrencyReport.rejectedJoins}</span> contenders were
                        rejected cleanly with zero overbooking.
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <div className="bg-white border border-[#1E9782]/40 rounded-xl p-4">
                      <div className="text-xs text-[#66717E]">Successful Joins</div>
                      <div className="font-mono text-3xl font-bold text-[#1E9782] mt-1 tabular-nums">
                        {concurrencyReport.successfulJoins}
                      </div>
                    </div>
                    <div className="bg-white border border-[#192230]/10 rounded-xl p-4">
                      <div className="text-xs text-[#66717E]">Rejected Requests</div>
                      <div className="font-mono text-3xl font-bold text-[#EF6853] mt-1 tabular-nums">
                        {concurrencyReport.rejectedJoins}
                      </div>
                    </div>
                    <div className="bg-white border border-[#192230]/10 rounded-xl p-4">
                      <div className="text-xs text-[#66717E]">Final Member Count</div>
                      <div className="font-mono text-3xl font-bold text-[#192230] mt-1 tabular-nums">
                        {concurrencyReport.finalMembers}/{concurrencyReport.maxCapacity}
                      </div>
                    </div>
                    <div className="bg-white border border-[#192230]/10 rounded-xl p-4">
                      <div className="text-xs text-[#66717E]">Overbooking</div>
                      <div className="font-mono text-3xl font-bold text-[#1E9782] mt-1 tabular-nums">
                        {concurrencyReport.overbooking}
                      </div>
                    </div>
                    <div className="bg-white border border-[#192230]/10 rounded-xl p-4">
                      <div className="text-xs text-[#66717E]">Total Blast Time</div>
                      <div className="font-mono text-3xl font-bold text-[#192230] mt-1 tabular-nums">
                        {concurrencyReport.durationMs}ms
                      </div>
                    </div>
                  </div>

                  {/* Request Latency Timeline Chart */}
                  <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
                    <h2 className="font-display text-base font-semibold mb-3">
                      Concurrent Request Latency Timeline (ms)
                    </h2>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={concurrencyReport.results.map((r) => ({
                            req: `#${r.requestIndex}`,
                            latencyMs: r.latencyMs,
                            outcome: r.success ? 'Accepted' : 'Rejected',
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="req" tick={{ fontSize: 10 }} interval={4} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="latencyMs" name="Latency (ms)" fill="#8070C4" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <h2 className="font-display text-lg font-semibold">
                        Live Transaction Ledger (50 Concurrent HTTP Requests)
                      </h2>
                      <div className="flex items-center gap-1 bg-[#F7F5EF] p-1 rounded-lg border border-[#192230]/10 self-start">
                        {(['ALL', 'ACCEPTED', 'REJECTED'] as const).map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setLedgerFilter(f)}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                              ledgerFilter === f ? 'bg-[#192230] text-white' : 'text-[#66717E]'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto border border-[#192230]/10 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F7F5EF] border-b border-[#192230]/10 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-semibold">#</th>
                            <th className="px-3 py-2 font-semibold">Contender</th>
                            <th className="px-3 py-2 font-semibold">HTTP</th>
                            <th className="px-3 py-2 font-semibold">Outcome</th>
                            <th className="px-3 py-2 font-semibold text-right">Latency</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#192230]/10">
                          {filteredLedgerResults.map((r) => (
                            <tr key={r.requestIndex} className={r.success ? 'bg-[#1E9782]/10' : ''}>
                              <td className="px-3 py-2 font-mono tabular-nums">{r.requestIndex}</td>
                              <td className="px-3 py-2 font-mono">{r.email}</td>
                              <td className="px-3 py-2 font-mono tabular-nums">{r.status}</td>
                              <td className="px-3 py-2">
                                <span className={r.success ? 'font-semibold text-[#1E9782]' : 'text-[#66717E]'}>
                                  {r.code} — {r.message}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-right tabular-nums">{r.latencyMs}ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FAIRNESS DASHBOARD */}
          {activeTab === 'fairness' && fairness && (
            <div className="space-y-6">
              <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
                <h1 className="font-display text-xl font-bold">Fairness & Allocation Transparency Dashboard</h1>
                <p className="text-xs text-[#66717E] mt-1">
                  Compatibility scores support human review and do not establish fairness alone. Inspect waitlist queues, invitation acceptance rates, skill distributions, unassigned roles, and repeated rejections across the platform.
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-[#192230]/10 rounded-xl p-5">
                  <div className="text-xs text-[#66717E]">Invitation Acceptance Rate</div>
                  <div className="font-mono text-2xl font-bold text-[#1E9782] mt-1 tabular-nums">
                    {fairness.invitationStats.acceptanceRate}%
                  </div>
                </div>
                <div className="bg-white border border-[#192230]/10 rounded-xl p-5">
                  <div className="text-xs text-[#66717E]">Pending Invitations</div>
                  <div className="font-mono text-2xl font-bold text-[#E6AB43] mt-1 tabular-nums">
                    {fairness.invitationStats.pending}
                  </div>
                </div>
                <div className="bg-white border border-[#192230]/10 rounded-xl p-5">
                  <div className="text-xs text-[#66717E]">Declined Invitations</div>
                  <div className="font-mono text-2xl font-bold text-[#EF6853] mt-1 tabular-nums">
                    {fairness.invitationStats.declined}
                  </div>
                </div>
                <div className="bg-white border border-[#192230]/10 rounded-xl p-5">
                  <div className="text-xs text-[#66717E]">Repeated Rejections (2+)</div>
                  <div className="font-mono text-2xl font-bold text-[#192230] mt-1 tabular-nums">
                    {fairness.repeatedRejectionsCount}
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
                  <h2 className="font-display text-base font-semibold mb-4">Skill Category Distribution</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={fairness.skillDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" name="Participants" fill="#8070C4" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
                  <h2 className="font-display text-base font-semibold mb-4">Waitlist Status Breakdown</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={fairness.waitlistDistribution}
                          dataKey="count"
                          nameKey="status"
                          outerRadius={80}
                          label
                        >
                          {fairness.waitlistDistribution.map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
                  <h2 className="font-display text-base font-semibold mb-3">
                    Unassigned Participants by Preferred Role
                  </h2>
                  <div className="divide-y divide-[#192230]/10 text-xs">
                    {(fairness.unassignedByRole || []).map((row: any) => (
                      <div key={row.role} className="py-2.5 flex items-center justify-between">
                        <span className="font-medium text-[#192230]">{row.role}</span>
                        <span className="font-mono font-semibold text-[#192230] tabular-nums">{row.count}</span>
                      </div>
                    ))}
                    {(fairness.unassignedByRole || []).length === 0 && (
                      <div className="py-6 text-center text-[#66717E]">All participants assigned.</div>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
                  <h2 className="font-display text-base font-semibold mb-3">Recent Membership Allocations</h2>
                  <div className="divide-y divide-[#192230]/10 text-xs">
                    {fairness.recentAllocations.map((a: any) => (
                      <div key={a.id} className="py-2.5 flex items-center justify-between gap-4">
                        <span>
                          <strong className="text-[#192230]">{a.action}</strong> · Entity {a.entityId.slice(0, 8)}
                        </span>
                        <span className="font-mono text-[#66717E]">{new Date(a.createdAt).toLocaleString()}</span>
                      </div>
                    ))}
                    {fairness.recentAllocations.length === 0 && (
                      <div className="py-6 text-center text-[#66717E]">No recent allocation records.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PARTICIPANTS MANAGEMENT (WITH DETAIL DRAWER) */}
          {activeTab === 'participants' && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">
                    Participant Management ({filteredParticipants.length} of {participants.length})
                  </h2>
                  <p className="text-xs text-[#66717E]">
                    Click any row to inspect verified skills, completion checklist score, and team assignment.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#66717E] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={pSearch}
                      onChange={(e) => setPSearch(e.target.value)}
                      placeholder="Search name, email, role..."
                      className="pl-9 pr-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                    />
                  </div>
                  <select
                    value={pRoleFilter}
                    onChange={(e) => setPRoleFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[#192230]/15 text-xs bg-white"
                  >
                    <option value="ALL">All Account Roles</option>
                    <option value="PARTICIPANT">PARTICIPANT</option>
                    <option value="TEAM_LEADER">TEAM_LEADER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                  <select
                    value={pStatusFilter}
                    onChange={(e) => setPStatusFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[#192230]/15 text-xs bg-white"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F7F5EF] border-b border-[#192230]/10">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Participant</th>
                      <th className="px-3 py-2.5 font-semibold">Role</th>
                      <th className="px-3 py-2.5 font-semibold">Track / Exp</th>
                      <th className="px-3 py-2.5 font-semibold">Team</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#192230]/10">
                    {filteredParticipants.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedParticipant(p)}
                        className="hover:bg-[#F7F5EF]/60 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar name={p.fullName} size="sm" />
                            <div>
                              <div className="font-semibold text-[#192230]">{p.fullName}</div>
                              <div className="text-[#66717E]">{p.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono">{p.role}</td>
                        <td className="px-3 py-2.5">
                          {p.preferredRole || 'Unset'} · {p.experienceLevel || 'Intermediate'}
                        </td>
                        <td className="px-3 py-2.5">
                          {p.currentTeam ? (
                            <span className="font-medium text-[#1E9782]">{p.currentTeam.teamName}</span>
                          ) : (
                            <span className="text-[#66717E]">Unassigned</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-semibold">{p.status}</td>
                        <td className="px-3 py-2.5 text-right">
                          {p.role !== 'ADMIN' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleUserStatus(p.id, p.status);
                              }}
                              className={`px-3 py-1 rounded border text-xs font-semibold ${
                                p.status === 'ACTIVE'
                                  ? 'border-[#EF6853]/40 text-[#EF6853] hover:bg-[#EF6853]/10'
                                  : 'border-[#1E9782]/40 text-[#1E9782] hover:bg-[#1E9782]/10'
                              }`}
                            >
                              {p.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TEAMS MANAGEMENT (WITH TEAM DETAIL DRAWER) */}
          {activeTab === 'teams' && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">All Teams ({filteredAdminTeams.length})</h2>
                  <p className="text-xs text-[#66717E]">Click a team row to inspect its live roster and health gaps.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={tSearch}
                    onChange={(e) => setTSearch(e.target.value)}
                    placeholder="Search teams..."
                    className="px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                  />
                  <select
                    value={tCatFilter}
                    onChange={(e) => setTCatFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[#192230]/15 text-xs bg-white"
                  >
                    <option value="ALL">All Categories</option>
                    {teamCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F7F5EF] border-b border-[#192230]/10">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Team</th>
                      <th className="px-3 py-2.5 font-semibold">Category</th>
                      <th className="px-3 py-2.5 font-semibold">Seats</th>
                      <th className="px-3 py-2.5 font-semibold">Health</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#192230]/10">
                    {filteredAdminTeams.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => handleOpenTeamDrawer(t.id)}
                        className="hover:bg-[#F7F5EF]/60 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2.5 font-semibold text-[#192230]">{t.name}</td>
                        <td className="px-3 py-2.5">{t.category}</td>
                        <td className="px-3 py-2.5 font-mono tabular-nums">
                          {t.memberCount}/{t.maxCapacity}
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums">
                          {t.health?.overallScore ?? 0}/100 ({t.health?.statusLabel || 'N/A'})
                        </td>
                        <td className="px-3 py-2.5">{t.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* COMPATIBILITY ANALYTICS */}
          {activeTab === 'compat-analytics' && fairness && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-6">
              <div>
                <h2 className="font-display text-lg font-semibold">Compatibility Score Distribution</h2>
                <p className="text-xs text-[#66717E] mt-1">
                  Distribution of computed 5-factor compatibility scores stored in PostgreSQL.
                </p>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fairness.compatibilityDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="User-Team Pairs" fill="#8070C4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* TEAM HEALTH ANALYTICS */}
          {activeTab === 'health-analytics' && (
            <div className="space-y-6">
              <div className="bg-white border border-[#192230]/10 rounded-xl p-6">
                <h2 className="font-display text-lg font-semibold mb-4">Team Health Comparison</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={teamsAnalytics.map((t) => ({
                        name: t.name,
                        overall: t.health?.overallScore ?? 0,
                        skills: t.health?.skillCoverageScore ?? 0,
                        roles: t.health?.roleCoverageScore ?? 0,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="overall" name="Overall Health" fill="#E6AB43" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="skills" name="Skill Coverage" fill="#1E9782" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="roles" name="Role Coverage" fill="#EF6853" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-lg font-semibold">Team Health Diagnostics Across Active Teams</h2>
                <div className="divide-y divide-[#192230]/10">
                  {teamsAnalytics.map((t) => (
                    <div key={t.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {t.name} · {t.category} ({t.memberCount}/{t.maxCapacity})
                        </div>
                        <div className="text-xs text-[#66717E] mt-0.5">
                          Missing Roles: {t.health?.missingRoles?.join(', ') || 'None'}
                        </div>
                      </div>
                      <div className="font-mono text-sm font-bold text-[#E6AB43] tabular-nums shrink-0">
                        {t.health?.overallScore ?? 0}/100 · {t.health?.statusLabel}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* WAITLIST MANAGEMENT */}
          {activeTab === 'waitlist-mgmt' && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">
                  Platform Smart Waitlist Queues ({filteredWaitlists.length})
                </h2>
                <select
                  value={wlStatusFilter}
                  onChange={(e) => setWlStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-[#192230]/15 text-xs bg-white self-start"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="WAITING">WAITING</option>
                  <option value="INVITED">INVITED</option>
                  <option value="ACCEPTED">ACCEPTED</option>
                  <option value="DECLINED">DECLINED</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F7F5EF] border-b border-[#192230]/10">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Team</th>
                      <th className="px-3 py-2.5 font-semibold">Participant</th>
                      <th className="px-3 py-2.5 font-semibold">Queue #</th>
                      <th className="px-3 py-2.5 font-semibold">Match</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#192230]/10">
                    {filteredWaitlists.map((w) => (
                      <tr key={w.id}>
                        <td className="px-3 py-2.5 font-semibold">{w.teamName}</td>
                        <td className="px-3 py-2.5">
                          {w.userName} ({w.userEmail})
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums">#{w.queuePosition}</td>
                        <td className="px-3 py-2.5 font-mono tabular-nums">{w.compatibilityScore}%</td>
                        <td className="px-3 py-2.5 font-semibold">{w.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AUDIT LOGS */}
          {activeTab === 'audit-logs' && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">Immutable PostgreSQL Audit Logs</h2>
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Filter by action or actor..."
                  className="px-3 py-1.5 rounded-lg border border-[#192230]/15 text-xs"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F7F5EF] border-b border-[#192230]/10">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Timestamp</th>
                      <th className="px-3 py-2.5 font-semibold">Actor</th>
                      <th className="px-3 py-2.5 font-semibold">Action</th>
                      <th className="px-3 py-2.5 font-semibold">Entity</th>
                      <th className="px-3 py-2.5 font-semibold">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#192230]/10">
                    {filteredAuditLogs.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">
                          {new Date(l.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">{l.actorEmail}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-[#192230]">{l.action}</td>
                        <td className="px-3 py-2">
                          {l.entityType} · {l.entityId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[#66717E] max-w-xs truncate">
                          {JSON.stringify(l.metadata)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* EVENT SETTINGS */}
          {activeTab === 'event-settings' && (
            <form onSubmit={handleSaveSettings} className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold">Hackathon Event Settings</h2>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Event Name</label>
                  <input
                    type="text"
                    value={sEventName}
                    onChange={(e) => setSEventName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Max Team Capacity</label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={sMaxCap}
                    onChange={(e) => setSMaxCap(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Waitlist Expiry (Minutes)</label>
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={sExpiry}
                    onChange={(e) => setSExpiry(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-[#192230]/15 text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-6 pt-2 text-xs font-medium">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sAllowCreate}
                    onChange={(e) => setSAllowCreate(e.target.checked)}
                  />
                  <span>Allow participants to create new teams</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sAutoWaitlist}
                    onChange={(e) => setSAutoWaitlist(e.target.checked)}
                  />
                  <span>Automatic Smart Waitlist promotion on vacancy</span>
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-[#192230] text-white text-sm font-semibold"
                >
                  Save Event Settings
                </button>
              </div>
            </form>
          )}

          {/* SYSTEM SETTINGS */}
          {activeTab === 'system-settings' && (
            <div className="bg-white border border-[#192230]/10 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold">System Architecture & Security Controls</h2>
              <div className="grid sm:grid-cols-2 gap-4 text-xs text-[#66717E]">
                <div className="p-4 rounded-lg bg-[#F7F5EF] border border-[#192230]/10">
                  <div className="font-semibold text-[#192230]">Database Concurrency Control</div>
                  <p className="mt-1">
                    Cloud SQL PostgreSQL with Drizzle ORM transactions, SELECT ... FOR UPDATE row locks, and UNIQUE(team_id, user_id) constraints.
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-[#F7F5EF] border border-[#192230]/10">
                  <div className="font-semibold text-[#192230]">Authentication & RBAC</div>
                  <p className="mt-1">
                    Firebase Authentication (Google OAuth) + bcryptjs password hashing + JWT & httpOnly refresh cookies with strict role guards.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Participant Detail Drawer */}
      {selectedParticipant && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#192230]/45">
          <div className="bg-white w-full max-w-md h-full overflow-y-auto border-l border-[#192230]/15 p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#192230]/10 pb-4">
              <div className="flex items-center gap-3">
                <UserAvatar name={selectedParticipant.fullName} size="lg" />
                <div>
                  <h3 className="font-display text-lg font-bold text-[#192230]">
                    {selectedParticipant.fullName}
                  </h3>
                  <div className="text-xs text-[#66717E]">{selectedParticipant.email}</div>
                  <div className="text-[11px] font-mono text-[#1E9782] mt-0.5">
                    {selectedParticipant.role} · {selectedParticipant.status}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedParticipant(null)}
                className="p-1.5 rounded-lg border border-[#192230]/15 hover:bg-[#F7F5EF]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[#F7F5EF]">
                <div className="text-[#66717E]">Profile Completion</div>
                <div className="font-mono text-lg font-bold text-[#1E9782] mt-0.5">
                  {selectedParticipant.completionPct ?? 0}%
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F5EF]">
                <div className="text-[#66717E]">Current Team</div>
                <div className="font-semibold text-[#192230] mt-1 truncate">
                  {selectedParticipant.currentTeam?.teamName || 'Unassigned'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F5EF]">
                <div className="text-[#66717E]">Preferred Role</div>
                <div className="font-semibold text-[#192230] mt-1">
                  {selectedParticipant.preferredRole || 'Unset'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F5EF]">
                <div className="text-[#66717E]">Experience & Mode</div>
                <div className="font-semibold text-[#192230] mt-1">
                  {selectedParticipant.experienceLevel || 'Intermediate'} ·{' '}
                  {selectedParticipant.collaborationMode || 'Hybrid'}
                </div>
              </div>
            </div>

            <div className="text-xs space-y-2">
              <div className="font-semibold text-[#192230]">Affiliation</div>
              <p className="text-[#66717E]">
                {selectedParticipant.institution || 'Not provided'} ·{' '}
                {selectedParticipant.location || 'Location unset'}
              </p>
            </div>

            {selectedParticipant.bio && (
              <div className="text-xs space-y-1.5">
                <div className="font-semibold text-[#192230]">Biography</div>
                <p className="text-[#66717E] leading-relaxed">{selectedParticipant.bio}</p>
              </div>
            )}

            <div className="text-xs space-y-2">
              <div className="font-semibold text-[#192230]">
                Technical Skills ({(selectedParticipant.skills || []).length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(selectedParticipant.skills || []).length > 0 ? (
                  selectedParticipant.skills.map((s: string) => (
                    <span
                      key={s}
                      className="px-2.5 py-1 rounded bg-[#E5F3ED] text-[#1E9782] font-medium"
                    >
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-[#66717E]">No technical skills saved yet.</span>
                )}
              </div>
            </div>

            {selectedParticipant.role !== 'ADMIN' && (
              <div className="pt-4 border-t border-[#192230]/10 flex justify-end">
                <button
                  onClick={() => handleToggleUserStatus(selectedParticipant.id, selectedParticipant.status)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold ${
                    selectedParticipant.status === 'ACTIVE'
                      ? 'bg-[#EF6853] text-white'
                      : 'bg-[#1E9782] text-white'
                  }`}
                >
                  {selectedParticipant.status === 'ACTIVE' ? 'Suspend Account' : 'Activate Account'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Team Detail Drawer */}
      {(selectedTeamDetail || loadingTeamDrawer) && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#192230]/45">
          <div className="bg-white w-full max-w-lg h-full overflow-y-auto border-l border-[#192230]/15 p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#192230]/10 pb-4">
              <div>
                <div className="text-xs text-[#66717E]">
                  {selectedTeamDetail?.category} · {selectedTeamDetail?.collaborationMode}
                </div>
                <h3 className="font-display text-xl font-bold text-[#192230] mt-0.5">
                  {loadingTeamDrawer ? 'Loading team...' : selectedTeamDetail?.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTeamDetail(null)}
                className="p-1.5 rounded-lg border border-[#192230]/15 hover:bg-[#F7F5EF]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedTeamDetail && !loadingTeamDrawer && (
              <>
                <p className="text-xs text-[#66717E] leading-relaxed">{selectedTeamDetail.description}</p>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-[#F7F5EF]">
                    <div className="text-[#66717E]">Seats</div>
                    <div className="font-mono text-lg font-bold mt-0.5">
                      {selectedTeamDetail.memberCount}/{selectedTeamDetail.maxCapacity}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F7F5EF]">
                    <div className="text-[#66717E]">Health</div>
                    <div className="font-mono text-lg font-bold text-[#E6AB43] mt-0.5">
                      {selectedTeamDetail.health?.overallScore ?? 0}/100
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F7F5EF]">
                    <div className="text-[#66717E]">Waitlist</div>
                    <div className="font-mono text-lg font-bold text-[#8070C4] mt-0.5">
                      {selectedTeamDetail.waitlistCount}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#192230] mb-2">
                    Roster ({selectedTeamDetail.members.length})
                  </h4>
                  <div className="divide-y divide-[#192230]/10 border border-[#192230]/10 rounded-lg">
                    {selectedTeamDetail.members.map((m) => (
                      <div key={m.id} className="px-3 py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={m.fullName} size="sm" />
                          <div>
                            <div className="font-semibold text-[#192230]">{m.fullName}</div>
                            <div className="text-[#66717E]">{m.teamRole}</div>
                          </div>
                        </div>
                        {m.isLeader && (
                          <span className="font-mono text-[10px] text-[#EF6853] font-semibold">LEADER</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {selectedTeamDetail.health && (
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-[#192230]">Missing Roles</div>
                    <div className="text-[#66717E]">
                      {selectedTeamDetail.health.missingRoles.join(', ') || 'All required roles covered'}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
};
