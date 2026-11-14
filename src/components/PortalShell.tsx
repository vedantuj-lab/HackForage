import React, { useState } from 'react';
import { Bell, LogOut, Menu, X, CheckCheck, ArrowLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { UserAvatar } from './UserAvatar.tsx';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  section?: string;
}

interface PortalShellProps {
  portalTitle: string;
  portalSubtitle?: string;
  portalRoleKey: 'PARTICIPANT' | 'TEAM_LEADER' | 'ADMIN';
  accentColor: string;
  sidebarDark?: boolean;
  navItems: NavItem[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onSwitchPortal?: (target: 'PARTICIPANT' | 'TEAM_LEADER' | 'ADMIN') => void;
  onGoHome: () => void;
  children: React.ReactNode;
}

export const PortalShell: React.FC<PortalShellProps> = ({
  portalTitle,
  portalSubtitle,
  portalRoleKey,
  accentColor,
  sidebarDark = false,
  navItems,
  activeTab,
  onSelectTab,
  onSwitchPortal,
  onGoHome,
  children,
}) => {
  const { user, notifications, unreadCount, logout, markNotificationRead, markAllNotificationsRead } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const activeNav = navItems.find((n) => n.id === activeTab) || navItems[0];

  const canSwitchPortals = Boolean(
    onSwitchPortal && user && (user.role === 'TEAM_LEADER' || user.role === 'ADMIN')
  );

  // Group nav items preserving order cleanly
  const groupedSections: Array<{ title: string; items: NavItem[] }> = [];
  for (const item of navItems) {
    const sec = item.section || 'Workspace';
    const existing = groupedSections.find((g) => g.title === sec);
    if (existing) existing.items.push(item);
    else groupedSections.push({ title: sec, items: [item] });
  }

  const sidebarSurface = sidebarDark
    ? 'bg-[#192230] text-[#F7F5EF] border-r border-white/10'
    : 'bg-white text-[#192230] border-r border-[#192230]/10';

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Brand + Portal Header */}
      <div className={`px-5 pt-5 pb-4 border-b shrink-0 ${sidebarDark ? 'border-white/10' : 'border-[#192230]/10'}`}>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onGoHome}
            className="font-display text-lg font-bold tracking-tight whitespace-nowrap text-left hover:opacity-80 transition-opacity flex items-center gap-2"
          >
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: accentColor }}
            />
            <span>HackForge</span>
          </button>
          <button
            onClick={onGoHome}
            className={`text-[11px] font-medium inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
              sidebarDark ? 'text-[#F7F5EF]/60 hover:bg-white/10 hover:text-white' : 'text-[#66717E] hover:bg-[#F7F5EF]'
            }`}
            title="Back to Landing Page"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Home</span>
          </button>
        </div>
        <div className={`mt-2 text-xs font-semibold ${sidebarDark ? 'text-[#F7F5EF]/90' : 'text-[#192230]'}`}>
          {portalTitle}
        </div>
        {portalSubtitle && (
          <div className={`text-[11px] mt-0.5 ${sidebarDark ? 'text-[#F7F5EF]/55' : 'text-[#66717E]'}`}>
            {portalSubtitle}
          </div>
        )}
      </div>

      {/* Segmented Workspace Switcher (top-placed, zero crowding) */}
      {canSwitchPortals && onSwitchPortal && user && (
        <div className={`px-4 py-3 border-b shrink-0 ${sidebarDark ? 'border-white/10 bg-white/[0.02]' : 'border-[#192230]/10 bg-[#F7F5EF]/60'}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${sidebarDark ? 'text-[#F7F5EF]/50' : 'text-[#66717E]'}`}>
            Active Workspace
          </div>
          <div className={`grid ${user.role === 'ADMIN' ? 'grid-cols-3' : 'grid-cols-2'} gap-1 p-1 rounded-lg ${sidebarDark ? 'bg-black/25' : 'bg-white border border-[#192230]/10'}`}>
            <button
              type="button"
              onClick={() => {
                onSwitchPortal('PARTICIPANT');
                setMobileOpen(false);
              }}
              className={`px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors text-center truncate ${
                portalRoleKey === 'PARTICIPANT'
                  ? 'bg-[#1E9782] text-white'
                  : sidebarDark
                  ? 'text-[#F7F5EF]/70 hover:text-white'
                  : 'text-[#66717E] hover:text-[#192230]'
              }`}
            >
              Builder
            </button>
            <button
              type="button"
              onClick={() => {
                onSwitchPortal('TEAM_LEADER');
                setMobileOpen(false);
              }}
              className={`px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors text-center truncate ${
                portalRoleKey === 'TEAM_LEADER'
                  ? 'bg-[#EF6853] text-white'
                  : sidebarDark
                  ? 'text-[#F7F5EF]/70 hover:text-white'
                  : 'text-[#66717E] hover:text-[#192230]'
              }`}
            >
              Leader
            </button>
            {user.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => {
                  onSwitchPortal('ADMIN');
                  setMobileOpen(false);
                }}
                className={`px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors text-center truncate ${
                  portalRoleKey === 'ADMIN'
                    ? 'bg-[#E6AB43] text-[#192230]'
                    : sidebarDark
                    ? 'text-[#F7F5EF]/70 hover:text-white'
                    : 'text-[#66717E] hover:text-[#192230]'
                }`}
              >
                Admin
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation Sections — single unified scroll container, zero overlap */}
      <nav className="flex-1 px-3 py-4 space-y-5" aria-label={portalTitle}>
        {groupedSections.map((group) => (
          <div key={group.title}>
            {groupedSections.length > 1 && (
              <div
                className={`px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                  sidebarDark ? 'text-[#F7F5EF]/45' : 'text-[#66717E]/80'
                }`}
              >
                {group.title}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.id === activeTab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      setMobileOpen(false);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? sidebarDark
                          ? 'bg-white/12 text-white font-semibold'
                          : 'bg-[#192230] text-[#F7F5EF] font-semibold'
                        : sidebarDark
                        ? 'text-[#F7F5EF]/72 hover:text-white hover:bg-white/[0.06]'
                        : 'text-[#66717E] hover:text-[#192230] hover:bg-[#F7F5EF]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="shrink-0"
                        style={{ color: isActive ? accentColor : undefined }}
                      >
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-[#EF6853] text-white shrink-0 leading-none">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Compact User Footer */}
      <div className={`px-4 py-3.5 border-t shrink-0 ${sidebarDark ? 'border-white/10 bg-black/15' : 'border-[#192230]/10 bg-[#F7F5EF]/40'}`}>
        <div className="flex items-center gap-2.5">
          <UserAvatar name={user?.fullName || 'Builder'} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{user?.fullName}</div>
            <div className={`text-[11px] truncate ${sidebarDark ? 'text-[#F7F5EF]/60' : 'text-[#66717E]'}`}>
              {user?.role.replace('_', ' ')}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className={`mt-3 w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            sidebarDark
              ? 'border-white/15 text-[#F7F5EF]/90 hover:bg-white/10'
              : 'border-[#192230]/15 text-[#192230] hover:bg-white'
          }`}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F7F5EF] text-[#192230]">
      {/* Desktop Fixed Sidebar */}
      <aside className={`hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-30 ${sidebarSurface}`}>
        {renderSidebarContent()}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-[#192230]/55 backdrop-blur-[1px]" onClick={() => setMobileOpen(false)} />
          <aside className={`relative w-72 max-w-[85vw] flex flex-col z-10 h-full ${sidebarSurface}`}>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3.5 right-3.5 p-1.5 rounded-lg opacity-75 hover:opacity-100 z-20"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-[#F7F5EF]/95 backdrop-blur-sm border-b border-[#192230]/10 px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-white border border-[#192230]/15 text-[#192230] hover:bg-white/80"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-[#66717E] hidden sm:inline truncate">{portalTitle}</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#66717E]/60 hidden sm:inline shrink-0" />
              <span className="font-display font-semibold text-[#192230] truncate">
                {activeNav?.label || 'Overview'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 relative">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#192230]/10 text-xs font-medium text-[#192230]">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: accentColor }}
              />
              <span className="truncate max-w-[160px]">{user?.fullName}</span>
            </div>

            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#192230]/12 hover:border-[#192230]/30 text-xs font-semibold text-[#192230] transition-colors whitespace-nowrap"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Notifications</span>
              {unreadCount > 0 && (
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#EF6853] text-white leading-none">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 sm:w-96 bg-white border border-[#192230]/15 rounded-xl shadow-xl z-40 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#192230]/10 flex items-center justify-between">
                  <span className="font-display font-semibold text-sm">Recent Notifications</span>
                  <button
                    type="button"
                    onClick={() => markAllNotificationsRead()}
                    className="flex items-center gap-1 text-xs font-medium text-[#1E9782] hover:underline"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-[#192230]/10">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#66717E]">No notifications yet.</div>
                  ) : (
                    notifications.slice(0, 8).map((n) => (
                      <button
                        type="button"
                        key={n.id}
                        onClick={() => markNotificationRead(n.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-[#F7F5EF] transition-colors ${
                          !n.isRead ? 'bg-[#1E9782]/5' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#192230] truncate">{n.title}</span>
                          {!n.isRead && (
                            <span className="text-[11px] font-medium text-[#EF6853] shrink-0">Unread</span>
                          )}
                        </div>
                        <p className="text-xs text-[#66717E] mt-1 line-clamp-2">{n.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
