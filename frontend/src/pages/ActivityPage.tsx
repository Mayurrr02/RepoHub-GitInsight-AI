import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRepositories } from '../api/repositories';
import { getHistory } from '../api/analytics';
import { CodeBracketIcon, PullRequestIcon, IssueIcon, StarIcon } from '../components/icons/Icons';
import { EmptyState } from '../components/ui/EmptyState';

export function ActivityPage() {
  const [filter, setFilter] = useState<'all' | 'commits' | 'prs' | 'issues'>('all');
  const { data: repos = [] } = useQuery({ queryKey: ['repositories'], queryFn: getRepositories });
  const { data: history } = useQuery({ queryKey: ['history'], queryFn: () => getHistory() });

  const historyCommits = history?.commits || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Activity Feed</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time GitHub activity timeline and synchronized developer events
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-1 text-xs select-none shadow-xs">
          {(['all', 'commits', 'prs', 'issues'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg font-medium capitalize transition cursor-pointer ${
                filter === f ? 'bg-brand-purple text-white font-semibold shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Timeline Card */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-6 shadow-card-light dark:shadow-card-dark transition-colors">
        {historyCommits.length === 0 && repos.length === 0 ? (
          <EmptyState
            icon={<CodeBracketIcon className="h-6 w-6 text-brand-purple" />}
            title="No synchronized activity recorded yet"
            description="Sync your GitHub account to start streaming live commit events, PR merges, and issue updates."
          />
        ) : (
          <div className="space-y-6">
            {historyCommits.slice(-10).reverse().map((item, idx) => (
              <div key={item.date} className="flex items-start gap-4 relative">
                {idx !== Math.min(historyCommits.length, 10) - 1 && (
                  <div className="absolute left-4 top-9 bottom-0 w-px bg-slate-200 dark:bg-white/[0.06]" />
                )}

                {/* Event Icon Badge */}
                <div className="h-8 w-8 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#080B12] dark:border-white/[0.08] flex items-center justify-center text-brand-purple shrink-0 z-10">
                  <CodeBracketIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>

                {/* Event Details Card */}
                <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] p-3.5 hover:border-slate-300 dark:hover:border-white/20 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      Pushed {item.commits} commits across repositories
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">{item.date}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Synchronized commit events recorded into RepoHub telemetry engine.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
