import React, { useState } from 'react';
import {
  ArrowRight,
  Lock,
  Scale,
  Activity,
  Clock,
  GitBranch,
  Cpu,
  ShieldCheck,
  Database,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Layers,
  Terminal,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AuthUser } from '../types/hackforge.ts';
import heroTeamImg from '../assets/images/hero_team_formation_1794634320141.jpg';
import lockArchImg from '../assets/images/architecture_concurrency_lock_1794634321353.jpg';

interface LandingPageProps {
  user: AuthUser | null;
  onNavigateAuth: (mode: 'login' | 'register') => void;
  onOpenPortal: () => void;
}

const PROBLEMS = [
  {
    title: 'Unbalanced Teams',
    body: 'Squads pack four frontend developers with zero AI/ML, backend, or design capacity, stalling hours into the build.',
    tag: 'Roster Skew',
  },
  {
    title: 'Skill & Role Mismatch',
    body: 'Casual Slack pitches mask stack overlaps, leaving critical architecture and presentation roles completely uncovered.',
    tag: 'Opaque Matching',
  },
  {
    title: 'Last-Seat Race Conditions',
    body: 'When fifty builders click join on the final open slot simultaneously, non-atomic checks allow silent overbooking.',
    tag: 'Concurrency Bug',
  },
  {
    title: 'Unfair Waitlists',
    body: 'Manual spreadsheets let organizers skip earlier applicants instead of enforcing deterministic FIFO queue promotion.',
    tag: 'Queue Drift',
  },
  {
    title: 'Leadership Dependency',
    body: 'If a primary captain drops out mid-hackathon, teams lose permissions and coordination continuity overnight.',
    tag: 'Single Point Failure',
  },
  {
    title: 'Zero Audit Visibility',
    body: 'Event administrators lack quantitative fairness metrics across unassigned roles, rejection loops, and queue wait times.',
    tag: 'No Telemetry',
  },
];

const WORKFLOW_STAGES = [
  { step: 'Register', detail: 'Verified identity & role guard' },
  { step: 'Create Profile', detail: 'Skills, track, & mode persisted' },
  { step: 'Discover Teams', detail: 'Filter by open seats & domain' },
  { step: 'Compatibility', detail: '5-factor deterministic scoring' },
  { step: 'Team Health', detail: 'Role & skill gap diagnostics' },
  { step: 'Join Atomic', detail: 'SELECT FOR UPDATE seat lock' },
  { step: 'Confirmed', detail: 'Audited roster & notifications' },
];

const CORE_INNOVATIONS = [
  {
    title: 'Race-Proof Team Formation',
    accent: '#1E9782',
    surface: '#E5F3ED',
    icon: Lock,
    summary:
      'PostgreSQL ACID transactions paired with SELECT ... FOR UPDATE row-level locking serialize concurrent join attempts at the database boundary.',
    metric: '1 winner · 49 safe rejections · 0 overbookings',
  },
  {
    title: 'Explainable Compatibility Engine',
    accent: '#8070C4',
    surface: '#EEE9FA',
    icon: Cpu,
    summary:
      'Transparent 35/25/15/15/10 weighting across skills, role complementarity, experience, track interest, and collaboration style.',
    metric: 'Full 5-factor breakdown & suggested contribution',
  },
  {
    title: 'Team Health Diagnostics',
    accent: '#E6AB43',
    surface: '#FDF4DF',
    icon: Activity,
    summary:
      'Continuously scores skill coverage, role diversity, experience balance, leadership readiness, and requirement fulfillment on every roster shift.',
    metric: 'Live missing-role & missing-skill action items',
  },
  {
    title: 'Smart Waitlist System',
    accent: '#EF6853',
    surface: '#FDECE9',
    icon: Clock,
    summary:
      'Assigns deterministic FIFO positions on full teams and automatically promotes the next eligible candidate when a seat opens.',
    metric: 'Timed invitation windows with atomic acceptance',
  },
  {
    title: 'Leadership Succession',
    accent: '#1E9782',
    surface: '#E5F3ED',
    icon: GitBranch,
    summary:
      'Supports secondary leader designation, planned authority transfers, and automatic succession if a primary leader leaves.',
    metric: 'Zero orphaned teams · immutable succession log',
  },
  {
    title: 'Fairness Dashboard',
    accent: '#192230',
    surface: '#EAECEF',
    icon: Scale,
    summary:
      'Equips organizers with transparent visibility into unassigned roles, invitation acceptance trends, and complete allocation audit logs.',
    metric: 'Scores guide human review — never auto-reject',
  },
];

