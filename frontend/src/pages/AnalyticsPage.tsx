import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDeveloper, getHistory, getRepoMetrics } from '../api/analytics';
import { syncRepositories } from '../api/repositories';

function Metric({ label, value, suffix = '' }: { label: string; value: number | undefined; suffix?: string }) {
  const displayValue = typeof value === 'number' ? value : 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800/90 dark:bg-slate-900/80 p-5 shadow-xs backdrop-blur transition hover:border-slate-300 dark:hover:border-slate-700 transition-colors duration-200">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        {displayValue}
        <span className="text-lg font-normal text-slate-400 dark:text-slate-400">{suffix}</span>
      </p>
    </div>
  );
}

export function AnalyticsPage() {
  const queryClient = useQueryClient();
  const developer = useQuery({ queryKey: ['developer'], queryFn: getDeveloper });
  const history = useQuery({ queryKey: ['history'], queryFn: getHistory });
  const repositories = useQuery({ queryKey: ['repo-metrics'], queryFn: getRepoMetrics });

  const sync = useMutation({
    mutationFn: syncRepositories,
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['developer'] });
        queryClient.invalidateQueries({ queryKey: ['history'] });
        queryClient.invalidateQueries({ queryKey: ['repo-metrics'] });
        queryClient.invalidateQueries({ queryKey: ['repositories'] });
      }, 1500);
    },
  });

  if (developer.isLoading || history.isLoading || repositories.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-500 dark:text-slate-400 animate-pulse font-medium">Loading engineering analytics…</p>
      </div>
    );
  }

  if (developer.isError || history.isError || repositories.isError || !developer.data || !history.data || !repositories.data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400 p-8 text-center">
        <p className="font-medium">Analytics could not be loaded.</p>
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition"
        >
          {sync.isPending ? 'Syncing…' : 'Sync GitHub and retry'}
        </button>
      </div>
    );
  }

  const max = Math.max(...history.data.commits.map(x => x.commits), 1);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Engineering analytics</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Metrics calculated from your synced GitHub activity.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['developer'] });
              queryClient.invalidateQueries({ queryKey: ['history'] });
              queryClient.invalidateQueries({ queryKey: ['repo-metrics'] });
            }}
            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white px-3.5 py-2 text-sm font-medium transition"
          >
            Refresh Data
          </button>
          <button
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition shadow-md shadow-blue-600/20"
          >
            {sync.isPending ? 'Syncing…' : 'Sync GitHub'}
          </button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Coding streak" value={developer.data.coding_streak} suffix=" days" />
        <Metric label="Average commits/day" value={developer.data.average_commits_per_day} />
        <Metric label="Coding hours (estimated)" value={developer.data.coding_hours} />
        <Metric label="Commit frequency" value={developer.data.commit_frequency} suffix=" / active day" />
        <Metric label="Review score" value={developer.data.review_score} suffix=" / 100" />
        <Metric label="Weekend activity" value={developer.data.weekend_activity} suffix="%" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800/90 dark:bg-slate-900/80 p-6 shadow-xs backdrop-blur transition-colors duration-200">
        <h2 className="font-semibold text-slate-900 dark:text-slate-200">Commits over time</h2>
        <div className="mt-6 flex h-40 items-end gap-1">
          {history.data.commits.map(point => (
            <div
              key={point.date}
              title={`${point.date}: ${point.commits} commits`}
              className="min-w-1 flex-1 rounded-t bg-blue-500 transition-all hover:bg-blue-400"
              style={{ height: `${Math.max(4, (point.commits / max) * 100)}%` }}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Last 90 days · hover a bar for daily commits</p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800/90 dark:bg-slate-900/80 p-6 shadow-xs backdrop-blur transition-colors duration-200">
          <h2 className="font-semibold text-slate-900 dark:text-slate-200">Language distribution</h2>
          {developer.data.languages.length ? (
            <div className="mt-5 space-y-3">
              {developer.data.languages.map(l => (
                <div key={l.name}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{l.name}</span>
                    <span className="font-medium text-slate-500 dark:text-slate-400">{l.percent}%</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded bg-slate-100 dark:bg-slate-800">
                    <div className="h-2 rounded bg-blue-500 transition-all duration-500" style={{ width: `${l.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No language data yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800/90 dark:bg-slate-900/80 p-6 shadow-xs backdrop-blur transition-colors duration-200">
          <h2 className="font-semibold text-slate-900 dark:text-slate-200">Repository health</h2>
          <div className="mt-4 space-y-3">
            {repositories.data.length ? (
              repositories.data.map(repo => (
                <div key={repo.repository_id} className="flex justify-between items-center text-sm py-1 border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                  <span className="truncate text-slate-700 dark:text-slate-300">{repo.name}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-200 ml-3">{repo.health_score}/100</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No repositories yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
