import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiKeyCreated,
  ApiKeyItem,
  createApiKey,
  getApiKeys,
  getUserProfile,
  revokeApiKey,
} from '../api/users';
import { useAuth } from '../store/auth';
import { useThemeStore } from '../store/theme';

const SCOPE_DESCRIPTIONS: Record<string, { label: string; description: string; badgeColor: string }> = {
  'repo': {
    label: 'Full Repository Access',
    description: 'Read and write access to code, pull requests, issues, branches, and commit status in public and private repositories.',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800',
  },
  'public_repo': {
    label: 'Public Repositories',
    description: 'Read and write access to public repositories and metadata.',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/80 dark:text-blue-400 dark:border-blue-800',
  },
  'read:user': {
    label: 'User Profile (Read-Only)',
    description: 'Grants read access to profile information, user handle, full name, avatar, and public email.',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/80 dark:text-indigo-400 dark:border-indigo-800',
  },
  'user': {
    label: 'User Profile (Full)',
    description: 'Read and update access to user profile and email addresses.',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/80 dark:text-purple-400 dark:border-purple-800',
  },
  'read:org': {
    label: 'Organization Membership',
    description: 'Read-only access to organization membership, team rosters, and shared repositories.',
    badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/80 dark:text-cyan-400 dark:border-cyan-800',
  },
  'admin:org': {
    label: 'Organization Administration',
    description: 'Manage organization settings, teams, and members.',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/80 dark:text-amber-400 dark:border-amber-800',
  },
};

