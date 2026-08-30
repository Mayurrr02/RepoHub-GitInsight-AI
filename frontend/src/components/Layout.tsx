import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { useWebSocket } from '../lib/useWebSocket';
import { getMe, syncRepositories } from '../api/repositories';
import { CommandPalette } from './CommandPalette';
import { LiveNotificationBell } from './LiveNotificationBell';
import { RealtimeSyncToast } from './RealtimeSyncToast';
import {
  RepoHubLogo,
  OverviewIcon,
  RepositoriesIcon,
  AnalyticsIcon,
  ActivityIcon,
  IntelligenceIcon,
  TeamIcon,
  ReportsIcon,
  SettingsIcon,
  SyncIcon,
  SearchIcon,
  PullRequestIcon,
  IssueIcon,
} from './icons/Icons';

export function Layout() {
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isConnected, lastEvent } = useWebSocket();
  const { resolvedTheme, toggleTheme } = useThemeStore();

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { data: user } = useQuery({ queryKey: ['me'], queryFn: getMe });

  const sync = useMutation({
    mutationFn: syncRepositories,
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['developer'] });
        queryClient.invalidateQueries({ queryKey: ['history'] });
        queryClient.invalidateQueries({ queryKey: ['repo-metrics'] });
        queryClient.invalidateQueries({ queryKey: ['repositories'] });
        queryClient.invalidateQueries({ queryKey: ['me'] });
      }, 1200);
    },
  });

  const userName = user?.name || user?.login || 'Developer';
  const userLogin = user?.login || '';
  const userAvatar = user?.avatar_url;

  const pageTitles: Record<string, string> = {
    '/': 'Overview',
    '/overview': 'Overview',
    '/repositories': 'Repositories',
    '/analytics': 'Engineering Analytics',
    '/activity': 'Activity Feed',
    '/team': 'Team Analytics',
    '/organizations': 'Team & Organizations',
    '/intelligence': 'AI Intelligence',
    '/reports': 'Engineering Reports',
    '/settings': 'Settings',
    '/profile': 'Profile',
  };

  const currentTitle = pageTitles[location.pathname] || 'Workspace';

  const navItems = [
    { to: '/', label: 'Overview', icon: <OverviewIcon className="h-4 w-4" />, end: true },
    { to: '/repositories', label: 'Repositories', icon: <RepositoriesIcon className="h-4 w-4" /> },
    { to: '/analytics', label: 'Analytics', icon: <AnalyticsIcon className="h-4 w-4" /> },
    { to: '/activity', label: 'Activity', icon: <ActivityIcon className="h-4 w-4" /> },
    { to: '/analytics?tab=prs', label: 'Pull Requests', icon: <PullRequestIcon className="h-4 w-4" /> },
    { to: '/analytics?tab=issues', label: 'Issues', icon: <IssueIcon className="h-4 w-4" /> },
    { to: '/team', label: 'Team', icon: <TeamIcon className="h-4 w-4" /> },
    {
      to: '/intelligence',
      label: 'AI Intelligence',
      icon: <IntelligenceIcon className="h-4 w-4" />,
      badge: 'AI',
    },
    { to: '/reports', label: 'Reports', icon: <ReportsIcon className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#05070B] dark:text-slate-100 flex flex-col md:flex-row antialiased selection:bg-brand-purple/30 selection:text-white transition-colors duration-150">
      {/* Global Command Palette (⌘K) */}
      <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />

      {/* Left Sidebar (230px) */}
      <aside className="hidden md:flex w-[230px] flex-col justify-between border-r border-slate-200 bg-white dark:border-white/[0.07] dark:bg-[#080B12] p-4 shrink-0 select-none transition-colors duration-150">
        <div className="space-y-5">
          {/* Logo & Product Name */}
          <Link to="/" className="flex items-center gap-2.5 px-2 py-1">
            <RepoHubLogo className="h-7 w-7 shrink-0" />
            <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">
              RepoHub
            </span>
          </Link>

          {/* Primary Navigation */}
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const isMatch = item.end
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to.split('?')[0]);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                    isMatch
                      ? 'bg-purple-50 text-purple-900 border border-purple-200 dark:bg-brand-purple/15 dark:text-white font-semibold dark:border-brand-purple/25 dark:shadow-glow-purple'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={isMatch ? 'text-brand-purple' : 'text-slate-400'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-md bg-gradient-to-r from-brand-purple to-indigo-600 text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Settings & GitHub Sync Status */}
        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/[0.07]">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-purple-50 text-purple-900 font-semibold dark:bg-brand-purple/15 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/[0.04]'
              }`
            }
          >
            <SettingsIcon className="h-4 w-4" />
            <span>Settings</span>
          </NavLink>

          {/* Live Sync Status Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.07] dark:bg-[#0D111A] p-3 space-y-2 transition-colors">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-700 dark:text-slate-300 font-medium">GitHub Connection</span>
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>

            <button
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-purple hover:bg-purple-600 disabled:opacity-50 text-white py-1.5 text-[11px] font-semibold transition cursor-pointer shadow-xs"
            >
              <SyncIcon className={`h-3 w-3 ${sync.isPending ? 'animate-spin' : ''}`} />
              <span>{sync.isPending ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>

          {/* User Profile Mini Badge */}
          <div className="flex items-center justify-between pt-1 px-1">
            <div className="flex items-center gap-2 min-w-0">
              {userAvatar ? (
                <img src={userAvatar} alt="" className="h-7 w-7 rounded-full object-cover border border-slate-200 dark:border-white/10" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-brand-purple/30 flex items-center justify-center font-bold text-xs text-brand-purple dark:text-white">
                  {userName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="truncate">
                <p className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate">{userName}</p>
                {userLogin && <p className="text-[10px] text-slate-500 font-mono">@{userLogin}</p>}
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-400 text-xs p-1 cursor-pointer"
              title="Sign out"
            >
              ✕
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 dark:border-white/[0.07] dark:bg-[#05070B]/80 backdrop-blur-xl px-6 py-3 flex items-center justify-between transition-colors duration-150">
          {/* Left: Breadcrumbs / Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 dark:border-white/[0.08] dark:text-slate-400 md:hidden"
            >
              ☰
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 dark:text-slate-500 font-medium">RepoHub</span>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="text-slate-900 dark:text-slate-200 font-semibold">{currentTitle}</span>
            </div>
          </div>

          {/* Center: Global Search Bar */}
          <div className="hidden md:flex items-center flex-1 max-w-md mx-6">
            <button
              onClick={() => setIsCommandOpen(true)}
              className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#0D111A] px-3.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20 transition-colors shadow-inner cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <SearchIcon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <span>Search repositories, commits, contributors...</span>
              </div>
              <kbd className="rounded border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800/90 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-400 shadow-xs">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right: Actions, Notifications, Theme, User */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCommandOpen(true)}
              className="md:hidden p-2 rounded-xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] text-slate-600 dark:text-slate-400"
            >
              <SearchIcon className="h-4 w-4" />
            </button>

            <LiveNotificationBell isConnected={isConnected} lastEvent={lastEvent} />

            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 dark:border-white/[0.08] dark:bg-[#0D111A] dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer shadow-xs"
              title={resolvedTheme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {resolvedTheme === 'dark' ? (
                <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-b border-slate-200 bg-white dark:border-white/[0.07] dark:bg-[#080B12] p-4 space-y-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium ${
                    isActive
                      ? 'bg-brand-purple text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.04]'
                  }`
                }
              >
                <div className="flex items-center gap-2">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              </NavLink>
            ))}
          </div>
        )}

        {/* Page Content Viewport */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <RealtimeSyncToast lastEvent={lastEvent} />
    </div>
  );
}
