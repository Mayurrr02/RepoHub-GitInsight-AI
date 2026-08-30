import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { downloadReport } from '../api/ai';
import { getMe, getRepositories } from '../api/repositories';
import { getDeveloper, getHistory, getRepoMetrics } from '../api/analytics';
import { RepoHubLogo, ReportsIcon } from '../components/icons/Icons';

export function ReportsPage() {
  const [isDownloading, setIsDownloading] = useState(false);
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const { data: repos } = useQuery({ queryKey: ['repositories'], queryFn: getRepositories });
  const { data: history } = useQuery({ queryKey: ['history'], queryFn: () => getHistory() });
  const { data: dev } = useQuery({ queryKey: ['developer'], queryFn: getDeveloper });
  const { data: metrics } = useQuery({ queryKey: ['repo-metrics'], queryFn: getRepoMetrics });

  const userName = user?.name || user?.login || 'Developer';
  const reportDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const totalCommits = (history?.commits || []).reduce((acc, c) => acc + c.commits, 0);
  const repoCount = repos?.length || 0;
  const streak = dev?.coding_streak || 0;
  const avgHealth =
    metrics && metrics.length > 0
      ? Math.round(metrics.reduce((a, b) => a + b.health_score, 0) / metrics.length)
      : dev?.review_score || 0;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const blob = await downloadReport();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `repohub-engineering-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('PDF generation fallback');
      const blob = new Blob(
        [
          `RepoHub Engineering Executive Report for ${userName}\nGenerated on ${reportDate}\nTotal Commits: ${totalCommits}\nRepositories: ${repoCount}\nHealth Score: ${avgHealth}`,
        ],
        { type: 'application/pdf' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `repohub-report-${userName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Engineering Reports
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Automated PDF summaries, developer scorecards, and executive summaries
          </p>
        </div>

        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center gap-2 rounded-xl bg-brand-purple hover:bg-purple-600 disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold shadow-glow-purple transition cursor-pointer"
        >
          <span>📥</span>
          <span>{isDownloading ? 'Generating PDF...' : 'Download PDF'}</span>
        </button>
      </div>

      {/* Main Report Preview Card */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-6 shadow-card-light dark:shadow-card-dark space-y-6 transition-colors">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.06] pb-4">
          <div className="flex items-center gap-2">
            <ReportsIcon className="h-4 w-4 text-brand-purple" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Engineering Performance Report</h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Generated: {reportDate}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Report Cover Graphic */}
          <div className="md:col-span-5 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-indigo-50 dark:border-brand-purple/40 dark:bg-gradient-to-br dark:from-[#121629] dark:via-[#0D111A] dark:to-[#1f1638] p-6 relative overflow-hidden shadow-xs dark:shadow-glow-purple flex flex-col justify-between min-h-[220px] transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                Official Report
              </span>
              <RepoHubLogo className="h-6 w-6" />
            </div>

            <div className="my-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Engineering Executive Report</h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">{userName}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">{reportDate}</p>
            </div>

            {/* Bars visualizer */}
            <div className="flex items-end gap-1.5 h-10 pt-2">
              {[40, 65, 50, 85, 70, 95, 80, 100].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-purple-400/40 to-purple-600 dark:from-brand-purple/40 dark:to-brand-purple"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          {/* Report Checklist */}
          <div className="md:col-span-7 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Report Summary</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Comprehensive analysis of your synchronized GitHub activity and engineering productivity.
              </p>
            </div>

            <div className="space-y-2.5">
              {[
                'Developer Overview',
                'Repository Analysis',
                'Productivity Trends',
                'Code Quality Insights',
                'AI Recommendations',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 text-[10px] font-bold">
                    ✓
                  </div>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Real Bottom Stat Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-200 dark:border-white/[0.06]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3 text-center transition-colors">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{avgHealth}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Health Score</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3 text-center transition-colors">
            <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {totalCommits >= 1000 ? `${(totalCommits / 1000).toFixed(1)}K` : totalCommits}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Total Commits</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3 text-center transition-colors">
            <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{repoCount}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Repositories</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3 text-center transition-colors">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">{streak}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Day Streak</p>
          </div>
        </div>
      </div>
    </div>
  );
}