export function ProfilePage() {
  const queryClient = useQueryClient();
  const logout = useAuth((s) => s.logout);
  const { theme, resolvedTheme, setTheme, toggleTheme } = useThemeStore();

  // Queries
  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['user-profile'],
    queryFn: getUserProfile,
  });

  const { data: apiKeys = [], isLoading: isLoadingKeys } = useQuery({
    queryKey: ['api-keys'],
    queryFn: getApiKeys,
  });

  // State for API Key generation
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [expiryDays, setExpiryDays] = useState<number>(30);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  // Mutations
  const createKeyMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (data) => {
      setNewlyCreatedKey(data);
      setKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      setRevokingId(null);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const handleCreateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;
    createKeyMutation.mutate({
      name: keyName.trim(),
      expires_in_days: expiryDays > 0 ? expiryDays : undefined,
    });
  };

  const handleCopy = (text: string, type: 'key' | 'snippet') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    } else {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2500);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <svg className="h-6 w-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm font-medium">Loading developer profile & connected integrations...</span>
        </div>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-semibold text-base">Could not load developer profile</p>
        <p className="mt-1 text-xs text-red-600 dark:text-red-300">Please check your network connection or re-authenticate.</p>
      </div>
    );
  }

  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Active member';

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Profile Identity Header Card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950 p-6 sm:p-8 shadow-xl transition-colors duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-5">
            <div className="relative shrink-0">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.login}
                  className="h-20 w-20 rounded-2xl border-2 border-slate-200 dark:border-slate-700 shadow-lg object-cover"
                />
              ) : (
                <div className="h-20 w-20 rounded-2xl bg-blue-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                  {profile.login.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span
                className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white dark:border-slate-900 bg-emerald-500"
                title="Connected & Active"
              />
            </div>

            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {profile.name || profile.login}
                </h1>
                <span className="rounded-md bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 px-2.5 py-0.5 text-xs font-mono text-slate-700 dark:text-slate-300">
                  @{profile.login}
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/80 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                  OAuth Connected
                </span>
              </div>

              <div className="mt-2.5 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <svg className="h-4 w-4 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Member since {joinDate}
                </span>
                <span className="flex items-center gap-1 font-mono text-slate-500">
                  User ID: #{profile.id}
                </span>
                {profile.github_account.github_id && (
                  <span className="flex items-center gap-1 font-mono text-slate-500">
                    GitHub ID: {profile.github_account.github_id}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-center">
            <button
              onClick={() => logout()}
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:hover:bg-red-950/60 dark:text-red-300 px-4 py-2.5 text-xs font-medium transition-colors"
            >
              <svg className="h-4 w-4 text-red-500 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Theme & Appearance Section with Quick Switcher Button */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 sm:p-7 shadow-xl space-y-5 transition-colors duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              {resolvedTheme === 'dark' ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Appearance & Theme Settings</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Switch between Light Theme and Dark Theme across the application interface.</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 hidden sm:inline">
              Active: <span className="font-semibold text-slate-900 dark:text-slate-100 capitalize">{resolvedTheme} Theme</span>
            </span>
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              title={`Currently ${resolvedTheme} mode. Click to toggle.`}
            >
              {resolvedTheme === 'dark' ? (
                <>
                  <svg className="h-4 w-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span>Switch to Light Theme</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  <span>Switch to Dark Theme</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3 Theme Mode Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`group relative flex flex-col p-4 rounded-xl border text-left transition-all cursor-pointer ${
              theme === 'light'
                ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/60 dark:bg-blue-950/30'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">☀️</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Light Theme</span>
              </div>
              {theme === 'light' && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">✓</span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Clean white & slate surfaces with high contrast, ideal for well-lit environments.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`group relative flex flex-col p-4 rounded-xl border text-left transition-all cursor-pointer ${
              theme === 'dark'
                ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/60 dark:bg-blue-950/30'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🌙</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Dark Theme</span>
              </div>
              {theme === 'dark' && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">✓</span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Deep slate-950 contrast with vibrant accents, easy on the eyes in low light.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setTheme('system')}
            className={`group relative flex flex-col p-4 rounded-xl border text-left transition-all cursor-pointer ${
              theme === 'system'
                ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/60 dark:bg-blue-950/30'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">💻</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">System Auto</span>
              </div>
              {theme === 'system' && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">✓</span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Synchronizes automatically with your system's light or dark mode preferences.
            </p>
          </button>
        </div>
      </div>

      {/* 3. Engineering Footprint Overview Stat Cards */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Engineering Footprint & Synced Assets
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80 p-4 shadow-sm transition-colors duration-200">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium">Connected Repositories</span>
              <svg className="h-5 w-5 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{profile.stats.total_repositories}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                ({profile.stats.public_repositories} public, {profile.stats.private_repositories} private)
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80 p-4 shadow-sm transition-colors duration-200">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium">Lifetime Commits Tracked</span>
              <svg className="h-5 w-5 text-emerald-500 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{profile.stats.total_commits.toLocaleString()}</span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">across repositories</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80 p-4 shadow-sm transition-colors duration-200">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium">Synced Organizations</span>
              <svg className="h-5 w-5 text-purple-500 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{profile.stats.total_organizations}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">teams & orgs</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80 p-4 shadow-sm transition-colors duration-200">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium">Coding Streak & Reviews</span>
              <svg className="h-5 w-5 text-amber-500 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{profile.stats.coding_streak}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">days active • {profile.stats.review_score}/100 review</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. GitHub OAuth Scope Inspector */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 sm:p-7 shadow-xl space-y-5 transition-colors duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">
              <svg className="h-5 w-5 text-slate-700 dark:text-slate-200" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">GitHub OAuth Token Scope Inspector</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Permissions granted to RepoHub for analytics & synchronization</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-400 px-3 py-1 text-xs font-medium">
              Active Scope Grant
            </span>
          </div>
        </div>

        {profile.github_account.scopes_list.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 p-4 text-xs text-slate-500 dark:text-slate-400">
            No custom OAuth scopes detected. Running with basic public profile access.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {profile.github_account.scopes_list.map((sc) => {
              const info = SCOPE_DESCRIPTIONS[sc] || {
                label: `Scope: ${sc}`,
                description: `Granted authorization for the GitHub API permission: "${sc}".`,
                badgeColor: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
              };

              return (
                <div key={sc} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-800/80 dark:bg-slate-950/60 p-4 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      {info.label}
                    </span>
                    <span className={`font-mono text-[10px] px-2 py-0.5 rounded-md border ${info.badgeColor}`}>
                      {sc}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {info.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/40 p-3.5 flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300">
          <svg className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="leading-relaxed">
            <span className="font-semibold text-slate-900 dark:text-white">OAuth Security Notice:</span> RepoHub only reads commit metadata, PR timestamps, and issue health scores. We never modify your source code or write to your repositories.
          </div>
        </div>
      </div>

      {/* 5. Personal API Key (PAT) Generator & Management */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 sm:p-7 shadow-xl space-y-6 transition-colors duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-md shadow-blue-500/20 text-white">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Personal API Keys (PAT)</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Generate long-lived API keys for CI/CD pipelines, custom monitoring bots, and CLI scripts.
            </p>
          </div>

          <button
            onClick={() => {
              setShowCreateModal(true);
              setNewlyCreatedKey(null);
            }}
            className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-medium text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer self-start sm:self-center"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>Generate New API Key</span>
          </button>
        </div>

        {/* Modal / Generator Form */}
        {showCreateModal && (
          <div className="rounded-xl border border-blue-500/30 bg-slate-50 dark:bg-slate-950 p-5 shadow-2xl space-y-4 animate-in fade-in transition-colors duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Create Personal API Key</h4>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            {!newlyCreatedKey ? (
              <form onSubmit={handleCreateKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Key Name / Description</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GitHub Actions Sync Bot, Local CLI Script"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Expiration</label>
                  <select
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value={30}>30 Days</option>
                    <option value={90}>90 Days</option>
                    <option value={365}>1 Year</option>
                    <option value={0}>No Expiration (Permanent)</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300 px-4 py-2 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createKeyMutation.isPending || !keyName.trim()}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-xs font-medium text-white shadow-md shadow-blue-500/20"
                  >
                    {createKeyMutation.isPending ? 'Generating...' : 'Generate Token'}
                  </button>
                </div>
              </form>
            ) : (
              /* One-time secret display */
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/40 p-4 text-xs text-amber-900 dark:text-amber-200">
                  <span className="font-bold block text-amber-800 dark:text-amber-300 mb-1">⚠️ Security Warning:</span>
                  Make sure to copy your API key now. You will not be able to view it again!
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Your New API Key</label>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-2.5 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    <span className="flex-1 select-all break-all">{newlyCreatedKey.raw_key}</span>
                    <button
                      onClick={() => handleCopy(newlyCreatedKey.raw_key, 'key')}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-sans font-medium text-white transition-all shadow-sm shrink-0"
                    >
                      {copiedKey ? '✓ Copied!' : 'Copy Key'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewlyCreatedKey(null);
                    }}
                    className="rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-medium text-white"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Existing Keys List */}
        {isLoadingKeys ? (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">Loading API keys...</div>
        ) : apiKeys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40 p-8 text-center">
            <svg className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <p className="text-xs text-slate-600 dark:text-slate-400">No Personal API Keys generated yet.</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Create one to authenticate external CLI scripts or automation pipelines.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 font-semibold text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">Key Name</th>
                  <th className="py-3 px-4">Prefix</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 bg-white dark:bg-slate-950/20 text-slate-700 dark:text-slate-300">
                {apiKeys.map((k: ApiKeyItem) => (
                  <tr key={k.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{k.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">{k.prefix}</td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to revoke "${k.name}"? This action cannot be undone.`)) {
                            setRevokingId(k.id);
                            revokeKeyMutation.mutate(k.id);
                          }
                        }}
                        disabled={revokingId === k.id}
                        className="text-xs text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 transition-colors"
                      >
                        {revokingId === k.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 6. CLI & Webhook Usage Guide */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800/80 dark:bg-slate-950 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">CLI & Pipeline Integration Snippet</span>
            <button
              onClick={() => handleCopy(`curl -H "Authorization: Bearer rh_live_YOUR_TOKEN" https://repohub-api.onrender.com/api/v1/analytics/developer`, 'snippet')}
              className="text-[11px] text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors font-medium"
            >
              {copiedSnippet ? '✓ Copied' : 'Copy cURL'}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-200">
            <code>
              {`# Fetch developer analytics using your Personal Access Token:\ncurl -X GET "https://repohub-api.onrender.com/api/v1/analytics/developer" \\\n     -H "Authorization: Bearer rh_live_YOUR_API_KEY"`}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
