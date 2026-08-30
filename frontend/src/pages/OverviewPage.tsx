import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDeveloper, getHistory, getRepoMetrics } from '../api/analytics';
import { getRepositories, syncRepositories, getMe } from '../api/repositories';
import { Sparkline } from '../components/charts/Sparkline';
import { ContributionHeatmap } from '../components/charts/ContributionHeatmap';
import { LanguageDonutChart } from '../components/charts/LanguageDonutChart';
import { CardSkeleton } from '../components/ui/LoadingSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { getHealthTier } from '../components/ui/HealthScoreBadge';
import {
  FlameIcon,
  ClockIcon,
  CalendarIcon,
  StarIcon,
  SparklesIcon,
  ArrowRightIcon,
  RepositoriesIcon,
  SyncIcon,
} from '../components/icons/Icons';

export function OverviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [timeframe, setTimeframe] = useState('90');

  // Fetch real queries
  const userQuery = useQuery({ queryKey: ['me'], queryFn: getMe });
  const devQuery = useQuery({ queryKey: ['developer'], queryFn: getDeveloper });
  const historyQuery = useQuery({
    queryKey: ['history', timeframe],
    queryFn: () => getHistory(),
  });
  const repoMetricsQuery = useQuery({ queryKey: ['repo-metrics'], queryFn: getRepoMetrics });
  const reposQuery = useQuery({ queryKey: ['repositories'], queryFn: getRepositories });

  // Sync Mutation
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

  const userName = userQuery.data?.name || userQuery.data?.login || 'Developer';
  const devData = devQuery.data;
  const repos = reposQuery.data || [];
  const metricsList = repoMetricsQuery.data || [];
  const historyCommits = historyQuery.data?.commits || [];

  // Real aggregate calculations
  const totalCommitsCount = React.useMemo(() => {
    return historyCommits.reduce((acc, curr) => acc + curr.commits, 0);
  }, [historyCommits]);

  const avgHealthScore = React.useMemo(() => {
    if (metricsList.length > 0) {
      const sum = metricsList.reduce((acc, m) => acc + (m.health_score || 0), 0);
      return Math.round(sum / metricsList.length);
    }
    return devData?.review_score || 0;
  }, [metricsList, devData]);

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

  const commitSparkline = React.useMemo(() => {
    if (historyCommits.length >= 2) {
      const chunkSize = Math.max(1, Math.floor(historyCommits.length / 8));
      const points: number[] = [];
      for (let i = 0; i < historyCommits.length; i += chunkSize) {
        const slice = historyCommits.slice(i, i + chunkSize);
        points.push(slice.reduce((a, b) => a + b.commits, 0));
      }
      return points.length >= 2 ? points : [0, totalCommitsCount];
    }
    return [0, totalCommitsCount];
  }, [historyCommits, totalCommitsCount]);

  const topReposHealth = React.useMemo(() => {
    if (metricsList.length > 0) {
      return [...metricsList]
        .sort((a, b) => b.health_score - a.health_score)
        .slice(0, 5)
        .map((m) => ({
          id: m.repository_id,
          name: m.name,
          score: Math.round(m.health_score),
          tier: getHealthTier(m.health_score),
        }));
    }
    return [];
  }, [metricsList]);

  const languagesData = React.useMemo(() => {
    if (devData?.languages && devData.languages.length > 0) {
      const palette = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#64748B'];
      return devData.languages.map((l, i) => ({
        name: l.name,
        percent: l.percent,
        color: palette[i % palette.length],
      }));
    }
    return [];
  }, [devData]);

  const scoreTier = getHealthTier(avgHealthScore);
  const isLoading = userQuery.isLoading || reposQuery.isLoading || devQuery.isLoading;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            Welcome back, {userName} <span className="inline-block">👋</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Here's what's happening across your connected repositories.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <div className="relative">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="appearance-none bg-white border border-slate-200 hover:border-slate-300 text-slate-800 dark:bg-[#0D111A] dark:border-white/[0.08] dark:hover:border-white/20 rounded-xl px-3 py-1.5 pr-7 text-xs font-medium dark:text-slate-200 focus:outline-none focus:border-brand-purple cursor-pointer transition shadow-xs"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 1 year</option>
            </select>
            <span className="absolute right-2.5 top-2 pointer-events-none text-slate-400 text-xs">
              ▾
            </span>
          </div>

          {/* Sync / Add Repo */}
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand-purple hover:bg-purple-600 disabled:opacity-50 text-white px-3.5 py-1.5 text-xs font-semibold shadow-glow-purple transition active:scale-[0.98] cursor-pointer"
          >
            <SyncIcon className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
            <span>{sync.isPending ? 'Syncing...' : '+ Sync GitHub'}</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton State */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : repos.length === 0 ? (
        /* Empty State */
        <EmptyState
          icon={<RepositoriesIcon className="h-6 w-6 text-brand-purple" />}
          title="No repositories connected yet"
          description="Connect your GitHub repositories to track commit velocity, PR merge turnaround, and monitor developer productivity scores."
          actionText="Sync GitHub Repositories"
          onAction={() => sync.mutate()}
          isLoading={sync.isPending}
        />
      ) : (
        /* 5 Compact KPI Cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* 1. Developer Score */}
          <div className="rounded-2xl border border-slate-200 bg-white hover:border-slate-300 dark:border-white/[0.08] dark:bg-[#0D111A] p-4 flex flex-col justify-between dark:hover:border-white/15 transition-colors shadow-card-light dark:shadow-card-dark">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Developer Score</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${scoreTier.badgeClass}`}>
                {scoreTier.label}
              </span>
            </div>
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                {avgHealthScore}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">/ 100</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Avg Repo Health</span>
            </div>
            <div className="mt-3 pt-1 border-t border-slate-100 dark:border-white/[0.04]">
              <Sparkline data={[Math.max(0, avgHealthScore - 12), avgHealthScore]} color="emerald" />
            </div>
          </div>

          {/* 2. Total Commits */}
          <div className="rounded-2xl border border-slate-200 bg-white hover:border-slate-300 dark:border-white/[0.08] dark:bg-[#0D111A] p-4 flex flex-col justify-between dark:hover:border-white/15 transition-colors shadow-card-light dark:shadow-card-dark">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Commits</span>
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 font-mono">Live</span>
            </div>
            <div className="my-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                {totalCommitsCount.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Across {repos.length} repos</span>
            </div>
            <div className="mt-3 pt-1 border-t border-slate-100 dark:border-white/[0.04]">
              <Sparkline data={commitSparkline} color="purple" />
            </div>
          </div>

          {/* 3. Pull Requests */}
          <div className="rounded-2xl border border-slate-200 bg-white hover:border-slate-300 dark:border-white/[0.08] dark:bg-[#0D111A] p-4 flex flex-col justify-between dark:hover:border-white/15 transition-colors shadow-card-light dark:shadow-card-dark">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">PR Merge Rate</span>
              <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 font-mono">Telemetry</span>
            </div>
            <div className="my-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                {avgMergeRate}%
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Merged Pull Requests</span>
            </div>
            <div className="mt-3 pt-1 border-t border-slate-100 dark:border-white/[0.04]">
              <Sparkline data={[Math.max(0, avgMergeRate - 8), avgMergeRate]} color="blue" />
            </div>
          </div>

          {/* 4. Issues Resolved */}
          <div className="rounded-2xl border border-slate-200 bg-white hover:border-slate-300 dark:border-white/[0.08] dark:bg-[#0D111A] p-4 flex flex-col justify-between dark:hover:border-white/15 transition-colors shadow-card-light dark:shadow-card-dark">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Issue Resolution</span>
              <span className="text-[10px] font-medium text-cyan-600 dark:text-cyan-400 font-mono">Velocity</span>
            </div>
            <div className="my-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                {avgIssueRate}%
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Resolved Issues</span>
            </div>
            <div className="mt-3 pt-1 border-t border-slate-100 dark:border-white/[0.04]">
              <Sparkline data={[Math.max(0, avgIssueRate - 10), avgIssueRate]} color="cyan" />
            </div>
          </div>

          {/* 5. Code Reviews */}
          <div className="rounded-2xl border border-slate-200 bg-white hover:border-slate-300 dark:border-white/[0.08] dark:bg-[#0D111A] p-4 flex flex-col justify-between dark:hover:border-white/15 transition-colors shadow-card-light dark:shadow-card-dark">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Code Reviews</span>
              <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400 font-mono">Quality</span>
            </div>
            <div className="my-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                {devData?.review_score ?? 0}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono ml-1">/ 100</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Review Participation</span>
            </div>
            <div className="mt-3 pt-1 border-t border-slate-100 dark:border-white/[0.04]">
              <Sparkline
                data={[Math.max(0, (devData?.review_score || 0) - 10), devData?.review_score || 0]}
                color="rose"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Section 1: Commit Activity Heatmap (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-5 flex flex-col justify-between shadow-card-light dark:shadow-card-dark transition-colors">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Commit Activity</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
              Your synchronized commit cadence over the last {timeframe} days
            </p>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <ContributionHeatmap data={historyCommits} />
          </div>
        </div>

        {/* Section 2: Language Distribution Donut (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-5 flex flex-col justify-between shadow-card-light dark:shadow-card-dark transition-colors">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Language Distribution</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-3">
              Languages across your synchronized codebases
            </p>
          </div>
          <div className="flex-1 flex items-center justify-center py-2">
            {languagesData.length > 0 ? (
              <LanguageDonutChart data={languagesData} totalLabel={`${repos.length} Repos`} />
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">
                No language telemetry yet. Sync GitHub to analyze languages.
              </p>
            )}
          </div>
        </div>

        {/* Section 3: Ranked Repository Health (3 cols) */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-5 flex flex-col justify-between shadow-card-light dark:shadow-card-dark transition-colors">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Repository Health</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
              Health score of your top repositories
            </p>
          </div>

          <div className="space-y-3.5 flex-1">
            {topReposHealth.length > 0 ? (
              topReposHealth.map((repo) => (
                <div key={repo.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-800 dark:text-slate-200 font-medium truncate max-w-[130px]">
                      {repo.name}
                    </span>
                    <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{repo.score}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#182030] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${repo.tier.barClass}`}
                      style={{ width: `${repo.score}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">
                No repositories synced yet.
              </p>
            )}
          </div>

          <button
            onClick={() => navigate('/repositories')}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 dark:border-white/[0.08] dark:bg-[#121724] dark:hover:bg-white/[0.08] dark:text-slate-300 dark:hover:text-white py-2 text-xs font-medium transition text-center cursor-pointer"
          >
            View all repositories
          </button>
        </div>
      </div>

      {/* Bottom Grid: Developer Activity & AI Insight Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Developer Activity Card (8 cols) */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-5 shadow-card-light dark:shadow-card-dark transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Developer Activity</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Key velocity, streak, and code review participation metrics
              </p>
            </div>
            <span className="text-slate-400 dark:text-slate-500 text-xs">⋮</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Coding Streak */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3.5 flex flex-col justify-between hover:border-slate-300 dark:hover:border-white/15 transition-colors">
              <div className="flex items-center gap-2 text-amber-500 dark:text-amber-400">
                <FlameIcon className="h-4 w-4" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Coding Streak</span>
              </div>
              <div className="my-2">
                <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                  {devData?.coding_streak ?? 0}{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400 font-sans">days</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Consecutive activity</p>
            </div>

            {/* Est Coding Hours */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3.5 flex flex-col justify-between hover:border-slate-300 dark:hover:border-white/15 transition-colors">
              <div className="flex items-center gap-2 text-blue-500 dark:text-blue-400">
                <ClockIcon className="h-4 w-4" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Est. Coding Hours</span>
              </div>
              <div className="my-2">
                <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                  {devData?.coding_hours ?? 0}{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400 font-sans">hrs</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">From commit volume</p>
            </div>

            {/* Weekend Activity */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3.5 flex flex-col justify-between hover:border-slate-300 dark:hover:border-white/15 transition-colors">
              <div className="flex items-center gap-2 text-purple-500 dark:text-purple-400">
                <CalendarIcon className="h-4 w-4" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Weekend Activity</span>
              </div>
              <div className="my-2">
                <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                  {devData?.weekend_activity ?? 0}%
                </span>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Weekend distribution</p>
            </div>

            {/* Review Score */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3.5 flex flex-col justify-between hover:border-slate-300 dark:hover:border-white/15 transition-colors">
              <div className="flex items-center gap-2 text-yellow-500 dark:text-yellow-400">
                <StarIcon className="h-4 w-4" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Review Score</span>
              </div>
              <div className="my-2">
                <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                  {devData?.review_score ?? 0}{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400 font-sans">/ 100</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Collaboration Index</p>
            </div>
          </div>
        </div>

        {/* AI Insight Card (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-indigo-50 dark:border-brand-purple/35 dark:bg-gradient-to-br dark:from-[#12162A] dark:via-[#0D111A] dark:to-[#18132A] p-5 flex flex-col justify-between relative overflow-hidden shadow-glow-purple transition-colors">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-brand-purple/20 text-brand-purple">
                  <SparklesIcon className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">AI Insight ✦</h2>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 dark:bg-brand-purple/25 dark:text-purple-300 dark:border-purple-500/30">
                Live
              </span>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {devData?.coding_streak
                ? `You're maintaining a ${devData.coding_streak}-day active streak with ${devData.average_commits_per_day || 0} commits/day across ${repos.length} repositories. Consider focusing on PR turnaround to further improve your review score!`
                : `Connect your repositories to receive personalized, AI-driven recommendations on code quality, testing coverage, and engineering rhythm.`}
            </p>
          </div>

          <button
            onClick={() => navigate('/intelligence')}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-brand-purple hover:bg-purple-600 text-white py-2.5 px-4 text-xs font-medium shadow-glow-purple transition active:scale-[0.98] cursor-pointer"
          >
            <span>Ask AI anything</span>
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
