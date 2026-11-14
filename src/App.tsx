import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ToastBar } from './components/ToastBar.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { AuthPages } from './pages/AuthPages.tsx';
import { ParticipantPortal } from './pages/ParticipantPortal.tsx';
import { LeaderPortal } from './pages/LeaderPortal.tsx';
import { AdminPortal } from './pages/AdminPortal.tsx';

type ViewMode = 'landing' | 'auth' | 'portal';
type PortalRole = 'PARTICIPANT' | 'TEAM_LEADER' | 'ADMIN';
type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

const VALID_PARTICIPANT_TABS = new Set([
  'overview',
  'profile',
  'discover',
  'recommended',
  'teammates',
  'my-team',
  'invitations',
  'waitlist',
  'notifications',
  'settings',
]);

const VALID_LEADER_TABS = new Set([
  'overview',
  'my-team',
  'create-team',
  'members',
  'requirements',
  'health',
  'find-members',
  'invitations',
  'waitlist',
  'leadership',
  'history',
  'settings',
]);

const VALID_ADMIN_TABS = new Set([
  'overview',
  'participants',
  'teams',
  'compat-analytics',
  'health-analytics',
  'fairness',
  'waitlist-mgmt',
  'concurrency-lab',
  'audit-logs',
  'event-settings',
  'system-settings',
]);

interface ParsedRoute {
  view: ViewMode;
  authMode: AuthMode;
  portalRole: PortalRole;
  tab: string;
}

function parsePathname(pathname: string): ParsedRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') {
    return { view: 'landing', authMode: 'login', portalRole: 'PARTICIPANT', tab: 'overview' };
  }
  if (clean === '/login') {
    return { view: 'auth', authMode: 'login', portalRole: 'PARTICIPANT', tab: 'overview' };
  }
  if (clean === '/register') {
    return { view: 'auth', authMode: 'register', portalRole: 'PARTICIPANT', tab: 'overview' };
  }
  if (clean === '/forgot-password') {
    return { view: 'auth', authMode: 'forgot', portalRole: 'PARTICIPANT', tab: 'overview' };
  }
  if (clean === '/reset-password') {
    return { view: 'auth', authMode: 'reset', portalRole: 'PARTICIPANT', tab: 'overview' };
  }

  const parts = clean.split('/').filter(Boolean);
  if (parts[0] === 'participant') {
    const tab = parts[1] && VALID_PARTICIPANT_TABS.has(parts[1]) ? parts[1] : 'overview';
    return { view: 'portal', authMode: 'login', portalRole: 'PARTICIPANT', tab };
  }
  if (parts[0] === 'leader') {
    const tab = parts[1] && VALID_LEADER_TABS.has(parts[1]) ? parts[1] : 'overview';
    return { view: 'portal', authMode: 'login', portalRole: 'TEAM_LEADER', tab };
  }
  if (parts[0] === 'admin') {
    const tab = parts[1] && VALID_ADMIN_TABS.has(parts[1]) ? parts[1] : 'overview';
    return { view: 'portal', authMode: 'login', portalRole: 'ADMIN', tab };
  }

  return { view: 'landing', authMode: 'login', portalRole: 'PARTICIPANT', tab: 'overview' };
}

function buildPath(route: ParsedRoute): string {
  if (route.view === 'landing') return '/';
  if (route.view === 'auth') {
    if (route.authMode === 'register') return '/register';
    if (route.authMode === 'forgot') return '/forgot-password';
    if (route.authMode === 'reset') return '/reset-password';
    return '/login';
  }
  const prefix =
    route.portalRole === 'ADMIN'
      ? 'admin'
      : route.portalRole === 'TEAM_LEADER'
      ? 'leader'
      : 'participant';
  return `/${prefix}/${route.tab || 'overview'}`;
}

