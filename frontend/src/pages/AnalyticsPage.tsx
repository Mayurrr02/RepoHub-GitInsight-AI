import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDeveloper, getHistory, getRepoMetrics } from '../api/analytics';
import { getRepositories, syncRepositories } from '../api/repositories';
import { AreaCommitChart } from '../components/charts/AreaCommitChart';
import { SyncIcon } from '../components/icons/Icons';

export function AnalyticsPage() {
  const queryClient = useQueryClient();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState<'overview' | 'commits' | 'prs' | 'issues' | 'contributors'>('overview');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['overview', 'commits', 'prs', 'issues', 'contributors'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [location.search]);

  const devQuery = useQuery({ queryKey: ['developer'], queryFn: getDeveloper });
  const historyQuery = useQuery({ queryKey: ['history'], queryFn: () => getHistory() });
  const repoMetricsQuery = useQuery({ queryKey: ['repo-metrics'], queryFn: getRepoMetrics });
  const reposQuery = useQuery({ queryKey: ['repositories'], queryFn: getRepositories });

  const sync = useMutation({
    mutationFn: syncRepositories,
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['developer'] });
        queryClient.invalidateQueries({ queryKey: ['history'] });
        queryClient.invalidateQueries({ queryKey: ['repo-metrics'] });
        queryClient.invalidateQueries({ queryKey: ['repositories'] });
      }, 1200);
    },
  });

  const historyCommits = historyQuery.data?.commits || [];
  const reposList = reposQuery.data || [];
  const metricsList = repoMetricsQuery.data || [];
  const devData = devQuery.data;

  const totalCommitsCount = React.useMemo(() => {
    return historyCommits.reduce((acc, curr) => acc + curr.commits, 0);
  }, [historyCommits]);

  const avgMergeRate = React.useMemo(() => {
    if (metricsList.length > 0) {
      const sum = metricsList.reduce((acc, m) => acc + (m.merge_rate || 0), 0);
      return Math.round((sum / metricsList.length) * 10) / 10;
    }
    return 0;
  }, [metricsList]);

  const avgIssueRate = React.useMemo(() => {
    if (metricsList.length > 0) {
      const sum = metricsList.reduce((acc, m) => acc + (m.issue_resolution_rate || 0), 0);
      return Math.round((sum / metricsList.length) * 10) / 10;
    }
    return 0;
  }, [metricsList]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Engineering Analytics
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time GitHub commit telemetry, author velocity, and review participation
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
            className="flex items-center gap-2 rounded-xl bg-brand-purple hover:bg-purple-600 disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold shadow-glow-purple transition cursor-pointer"
          >
            <SyncIcon className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
            <span>{sync.isPending ? 'Syncing...' : 'Refresh Telemetry'}</span>
          </button>
        </div>
      </div>

      {/* Main Analytics Container */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-6 shadow-card-light dark:shadow-card-dark space-y-6 transition-colors">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-6 border-b border-slate-200 dark:border-white/[0.06] pb-3 overflow-x-auto select-none">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'commits', label: 'Commits Over Time' },
            { key: 'prs', label: 'Pull Requests' },
            { key: 'issues', label: 'Issues & Bugs' },
            { key: 'contributors', label: 'Contributors' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`text-xs font-semibold transition relative pb-2 whitespace-nowrap cursor-pointer ${
                activeTab === tab.key
                  ? 'text-brand-purple dark:text-white font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-purple rounded-full shadow-glow-purple" />
              )}
            </button>
          ))}
        </div>

        {/* Tab 1: Overview & Commits Chart */}
        {(activeTab === 'overview' || activeTab === 'commits') && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Commits Over Time</h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">Last 90 Days</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.06] dark:bg-[#080B12] p-4 transition-colors">
                <AreaCommitChart data={historyCommits} height={200} />
              </div>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4 transition-colors">
                <span className="text-xs text-slate-500 dark:text-slate-400">Total Commits</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                  {totalCommitsCount.toLocaleString()}
                </p>
                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 mt-1 inline-block">
                  Synced commits
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4 transition-colors">
                <span className="text-xs text-slate-500 dark:text-slate-400">Repositories</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">{reposList.length}</p>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1 inline-block">
                  Active codebases
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4 transition-colors">
                <span className="text-xs text-slate-500 dark:text-slate-400">Coding Streak</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                  {devData?.coding_streak || 0}
                </p>
                <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mt-1 inline-block">
                  Consecutive days
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4 transition-colors">
                <span className="text-xs text-slate-500 dark:text-slate-400">Review Score</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                  {devData?.review_score || 0}
                </p>
                <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400 mt-1 inline-block">
                  / 100 Index
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Pull Requests */}
        {activeTab === 'prs' && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Pull Request Velocity & Merge Rates</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Average PR Merge Rate</span>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1 font-mono">
                  {avgMergeRate}%
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Across all synced repositories</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Monitored Repositories</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                  {reposList.length}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Synced with GitHub webhooks</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Review Turnaround Index</span>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                  {devData?.review_score || 0}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Peer review participation</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Issues */}
        {activeTab === 'issues' && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Issue Resolution Velocity</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Average Issue Resolution Rate</span>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 font-mono">
                  {avgIssueRate}%
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Issue closure rate</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Tracked Repositories</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                  {reposList.length}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Synchronized issues & bugs</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Contributors */}
        {activeTab === 'contributors' && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Top Active Contributors</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {metricsList.map((m) => (
                <div key={m.repository_id} className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3.5 flex items-center justify-between">
                  <div className="truncate mr-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{m.name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Health: {m.health_score}/100</p>
                  </div>
                  <div className="text-right font-mono text-xs shrink-0">
                    <span className="text-brand-purple font-bold">{m.activity_score} Activity</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
