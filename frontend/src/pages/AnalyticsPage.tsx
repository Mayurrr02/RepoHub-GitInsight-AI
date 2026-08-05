import { useQuery } from '@tanstack/react-query';
import { getDeveloper, getHistory, getRepoMetrics } from '../api/analytics';

function Metric({label, value, suffix = ''}: {label:string; value:number; suffix?:string}) {
  return <div className="rounded-lg border border-slate-800 bg-slate-900 p-4"><p className="text-sm text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold">{value}{suffix}</p></div>;
}

export function AnalyticsPage() {
  const developer = useQuery({queryKey:['developer'], queryFn:getDeveloper});
  const history = useQuery({queryKey:['history'], queryFn:getHistory});
  const repositories = useQuery({queryKey:['repo-metrics'], queryFn:getRepoMetrics});
  if (developer.isLoading || history.isLoading || repositories.isLoading) return <p>Loading analytics…</p>;
  if (developer.isError || history.isError || repositories.isError || !developer.data || !history.data || !repositories.data) return <p className="text-red-400">Analytics could not be loaded. Sync GitHub and try again.</p>;
  const max = Math.max(...history.data.commits.map(x => x.commits), 1);
  return <div className="space-y-8">
    <div><h1 className="text-2xl font-bold">Engineering analytics</h1><p className="text-slate-400">Metrics calculated from your synced GitHub activity.</p></div>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Metric label="Coding streak" value={developer.data.coding_streak} suffix=" days"/><Metric label="Average commits/day" value={developer.data.average_commits_per_day}/><Metric label="Coding hours (estimated)" value={developer.data.coding_hours}/><Metric label="Commit frequency" value={developer.data.commit_frequency} suffix=" / active day"/><Metric label="Review score" value={developer.data.review_score} suffix=" / 100"/><Metric label="Weekend activity" value={developer.data.weekend_activity} suffix="%"/>
    </section>
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Commits over time</h2><div className="mt-6 flex h-40 items-end gap-1">{history.data.commits.map(point => <div key={point.date} title={`${point.date}: ${point.commits} commits`} className="min-w-1 flex-1 rounded-t bg-blue-500" style={{height:`${Math.max(4, point.commits / max * 100)}%`}} />)}</div><p className="mt-3 text-sm text-slate-400">Last 90 days · hover a bar for daily commits</p></section>
    <section className="grid gap-6 md:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Language distribution</h2>{developer.data.languages.length ? <div className="mt-5 space-y-3">{developer.data.languages.map(l => <div key={l.name}><div className="flex justify-between text-sm"><span>{l.name}</span><span>{l.percent}%</span></div><div className="mt-1 h-2 rounded bg-slate-800"><div className="h-2 rounded bg-violet-500" style={{width:`${l.percent}%`}}/></div></div>)}</div> : <p className="mt-4 text-slate-400">No language data yet.</p>}</div><div className="rounded-lg border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Repository health</h2><div className="mt-4 space-y-3">{repositories.data.length ? repositories.data.map(repo => <div key={repo.repository_id} className="flex justify-between"><span className="truncate">{repo.name}</span><span className="font-semibold">{repo.health_score}/100</span></div>) : <p className="text-slate-400">No repositories yet.</p>}</div></div></section>
  </div>;
}
