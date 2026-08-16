import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRepositories, getRepositoryDetail, syncRepositories, Repository } from '../api/repositories';

const LANGUAGE_COLORS: Record<string, string> = {
  Python: 'bg-blue-500',
  TypeScript: 'bg-sky-500',
  JavaScript: 'bg-amber-500',
  HTML: 'bg-orange-500',
  CSS: 'bg-indigo-500',
  Rust: 'bg-amber-600',
  Go: 'bg-cyan-500',
  Java: 'bg-red-500',
  'C++': 'bg-pink-500',
  C: 'bg-slate-500',
  PHP: 'bg-violet-500',
  Ruby: 'bg-rose-500',
  Shell: 'bg-emerald-500',
};

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function RepositoryDetailModal({
  repoId,
  onClose,
}: {
  repoId: number;
  onClose: () => void;
}) {
  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['repository-detail', repoId],
    queryFn: () => getRepositoryDetail(repoId),
  });

  const [copied, setCopied] = useState(false);

  const handleCopyClone = () => {
    if (!detail) return;
    navigator.clipboard.writeText(detail.clone_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-2xl overflow-hidden transition-colors duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 p-6 bg-slate-50 dark:bg-slate-900/90">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {detail ? detail.full_name : 'Loading repository...'}
              </h2>
              {detail && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                    detail.is_private
                      ? 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/60 dark:text-blue-300'
                  }`}
                >
                  {detail.is_private ? 'Private' : 'Public'}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              {detail?.description || 'No description provided.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading && (
            <div className="flex h-64 items-center justify-center">
              <p className="text-slate-500 dark:text-slate-400 animate-pulse font-medium">Fetching repository metrics and commits...</p>
            </div>
          )}

          {isError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 p-6 text-center dark:text-rose-400">
              Failed to load repository details. Please try syncing again.
            </div>
          )}

          {detail && (
            <>
              {/* Clone Command Bar */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/90 px-4 py-3">
                <div className="flex items-center gap-2 overflow-hidden text-xs font-mono text-slate-700 dark:text-slate-300">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold select-none">git clone</span>
                  <span className="truncate">{detail.clone_url}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyClone}
                    className="rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 dark:border-transparent dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-medium dark:text-slate-200 transition shrink-0"
                  >
                    {copied ? '✓ Copied!' : 'Copy Clone URL'}
                  </button>
                  <a
                    href={detail.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition shrink-0"
                  >
                    View on GitHub ↗
                  </a>
                </div>
              </div>

              {/* Top Score Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50 p-3.5 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Health Score</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {detail.metrics.health_score}
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">/100</span>
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50 p-3.5 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Activity Score</p>
                  <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {detail.metrics.activity_score}
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">/100</span>
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50 p-3.5 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Merge Rate</p>
                  <p className="mt-1 text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {detail.metrics.merge_rate}
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">%</span>
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50 p-3.5 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Issue Resolution</p>
                  <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {detail.metrics.issue_resolution_rate}
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">%</span>
                  </p>
                </div>
              </div>

              {/* Summary Stats Grid */}
              <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/30 p-4">
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Total Commits</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-200">{detail.total_commits}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Pull Requests</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-200">
                    {detail.open_prs} <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">open</span> /{' '}
                    {detail.merged_prs} <span className="text-xs font-normal text-purple-600 dark:text-purple-400">merged</span>
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Issues</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-200">
                    {detail.open_issues} <span className="text-xs font-normal text-amber-600 dark:text-amber-400">open</span> /{' '}
                    {detail.closed_issues} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">closed</span>
                  </p>
                </div>
              </div>

              {/* Language Breakdown */}
              {detail.languages.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 p-4">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300 mb-3">Languages</h3>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    {detail.languages.map(l => (
                      <div
                        key={l.name}
                        title={`${l.name}: ${l.percent}%`}
                        className={`${LANGUAGE_COLORS[l.name] || 'bg-blue-500'} transition-all`}
                        style={{ width: `${l.percent}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">
                    {detail.languages.map(l => (
                      <div key={l.name} className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${LANGUAGE_COLORS[l.name] || 'bg-blue-500'}`} />
                        <span className="font-medium text-slate-800 dark:text-slate-300">{l.name}</span>
                        <span>{l.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Contributors */}
              {detail.top_contributors.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 p-4">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300 mb-3">Top Contributors</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {detail.top_contributors.map(c => (
                      <div
                        key={c.login}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate">@{c.login}</span>
                        <span className="text-slate-500 dark:text-slate-400 font-mono">{c.contributions} commits</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Commits Feed */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 p-4">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300 mb-3">Recent Commits</h3>
                {detail.recent_commits.length > 0 ? (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800/60">
                    {detail.recent_commits.map(c => (
                      <div key={c.sha} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 dark:text-slate-200 truncate">{c.message}</p>
                          <div className="mt-1 flex items-center gap-2 text-slate-500 dark:text-slate-400">
                            <span>@{c.author_login || 'unknown'}</span>
                            <span>·</span>
                            <span className="font-mono text-slate-500 dark:text-slate-400">{c.sha.slice(0, 7)}</span>
                          </div>
                        </div>
                        <span className="shrink-0 text-slate-500 dark:text-slate-400">{formatRelativeTime(c.committed_at)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No recent commits recorded.</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-4 py-2 text-sm font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function RepositoriesPage() {
  const queryClient = useQueryClient();
  const repos = useQuery({ queryKey: ['repositories'], queryFn: getRepositories });
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);

  // Filters and Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'stars' | 'name' | 'name_desc'>('updated');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const sync = useMutation({
    mutationFn: syncRepositories,
    onSuccess: () =>
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['repositories'] });
        queryClient.invalidateQueries({ queryKey: ['developer'] });
        queryClient.invalidateQueries({ queryKey: ['history'] });
        queryClient.invalidateQueries({ queryKey: ['repo-metrics'] });
      }, 1500),
  });

  const rawData: Repository[] = repos.data ?? [];

  // Extract unique languages for filter pills
  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    rawData.forEach(r => {
      if (r.language) langs.add(r.language);
    });
    return Array.from(langs).sort();
  }, [rawData]);

  // Filtered & Sorted Repositories
  const filteredRepos = useMemo(() => {
    return rawData
      .filter(repo => {
        const matchesSearch =
          repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesLanguage =
          selectedLanguage === 'all' || (repo.language && repo.language.toLowerCase() === selectedLanguage.toLowerCase());
        const matchesVisibility =
          visibilityFilter === 'all' ||
          (visibilityFilter === 'private' ? repo.is_private : !repo.is_private);
        return matchesSearch && matchesLanguage && matchesVisibility;
      })
      .sort((a, b) => {
        if (sortBy === 'stars') return b.stars - a.stars;
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
        // Default: updated date
        const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return dateB - dateA;
      });
  }, [rawData, searchQuery, selectedLanguage, visibilityFilter, sortBy]);

  // Overall Statistics
  const totalStars = useMemo(() => rawData.reduce((acc, r) => acc + r.stars, 0), [rawData]);
  const privateCount = useMemo(() => rawData.filter(r => r.is_private).length, [rawData]);
  const publicCount = rawData.length - privateCount;

  if (repos.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-500 dark:text-slate-400 animate-pulse font-medium">Loading synced repositories…</p>
      </div>
    );
  }

  if (repos.isError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400 p-8 text-center">
        <p className="font-medium">Could not load repositories. Please check connection.</p>
        <button
          onClick={() => repos.refetch()}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Sync Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Repositories</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Explore and inspect codebases synchronized from GitHub.</p>
        </div>
        <button
          disabled={sync.isPending}
          onClick={() => sync.mutate()}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
        >
          {sync.isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Syncing GitHub…
            </>
          ) : (
            'Sync GitHub'
          )}
        </button>
      </div>

      {/* Overview Stat Cards */}
      {rawData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800/90 dark:bg-slate-900/80 p-4 shadow-xs backdrop-blur transition-colors duration-200">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Repositories</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{rawData.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800/90 dark:bg-slate-900/80 p-4 shadow-xs backdrop-blur transition-colors duration-200">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Stars</p>
            <p className="mt-1 text-2xl font-bold text-amber-500 dark:text-amber-400">★ {totalStars}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800/90 dark:bg-slate-900/80 p-4 shadow-xs backdrop-blur transition-colors duration-200">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Public / Private</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {publicCount} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">pub</span> / {privateCount}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">priv</span>
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800/90 dark:bg-slate-900/80 p-4 shadow-xs backdrop-blur transition-colors duration-200">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Languages Used</p>
            <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{availableLanguages.length || 1}</p>
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800/90 dark:bg-slate-900/80 p-4 shadow-xs backdrop-blur space-y-4 transition-colors duration-200">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search Bar */}
          <div className="relative w-full md:w-96">
            <input
              type="text"
              placeholder="Search repositories by name or topic..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
            {/* Visibility Toggle */}
            <div className="flex rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950 p-0.5 text-xs">
              {(['all', 'public', 'private'] as const).map(vis => (
                <button
                  key={vis}
                  onClick={() => setVisibilityFilter(vis)}
                  className={`rounded-md px-3 py-1.5 font-medium capitalize transition ${
                    visibilityFilter === vis
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {vis}
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="rounded-lg border border-slate-300 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:outline-none transition"
            >
              <option value="updated">Recently Updated</option>
              <option value="stars">Most Stars</option>
              <option value="name">Name (A–Z)</option>
              <option value="name_desc">Name (Z–A)</option>
            </select>

            {/* Grid / List View Toggle */}
            <div className="flex rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950 p-0.5 text-xs">
              <button
                onClick={() => setViewMode('grid')}
                title="Grid View"
                className={`rounded-md px-2.5 py-1.5 transition ${
                  viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white font-medium' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                ⊞ Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List View"
                className={`rounded-md px-2.5 py-1.5 transition ${
                  viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white font-medium' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                ☰ List
              </button>
            </div>
          </div>
        </div>

        {/* Language Filter Pills */}
        {availableLanguages.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800/60">
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-2 font-medium">Language:</span>
            <button
              onClick={() => setSelectedLanguage('all')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                selectedLanguage === 'all'
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200'
              }`}
            >
              All ({rawData.length})
            </button>
            {availableLanguages.map(lang => {
              const count = rawData.filter(r => r.language === lang).length;
              const isSelected = selectedLanguage.toLowerCase() === lang.toLowerCase();
              return (
                <button
                  key={lang}
                  onClick={() => setSelectedLanguage(isSelected ? 'all' : lang)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                    isSelected
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${LANGUAGE_COLORS[lang] || 'bg-blue-400'}`} />
                  <span>{lang}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Repositories Display */}
      {filteredRepos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center">
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {rawData.length === 0
              ? 'No repositories synchronized yet. Click "Sync GitHub" to pull your repositories.'
              : 'No repositories match your current filter criteria.'}
          </p>
          {rawData.length > 0 && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedLanguage('all');
                setVisibilityFilter('all');
              }}
              className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Reset all filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Card Grid View */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRepos.map(repo => (
            <div
              key={repo.id}
              onClick={() => setSelectedRepoId(repo.id)}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white dark:border-slate-800/90 dark:bg-slate-900/80 p-5 shadow-xs backdrop-blur transition hover:border-slate-300 hover:shadow-md dark:hover:border-slate-700 dark:hover:bg-slate-900 cursor-pointer"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition truncate text-base">
                    {repo.name}
                  </h2>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
                      repo.is_private
                        ? 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-400'
                        : 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                    }`}
                  >
                    {repo.is_private ? 'Private' : 'Public'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 min-h-[32px]">
                  {repo.description ?? 'No description provided.'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-3">
                  {repo.language ? (
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${LANGUAGE_COLORS[repo.language] || 'bg-blue-400'}`} />
                      <span className="font-medium text-slate-700 dark:text-slate-300">{repo.language}</span>
                    </div>
                  ) : (
                    <span>—</span>
                  )}
                  <span>★ {repo.stars}</span>
                </div>
                <span className="text-[11px]">{formatRelativeTime(repo.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table / List View */
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800/90 dark:bg-slate-900/80 overflow-hidden shadow-xs backdrop-blur transition-colors duration-200">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400 font-medium">
              <tr>
                <th className="px-5 py-3.5">Repository</th>
                <th className="px-4 py-3.5">Visibility</th>
                <th className="px-4 py-3.5">Language</th>
                <th className="px-4 py-3.5">Stars</th>
                <th className="px-4 py-3.5">Last Updated</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredRepos.map(repo => (
                <tr
                  key={repo.id}
                  onClick={() => setSelectedRepoId(repo.id)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer"
                >
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-slate-200">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400">{repo.full_name}</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-md">{repo.description ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        repo.is_private
                          ? 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-400'
                          : 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                      }`}
                    >
                      {repo.is_private ? 'Private' : 'Public'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {repo.language ? (
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${LANGUAGE_COLORS[repo.language] || 'bg-blue-400'}`} />
                        <span>{repo.language}</span>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-amber-500 dark:text-amber-400 font-mono">★ {repo.stars}</td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">{formatRelativeTime(repo.updated_at)}</td>
                  <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedRepoId(repo.id)}
                      className="rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 dark:border-transparent dark:bg-slate-800 dark:hover:bg-slate-700 px-2.5 py-1 text-xs font-medium dark:text-slate-200 transition mr-2"
                    >
                      Inspect
                    </button>
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      GitHub ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Slide-Over Modal */}
      {selectedRepoId !== null && (
        <RepositoryDetailModal repoId={selectedRepoId} onClose={() => setSelectedRepoId(null)} />
      )}
    </div>
  );
}