const SAMPLE_COMPATIBILITY_PROFILES = [
  {
    name: 'Ananya Deshmukh · AI/ML Developer',
    team: 'Team Alpha (Artificial Intelligence · 4/5 Seats)',
    overall: 93.4,
    components: [
      { label: 'Skill Match', weight: '35%', score: 96, color: '#1E9782' },
      { label: 'Role Complementarity', weight: '25%', score: 100, color: '#8070C4' },
      { label: 'Experience Fit', weight: '15%', score: 92, color: '#E6AB43' },
      { label: 'Project Interest', weight: '15%', score: 100, color: '#EF6853' },
      { label: 'Collaboration Mode', weight: '10%', score: 100, color: '#192230' },
    ],
    matching: ['Python', 'TensorFlow'],
    missing: ['React', 'Figma'],
    complementary: ['PyTorch', 'Data Analysis'],
    contribution: 'Step directly into Team Alpha’s open AI/ML Developer seat and unblock clinical inference modeling.',
  },
  {
    name: 'Meera Nair · UI/UX Designer',
    team: 'CivicSight AI (Smart Cities · 4/5 Seats)',
    overall: 85.8,
    components: [
      { label: 'Skill Match', weight: '35%', score: 82, color: '#1E9782' },
      { label: 'Role Complementarity', weight: '25%', score: 100, color: '#8070C4' },
      { label: 'Experience Fit', weight: '15%', score: 100, color: '#E6AB43' },
      { label: 'Project Interest', weight: '15%', score: 64, color: '#EF6853' },
      { label: 'Collaboration Mode', weight: '10%', score: 100, color: '#192230' },
    ],
    matching: ['Figma', 'UI/UX', 'Prototyping'],
    missing: ['PyTorch', 'Docker'],
    complementary: ['Figma', 'Prototyping'],
    contribution: 'Fill the uncovered UI/UX Designer seat and deliver interactive transit corridor dashboards.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ user, onNavigateAuth, onOpenPortal }) => {
  const [compatIdx, setCompatIdx] = useState(0);
  const [raceSimRun, setRaceSimRun] = useState(false);

  const sampleCompat = SAMPLE_COMPATIBILITY_PROFILES[compatIdx];

  return (
    <div className="min-h-screen bg-[#F7F5EF] text-[#192230]">
      {/* 1. Navigation Header */}
      <header className="sticky top-0 z-40 bg-[#F7F5EF]/95 backdrop-blur-sm border-b border-[#192230]/10">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-3.5 flex items-center justify-between gap-6">
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-[#192230] whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-[#EF6853]" />
            <span>HackForge</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#66717E]">
            <a href="#how-it-works" className="hover:text-[#192230] transition-colors whitespace-nowrap">
              Workflow
            </a>
            <a href="#innovations" className="hover:text-[#192230] transition-colors whitespace-nowrap">
              Core Engines
            </a>
            <a href="#race-proof" className="hover:text-[#192230] transition-colors whitespace-nowrap">
              Race-Proof Lock
            </a>
            <a href="#architecture" className="hover:text-[#192230] transition-colors whitespace-nowrap">
              Architecture
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={onOpenPortal}
                className="px-4 py-2 text-xs sm:text-sm font-semibold bg-[#192230] text-[#F7F5EF] rounded-lg hover:bg-[#192230]/90 transition-colors whitespace-nowrap"
              >
                Open Portal
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateAuth('login')}
                  className="hidden sm:inline-flex px-3.5 py-2 text-sm font-semibold text-[#192230] hover:bg-white rounded-lg transition-colors whitespace-nowrap"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateAuth('register')}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold bg-[#EF6853] text-white rounded-lg hover:bg-[#EF6853]/90 transition-colors whitespace-nowrap"
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section id="top" className="max-w-7xl mx-auto px-5 sm:px-8 pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="lg:col-span-6 flex flex-col justify-between"
          >
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#1E9782] mb-4">
                <ShieldCheck className="w-4 h-4" />
                <span>PS1 · Race-Proof Team Formation at Scale</span>
              </div>
              <h1
                className="font-display font-bold tracking-tight text-[#192230] leading-[1.06]"
                style={{ fontSize: 'clamp(2.2rem, 3.8vw, 3.5rem)', textWrap: 'balance' as any }}
              >
                Stop Building Random Teams. Start Building Winning Teams.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-[#66717E] max-w-xl leading-relaxed">
                HackForge helps participants discover compatible teammates, build balanced teams, and manage team formation through transparent, race-proof allocation.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => (user ? onOpenPortal() : onNavigateAuth('register'))}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#EF6853] text-white text-sm font-semibold hover:bg-[#EF6853]/90 transition-colors whitespace-nowrap"
                >
                  <span>Find Your Team</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => (user ? onOpenPortal() : onNavigateAuth('login'))}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-white border border-[#192230]/15 text-[#192230] text-sm font-semibold hover:border-[#192230]/40 transition-colors whitespace-nowrap"
                >
                  <span>Create a Team</span>
                </button>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-[#192230]/10 grid grid-cols-3 gap-5">
              <div>
                <div className="font-mono text-2xl font-bold text-[#192230] tabular-nums">50 → 1</div>
                <div className="text-xs text-[#66717E] mt-1">Atomic seat lock</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold text-[#1E9782] tabular-nums">5-Factor</div>
                <div className="text-xs text-[#66717E] mt-1">Weighted compatibility</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold text-[#EF6853] tabular-nums">3 Portals</div>
                <div className="text-xs text-[#66717E] mt-1">Builder · Leader · Admin</div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="lg:col-span-6"
          >
            <div className="rounded-2xl overflow-hidden border border-[#192230]/12 bg-white shadow-sm">
              <div className="aspect-[16/10] w-full overflow-hidden bg-[#192230]">
                <img
                  src={heroTeamImg}
                  alt="Interconnected architectural system representing balanced engineering team formation"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5 bg-white border-t border-[#192230]/10 grid grid-cols-3 gap-4 text-xs">
                <div>
                  <div className="text-[#66717E]">Skill Coverage</div>
                  <div className="font-mono font-bold text-[#1E9782] mt-0.5 tabular-nums">35% Weight</div>
                </div>
                <div>
                  <div className="text-[#66717E]">Role Balance</div>
                  <div className="font-mono font-bold text-[#8070C4] mt-0.5 tabular-nums">25% Weight</div>
                </div>
                <div>
                  <div className="text-[#66717E]">Concurrency</div>
                  <div className="font-mono font-bold text-[#EF6853] mt-0.5">FOR UPDATE</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 3. Problem Section */}
      <section className="border-t border-[#192230]/10 bg-white py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold text-[#EF6853] uppercase tracking-wider">The Problem</div>
            <h2 className="font-display text-3xl font-bold tracking-tight mt-2">
              Why conventional hackathon team formation breaks down at scale.
            </h2>
          </div>

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {PROBLEMS.map((p, idx) => (
              <div
                key={p.title}
                className="p-6 rounded-xl bg-[#F7F5EF]/60 border border-[#192230]/10 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-[#66717E] font-mono">
                    <span>{String(idx + 1).padStart(2, '0')}</span>
                    <span className="font-sans font-semibold text-[#EF6853]">{p.tag}</span>
                  </div>
                  <h3 className="font-display text-lg font-bold mt-2.5 text-[#192230]">{p.title}</h3>
                  <p className="text-sm text-[#66717E] mt-2 leading-relaxed">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. How HackForge Works */}
      <section id="how-it-works" className="border-t border-[#192230]/10 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-[#8070C4] uppercase tracking-wider">
                Deterministic Workflow
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight mt-2">
                Seven transparent stages from signup to confirmed team seat.
              </h2>
            </div>
            <p className="text-sm text-[#66717E] max-w-md">
              Every state transition writes directly to Cloud SQL PostgreSQL with immutable audit logging.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3.5">
            {WORKFLOW_STAGES.map((item, i) => (
              <div
                key={item.step}
                className="p-4 rounded-xl bg-white border border-[#192230]/10 flex flex-col justify-between"
              >
                <div className="font-mono text-xs font-semibold text-[#8070C4] tabular-nums">
                  Stage {i + 1}
                </div>
                <div className="mt-3">
                  <div className="font-display text-sm font-bold text-[#192230]">{item.step}</div>
                  <div className="text-xs text-[#66717E] mt-1 leading-snug">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Six Core Innovations */}
      <section id="innovations" className="border-t border-[#192230]/10 bg-white py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold text-[#1E9782] uppercase tracking-wider">Core Engines</div>
            <h2 className="font-display text-3xl font-bold tracking-tight mt-2">
              Six synchronized engines built for fairness and reliability.
            </h2>
          </div>

          <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CORE_INNOVATIONS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="bg-[#F7F5EF]/45 border border-[#192230]/10 rounded-xl p-6 flex flex-col justify-between hover:border-[#192230]/25 transition-colors"
                >
                  <div>
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: item.surface }}
                    >
                      <Icon className="w-5 h-5" style={{ color: item.accent }} />
                    </div>
                    <h3 className="font-display text-xl font-bold mt-4">{item.title}</h3>
                    <p className="text-sm text-[#66717E] mt-2 leading-relaxed">{item.summary}</p>
                  </div>
                  <div className="mt-5 pt-4 border-t border-[#192230]/10 text-xs font-semibold text-[#192230]">
                    {item.metric}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. Compatibility Engine Visual Preview + 7. Team Health Diagnostics Preview */}
      <section className="border-t border-[#192230]/10 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-12 gap-8 items-stretch">
          {/* Compatibility Preview */}
          <div className="lg:col-span-7 bg-white border border-[#192230]/12 rounded-2xl p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[#8070C4] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Compatibility Engine Preview</span>
                  </div>
                  <h3 className="font-display text-2xl font-bold mt-1">
                    Explainable 5-Dimension Match
                  </h3>
                </div>
                <div className="flex gap-1.5 bg-[#F7F5EF] p-1 rounded-lg border border-[#192230]/10">
                  {SAMPLE_COMPATIBILITY_PROFILES.map((p, idx) => (
                    <button
                      type="button"
                      key={p.name}
                      onClick={() => setCompatIdx(idx)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        compatIdx === idx
                          ? 'bg-[#8070C4] text-white'
                          : 'text-[#66717E] hover:text-[#192230]'
                      }`}
                    >
                      Example {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 p-4 rounded-xl bg-[#EEE9FA]/55 border border-[#8070C4]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[#8070C4]">{sampleCompat.name}</div>
                  <div className="text-sm font-bold text-[#192230] mt-0.5">{sampleCompat.team}</div>
                </div>
                <div className="font-mono text-3xl font-bold text-[#8070C4] tabular-nums">
                  {sampleCompat.overall}%
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {sampleCompat.components.map((c) => (
                  <div key={c.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-[#192230]">
                        {c.label} <span className="text-[#66717E]">({c.weight})</span>
                      </span>
                      <span className="font-mono font-semibold tabular-nums">{c.score}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#F7F5EF] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${c.score}%`, backgroundColor: c.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#192230]/10 space-y-2 text-xs">
              <div className="flex flex-wrap gap-4">
                <span>
                  <strong className="text-[#1E9782]">Matching:</strong> {sampleCompat.matching.join(', ')}
                </span>
                <span>
                  <strong className="text-[#EF6853]">Missing:</strong> {sampleCompat.missing.join(', ')}
                </span>
                <span>
                  <strong className="text-[#8070C4]">Complementary:</strong>{' '}
                  {sampleCompat.complementary.join(', ')}
                </span>
              </div>
              <p className="text-[#66717E]">{sampleCompat.contribution}</p>
            </div>
          </div>

          {/* Team Health Preview */}
          <div className="lg:col-span-5 bg-[#192230] text-[#F7F5EF] rounded-2xl p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-[#E6AB43] uppercase tracking-wider">
                Team Health Diagnostics
              </div>
              <h3 className="font-display text-2xl font-bold mt-1">
                Live Roster Balance Scorecard
              </h3>
              <p className="text-xs text-[#F7F5EF]/70 mt-1.5 leading-relaxed">
                Formula: 35% Skill Coverage · 30% Role Coverage · 15% Experience Diversity · 10% Leadership · 10% Requirement Fulfillment.
              </p>

              <div className="mt-5 p-4 rounded-xl bg-white/8 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xs text-[#F7F5EF]/65">Team Alpha · 4/5 Seats</div>
                  <div className="font-display text-lg font-bold text-[#E6AB43] mt-0.5">
                    Needs Improvement
                  </div>
                </div>
                <div className="font-mono text-3xl font-bold tabular-nums text-white">58.1</div>
              </div>

              <div className="mt-5 space-y-2.5 text-xs">
                {[
                  { label: 'Skill Coverage (35%)', val: 50, color: '#1E9782' },
                  { label: 'Role Coverage (30%)', val: 40, color: '#EF6853' },
                  { label: 'Experience Balance (15%)', val: 80, color: '#E6AB43' },
                  { label: 'Leadership Readiness (10%)', val: 60, color: '#8070C4' },
                  { label: 'Requirement Fulfillment (10%)', val: 63, color: '#F7F5EF' },
                ].map((bar) => (
                  <div key={bar.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[#F7F5EF]/80">{bar.label}</span>
                      <span className="font-mono tabular-nums">{bar.val}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${bar.val}%`, backgroundColor: bar.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 space-y-1.5 text-xs">
              <div className="font-semibold text-[#E6AB43]">Live Actionable Recommendations:</div>
              <div className="text-[#F7F5EF]/75 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-[#EF6853] shrink-0" />
                <span>Recruit an AI/ML Developer &amp; UI/UX Designer</span>
              </div>
              <div className="text-[#F7F5EF]/75 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#1E9782] shrink-0" />
                <span>Designate a Secondary Leader for continuity</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Race-Proof Team Formation Demo Preview */}
      <section id="race-proof" className="border-t border-[#192230]/10 bg-white py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <div className="rounded-2xl overflow-hidden border border-[#192230]/12 bg-[#192230]">
              <img
                src={lockArchImg}
                alt="Precision locking mechanism representing PostgreSQL row-level locking"
                referrerPolicy="no-referrer"
                className="w-full h-64 sm:h-80 object-cover"
              />
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="text-xs font-semibold text-[#1E9782] uppercase tracking-wider">
              PS1 Flagship Innovation
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight mt-2">
              50 simultaneous join requests. 1 open seat. Zero overbooking.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#66717E] leading-relaxed">
              Every join, invitation approval, and waitlist promotion runs inside an atomic PostgreSQL transaction acquiring an exclusive <code className="font-mono text-[#192230] bg-[#F7F5EF] px-1.5 py-0.5 rounded">SELECT ... FOR UPDATE</code> row lock on the target team before reading capacity or inserting membership.
            </p>

            <div className="mt-5 bg-[#192230] text-[#F7F5EF] rounded-xl p-5 font-mono text-xs leading-relaxed overflow-x-auto">
              <div>BEGIN;</div>
              <div className="text-[#E6AB43]">SELECT id, max_capacity FROM teams WHERE id = $1 FOR UPDATE;</div>
              <div>SELECT COUNT(*) FROM team_members WHERE team_id = $1;</div>
              <div className="text-[#1E9782]">-- Enforced: count &lt; max_capacity &amp;&amp; UNIQUE(team_id, user_id)</div>
              <div>INSERT INTO team_members (team_id, user_id, team_role) VALUES (...);</div>
              <div>COMMIT;</div>
            </div>

            <div className="mt-5 p-4 rounded-xl bg-[#F7F5EF] border border-[#192230]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-[#192230]">
                  Interactive Preview · Full 50-Request Live Blast Available in Admin Concurrency Lab
                </div>
                <div className="text-xs text-[#66717E] mt-0.5">
                  {raceSimRun
                    ? 'Serialized result: Request #1 committed (5/5) · Requests #2–#50 safely rejected (TEAM_FULL).'
                    : 'Preview how concurrent requests serialize behind the PostgreSQL row lock.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRaceSimRun((r) => !r)}
                className="px-4 py-2 rounded-lg bg-[#1E9782] text-white text-xs font-semibold hover:bg-[#1E9782]/90 whitespace-nowrap shrink-0"
              >
                {raceSimRun ? 'Reset Preview' : 'Preview Lock Serialization'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Smart Waitlist Workflow + 10. Fairness & Transparency */}
      <section className="border-t border-[#192230]/10 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-8">
          <div className="bg-white border border-[#192230]/12 rounded-2xl p-6 sm:p-7">
            <div className="text-xs font-semibold text-[#EF6853] uppercase tracking-wider">
              Smart Waitlist Workflow
            </div>
            <h3 className="font-display text-2xl font-bold mt-2">
              Deterministic FIFO Queues with Atomic Promotion
            </h3>
            <div className="mt-6 space-y-4">
              {[
                {
                  step: '1. Queue Entry',
                  desc: 'Full teams accept waitlist requests in strict FIFO order without favoritism or duplicate entries.',
                },
                {
                  step: '2. Vacancy Trigger',
                  desc: 'When a member leaves or is removed, the next WAITING applicant automatically moves to INVITED.',
                },
                {
                  step: '3. Timed Acceptance or Roll-Over',
                  desc: 'Confirming the seat locks the team row atomically; expired or declined seats advance to queue #2.',
                },
              ].map((w) => (
                <div key={w.step} className="p-4 rounded-xl bg-[#F7F5EF] border border-[#192230]/10">
                  <div className="text-sm font-bold text-[#192230]">{w.step}</div>
                  <div className="text-xs text-[#66717E] mt-1">{w.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#192230]/12 rounded-2xl p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-[#1E9782] uppercase tracking-wider">
                Fairness &amp; Transparency
              </div>
              <h3 className="font-display text-2xl font-bold mt-2">
                Decision Support, Not Algorithmic Gatekeeping
              </h3>
              <p className="text-sm text-[#66717E] mt-3 leading-relaxed">
                Compatibility and Team Health scores surface skill overlaps and roster gaps to help participants and leaders make informed decisions. They never automatically reject applicants or hide teams.
              </p>
              <ul className="mt-5 space-y-2.5 text-xs text-[#192230]">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#1E9782] shrink-0 mt-0.5" />
                  <span>Track unassigned participants by preferred role so no talent pool is overlooked.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#1E9782] shrink-0 mt-0.5" />
                  <span>Monitor repeated invitation rejections and waitlist expiration bottlenecks.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#1E9782] shrink-0 mt-0.5" />
                  <span>Verify every allocation against immutable PostgreSQL audit records.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 11. Technical Architecture */}
      <section id="architecture" className="border-t border-[#192230]/10 bg-white py-16">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="text-xs font-semibold text-[#66717E] uppercase tracking-wider">
            Technical Stack
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-2">
            Engineered end-to-end on persistent relational infrastructure.
          </h2>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: Database,
                title: 'Cloud SQL PostgreSQL',
                body: 'Drizzle ORM relational schema across 15 tables with ACID transactions, FOR UPDATE row locks, and unique constraints.',
              },
              {
                icon: Terminal,
                title: 'Express & TypeScript API',
                body: 'Modular route handlers, RBAC guards, rate-limited auth, and deterministic Compatibility & Health engines.',
              },
              {
                icon: Layers,
                title: 'Real-Time Socket.IO',
                body: 'Instant notifications for waitlist promotions, team invitations, and leadership succession transitions.',
              },
              {
                icon: ShieldCheck,
                title: 'Firebase Auth + JWT',
                body: 'Google OAuth & bcrypt password authentication backed by httpOnly cookies and role-based portal enforcement.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="p-5 rounded-xl bg-[#F7F5EF]/60 border border-[#192230]/10">
                  <Icon className="w-5 h-5 text-[#1E9782]" />
                  <h3 className="font-display text-base font-bold mt-3">{item.title}</h3>
                  <p className="text-xs text-[#66717E] mt-1.5 leading-relaxed">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 12. Final CTA & Quiet Footer */}
      <section className="border-t border-[#192230]/10 bg-[#192230] text-[#F7F5EF] py-16">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Build Balanced Teams. Not Random Teams.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#F7F5EF]/75 max-w-xl mx-auto">
            Sign into the Participant, Team Leader, or Admin workspace to explore live team formation, explainable compatibility, and 50-user concurrency testing.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => (user ? onOpenPortal() : onNavigateAuth('login'))}
              className="px-6 py-3 rounded-lg bg-[#EF6853] text-white text-sm font-semibold hover:bg-[#EF6853]/90 transition-colors"
            >
              {user ? 'Enter Your Portal' : 'Sign In / Demo Accounts'}
            </button>
            {!user && (
              <button
                type="button"
                onClick={() => onNavigateAuth('register')}
                className="px-6 py-3 rounded-lg border border-white/20 text-white text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                Create Participant Account
              </button>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-[#192230]/10 bg-[#F7F5EF] py-9">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-[#66717E]">
          <div>
            <div className="font-display text-sm font-bold text-[#192230]">HackForge</div>
            <div className="mt-1">
              PS1 – Race-Proof Team Formation at Scale · Vedant Dalvi · Shree L.R. Tiwari College of Engineering
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <a href="#how-it-works" className="hover:text-[#192230]">
              Workflow
            </a>
            <a href="#innovations" className="hover:text-[#192230]">
              Core Engines
            </a>
            <a href="#race-proof" className="hover:text-[#192230]">
              Race-Proof Lock
            </a>
            <a href="#architecture" className="hover:text-[#192230]">
              Architecture
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