const HackForgeRouter: React.FC = () => {
  const { user, loading, pushToast } = useAuth();
  const [route, setRoute] = useState<ParsedRoute>(() =>
    parsePathname(typeof window !== 'undefined' ? window.location.pathname : '/')
  );

  const navigate = useCallback((next: ParsedRoute, replace = false) => {
    setRoute(next);
    if (typeof window !== 'undefined') {
      const targetUrl = buildPath(next);
      if (window.location.pathname !== targetUrl) {
        if (replace) window.history.replaceState(null, '', targetUrl);
        else window.history.pushState(null, '', targetUrl);
      }
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(parsePathname(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Enforce auth and role guards cleanly on route/session transitions
  useEffect(() => {
    if (loading) return;

    if (!user && route.view === 'portal') {
      navigate({ view: 'auth', authMode: 'login', portalRole: 'PARTICIPANT', tab: 'overview' }, true);
      return;
    }

    if (user && route.view === 'auth') {
      navigate({ view: 'portal', authMode: 'login', portalRole: user.role, tab: 'overview' }, true);
      return;
    }

    if (user && route.view === 'portal') {
      if (route.portalRole === 'ADMIN' && user.role !== 'ADMIN') {
        pushToast('info', 'Redirected to your authorized workspace.');
        navigate({ view: 'portal', authMode: 'login', portalRole: user.role, tab: 'overview' }, true);
      } else if (route.portalRole === 'TEAM_LEADER' && user.role === 'PARTICIPANT') {
        pushToast('info', 'Create or lead a team to access the Team Leader Portal.');
        navigate({ view: 'portal', authMode: 'login', portalRole: 'PARTICIPANT', tab: 'overview' }, true);
      }
    }
  }, [user, loading, route.view, route.portalRole, navigate, pushToast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5EF] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-[#66717E]">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#EF6853] animate-pulse" />
          <span>Loading HackForge...</span>
        </div>
      </div>
    );
  }

  const handleOpenPortal = () => {
    if (!user) {
      navigate({ view: 'auth', authMode: 'login', portalRole: 'PARTICIPANT', tab: 'overview' });
      return;
    }
    navigate({ view: 'portal', authMode: 'login', portalRole: user.role, tab: 'overview' });
  };

  const handleSwitchPortal = (target: PortalRole) => {
    if (!user) return;
    if (target === 'ADMIN' && user.role !== 'ADMIN') return;
    if (target === 'TEAM_LEADER' && user.role === 'PARTICIPANT') return;
    navigate({ view: 'portal', authMode: 'login', portalRole: target, tab: 'overview' });
  };

  const handleSelectTab = (tab: string) => {
    navigate({ ...route, view: 'portal', tab });
  };

  return (
    <>
      {route.view === 'landing' && (
        <LandingPage
          user={user}
          onNavigateAuth={(mode) =>
            navigate({ view: 'auth', authMode: mode, portalRole: 'PARTICIPANT', tab: 'overview' })
          }
          onOpenPortal={handleOpenPortal}
        />
      )}

      {route.view === 'auth' && (
        <AuthPages
          initialMode={route.authMode}
          onBackHome={() =>
            navigate({ view: 'landing', authMode: 'login', portalRole: 'PARTICIPANT', tab: 'overview' })
          }
          onSuccess={(loggedInUser) => {
            const role = loggedInUser?.role || user?.role || 'PARTICIPANT';
            navigate({ view: 'portal', authMode: 'login', portalRole: role, tab: 'overview' });
          }}
        />
      )}

      {route.view === 'portal' && user && (
        <>
          {route.portalRole === 'ADMIN' && user.role === 'ADMIN' && (
            <AdminPortal
              activeTab={VALID_ADMIN_TABS.has(route.tab) ? route.tab : 'overview'}
              onSelectTab={handleSelectTab}
              onGoHome={() =>
                navigate({ view: 'landing', authMode: 'login', portalRole: 'ADMIN', tab: 'overview' })
              }
              onSwitchPortal={handleSwitchPortal}
            />
          )}
          {route.portalRole === 'TEAM_LEADER' && (user.role === 'TEAM_LEADER' || user.role === 'ADMIN') && (
            <LeaderPortal
              activeTab={VALID_LEADER_TABS.has(route.tab) ? route.tab : 'overview'}
              onSelectTab={handleSelectTab}
              onGoHome={() =>
                navigate({ view: 'landing', authMode: 'login', portalRole: 'TEAM_LEADER', tab: 'overview' })
              }
              onSwitchPortal={handleSwitchPortal}
            />
          )}
          {(route.portalRole === 'PARTICIPANT' ||
            (route.portalRole === 'TEAM_LEADER' && user.role === 'PARTICIPANT') ||
            (route.portalRole === 'ADMIN' && user.role !== 'ADMIN')) && (
            <ParticipantPortal
              activeTab={VALID_PARTICIPANT_TABS.has(route.tab) ? route.tab : 'overview'}
              onSelectTab={handleSelectTab}
              onGoHome={() =>
                navigate({ view: 'landing', authMode: 'login', portalRole: 'PARTICIPANT', tab: 'overview' })
              }
              onSwitchPortal={handleSwitchPortal}
            />
          )}
        </>
      )}

      <ToastBar />
    </>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <HackForgeRouter />
    </AuthProvider>
  );
}
