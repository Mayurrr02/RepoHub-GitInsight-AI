import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getRepositories,
  getRepositoryDetail,
  syncRepositories,
  Repository,
} from '../api/repositories';
import { getRepoMetrics } from '../api/analytics';
import { getHealthTier } from '../components/ui/HealthScoreBadge';
import { EmptyState } from '../components/ui/EmptyState';
import {
  RepositoriesIcon,
  StarIcon,
  SearchIcon,
  SyncIcon,
  CodeBracketIcon,
  PullRequestIcon,
  IssueIcon,
} from '../components/icons/Icons';

function RepositoryDetailModal({
  repoId,
  onClose,
}: {
  repoId: number;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'commits' | 'prs' | 'issues' | 'contributors' | 'languages'>('overview');
  const [copied, setCopied] = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['repository-detail', repoId],
    queryFn: () => getRepositoryDetail(repoId),
  });

  const handleCopyClone = () => {
    if (!detail) return;
    navigator.clipboard.writeText(detail.clone_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tier = detail ? getHealthTier(detail.metrics.health_score) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in">
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-white/[0.08] p-6 bg-slate-50 dark:bg-[#080B12]">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {detail ? detail.full_name : 'Repository Inspection'}
              </h2>
              {detail && (
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    detail.is_private
                      ? 'border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'border border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-950/60 dark:text-blue-300'
                  }`}
                >
                  {detail.is_private ? 'Private' : 'Public'}
                </span>
              )}
              {tier && (
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase border ${tier.badgeClass}`}>
                  {tier.label}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {detail?.description || 'Synchronized GitHub repository metadata and health analytics.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Sub-Navigation Tabs inside Modal */}
        <div className="flex items-center gap-6 px-6 pt-3 border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#080B12] text-xs font-medium text-slate-500 dark:text-slate-400 select-none">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'commits', label: 'Recent Commits' },
            { key: 'contributors', label: 'Contributors' },
            { key: 'languages', label: 'Languages' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`pb-2.5 transition relative cursor-pointer ${
                activeTab === tab.key ? 'text-slate-900 dark:text-white font-semibold' : 'hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-purple rounded-full shadow-glow-purple" />
              )}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isLoading && (
            <div className="flex h-48 items-center justify-center">
              <p className="text-slate-400 animate-pulse text-xs">Fetching repository metrics...</p>
            </div>
          )}

          {detail && (
            <>
              {/* Clone Bar */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] px-4 py-2.5">
                <div className="flex items-center gap-2 overflow-hidden text-xs font-mono text-slate-700 dark:text-slate-300">
                  <span className="text-brand-purple font-semibold">git clone</span>
                  <span className="truncate">{detail.clone_url}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleCopyClone}
                    className="rounded-lg border border-slate-200 bg-white hover:bg-slate-100 dark:border-white/[0.08] dark:bg-[#121724] dark:hover:bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition cursor-pointer"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                  <a
                    href={detail.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-brand-purple hover:bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition"
                  >
                    GitHub ↗
                  </a>
                </div>
              </div>

              {/* Tab 1: Overview */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {/* Score Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3.5 text-center">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Health Score</p>
                      <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        {detail.metrics.health_score}
                        <span className="text-xs text-slate-400 font-normal">/100</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3.5 text-center">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Activity Score</p>
                      <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono">
                        {detail.metrics.activity_score}
                        <span className="text-xs text-slate-400 font-normal">/100</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3.5 text-center">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Merge Rate</p>
                      <p className="mt-1 text-2xl font-bold text-purple-600 dark:text-purple-400 font-mono">
                        {detail.metrics.merge_rate}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3.5 text-center">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Issue Resolution</p>
                      <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
                        {detail.metrics.issue_resolution_rate}%
                      </p>
                    </div>
                  </div>

                  {/* Summary Counters */}
                  <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Total Commits</span>
                      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white font-mono">{detail.total_commits}</p>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Pull Requests</span>
                      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white font-mono">
                        {detail.open_prs} <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">open</span> /{' '}
                        {detail.merged_prs} <span className="text-xs font-normal text-purple-600 dark:text-purple-400">merged</span>
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Issues</span>
                      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white font-mono">
                        {detail.open_issues} <span className="text-xs font-normal text-amber-600 dark:text-amber-400">open</span> /{' '}
                        {detail.closed_issues} <span className="text-xs font-normal text-slate-400">closed</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Recent Commits */}
              {activeTab === 'commits' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">Recent Commit Stream</h3>
                  {detail.recent_commits.length > 0 ? (
                    <div className="divide-y divide-slate-200 dark:divide-white/[0.04] text-xs">
                      {detail.recent_commits.map((c) => (
                        <div key={c.sha} className="py-2.5 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white truncate">{c.message}</p>
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                              @{c.author_login || 'developer'} · {c.sha.slice(0, 7)}
                            </p>
                          </div>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 font-mono">
                            {c.committed_at ? new Date(c.committed_at).toLocaleDateString() : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-3">No commits recorded yet.</p>
                  )}
                </div>
              )}

              {/* Tab 3: Contributors */}
              {activeTab === 'contributors' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {detail.top_contributors.map((c) => (
                    <div key={c.login} className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3 text-xs flex justify-between items-center">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">@{c.login}</span>
                      <span className="font-mono text-brand-purple">{c.contributions} commits</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 4: Languages */}
              {activeTab === 'languages' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4 space-y-3">
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[#182030]">
                    {detail.languages.map((l) => (
                      <div
                        key={l.name}
                        className="bg-brand-purple"
                        style={{ width: `${l.percent}%` }}
                        title={`${l.name}: ${l.percent}%`}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {detail.languages.map((l) => (
                      <div key={l.name} className="flex justify-between text-slate-700 dark:text-slate-300">
                        <span>{l.name}</span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">{l.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-white/[0.08] p-4 bg-slate-50 dark:bg-[#080B12] flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 dark:border-white/[0.08] dark:bg-[#121724] dark:hover:bg-white/[0.08] dark:text-slate-200 px-4 py-2 text-xs font-medium transition cursor-pointer"
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
  const reposQuery = useQuery({ queryKey: ['repositories'], queryFn: getRepositories });
  const metricsQuery = useQuery({ queryKey: ['repo-metrics'], queryFn: getRepoMetrics });
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [sortBy, setSortBy] = useState<'stars' | 'name' | 'health'>('stars');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const sync = useMutation({
    mutationFn: syncRepositories,
    onSuccess: () =>
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['repositories'] });
        queryClient.invalidateQueries({ queryKey: ['developer'] });
        queryClient.invalidateQueries({ queryKey: ['history'] });
        queryClient.invalidateQueries({ queryKey: ['repo-metrics'] });
      }, 1200),
  });

  const metricsMap = useMemo(() => {
    const map = new Map<number, number>();
    if (metricsQuery.data) {
      metricsQuery.data.forEach((m) => map.set(m.repository_id, m.health_score));
    }
    return map;
  }, [metricsQuery.data]);

  const rawData: (Repository & { health: number })[] = useMemo(() => {
    if (reposQuery.data) {
      return reposQuery.data.map((r) => ({
        ...r,
        health: metricsMap.get(r.id) || 80,
      }));
    }
    return [];
  }, [reposQuery.data, metricsMap]);

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    rawData.forEach((r) => {
      if (r.language) langs.add(r.language);
    });
    return Array.from(langs);
  }, [rawData]);

  const filteredRepos = useMemo(() => {
    return rawData
      .filter((repo) => {
        const matchesSearch =
          repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesLanguage =
          selectedLanguage === 'all' ||
          (repo.language && repo.language.toLowerCase() === selectedLanguage.toLowerCase());
        const matchesVisibility =
          visibilityFilter === 'all' ||
          (visibilityFilter === 'private' ? repo.is_private : !repo.is_private);
        return matchesSearch && matchesLanguage && matchesVisibility;
      })
      .sort((a, b) => {
        if (sortBy === 'health') return b.health - a.health;
        if (sortBy === 'stars') return b.stars - a.stars;
        return a.name.localeCompare(b.name);
      });
  }, [rawData, searchQuery, selectedLanguage, visibilityFilter, sortBy]);

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Repositories</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Monitor the health and activity of all your connected repositories.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
            className="flex items-center gap-2 rounded-xl bg-brand-purple hover:bg-purple-600 disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold shadow-glow-purple transition cursor-pointer"
          >
            <SyncIcon className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
            <span>{sync.isPending ? 'Syncing...' : 'Sync GitHub'}</span>
          </button>
        </div>
      </div>

      {/* Main Repositories Container */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-5 shadow-card-light dark:shadow-card-dark space-y-4 transition-colors">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <SearchIcon className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] pl-10 pr-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-purple focus:outline-none transition shadow-inner"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:border-brand-purple focus:outline-none cursor-pointer"
            >
              <option value="all">All Languages</option>
              {availableLanguages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:border-brand-purple focus:outline-none cursor-pointer"
            >
              <option value="stars">Most Stars ★</option>
              <option value="health">Health Score</option>
              <option value="name">Name (A-Z)</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-0.5 text-xs">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1.5 rounded-lg transition ${
                  viewMode === 'grid' ? 'bg-brand-purple text-white font-bold' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1.5 rounded-lg transition ${
                  viewMode === 'table' ? 'bg-brand-purple text-white font-bold' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Table
              </button>
            </div>
          </div>
        </div>

        {/* Repositories Display */}
        {reposQuery.isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400 animate-pulse">
            Loading synchronized repositories...
          </div>
        ) : filteredRepos.length === 0 ? (
          <EmptyState
            icon={<RepositoriesIcon className="h-6 w-6 text-brand-purple" />}
            title="No repositories found"
            description={rawData.length === 0 ? 'Sync your GitHub repositories to track health scores and commit velocity.' : 'No repositories match your current filter parameters.'}
            actionText={rawData.length === 0 ? 'Sync GitHub Repositories' : undefined}
            onAction={rawData.length === 0 ? () => sync.mutate() : undefined}
            isLoading={sync.isPending}
          />
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {filteredRepos.map((repo) => {
              const tier = getHealthTier(repo.health);
              return (
                <div
                  key={repo.id}
                  onClick={() => setSelectedRepoId(repo.id)}
                  className="rounded-2xl border border-slate-200 bg-white hover:border-slate-300 dark:border-white/[0.08] dark:bg-[#080B12] p-5 flex flex-col justify-between dark:hover:border-white/20 transition cursor-pointer group shadow-card-light dark:shadow-card-dark"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-brand-purple transition truncate text-sm">
                        {repo.name}
                      </h3>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${tier.badgeClass}`}>
                        {repo.health} · {tier.label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[32px]">
                      {repo.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-3">
                      {repo.language && (
                        <span className="font-mono text-purple-600 dark:text-purple-400">{repo.language}</span>
                      )}
                      <span className="flex items-center gap-1 text-amber-500 dark:text-amber-400 font-mono">
                        <StarIcon className="h-3.5 w-3.5" />
                        {repo.stars}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">Inspect →</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="rounded-xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#080B12] overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] text-slate-500 dark:text-slate-400 font-medium">
                <tr>
                  <th className="px-4 py-3">Repository</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3">Stars</th>
                  <th className="px-4 py-3">Health</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {filteredRepos.map((repo) => {
                  const tier = getHealthTier(repo.health);
                  return (
                    <tr
                      key={repo.id}
                      onClick={() => setSelectedRepoId(repo.id)}
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition cursor-pointer"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white truncate max-w-xs">
                        {repo.full_name}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono">
                        {repo.language || '—'}
                      </td>
                      <td className="px-4 py-3 text-amber-500 dark:text-amber-400 font-mono">★ {repo.stars}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${tier.badgeClass}`}>
                          {repo.health} · {tier.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-brand-purple font-medium">
                        Inspect
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedRepoId !== null && (
        <RepositoryDetailModal
          repoId={selectedRepoId}
          onClose={() => setSelectedRepoId(null)}
        />
      )}
    </div>
  );
}
