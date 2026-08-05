import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRepositories, syncRepositories } from '../api/repositories';
export function RepositoriesPage() {
  const queryClient = useQueryClient(); const repos = useQuery({ queryKey: ['repositories'], queryFn: getRepositories });
  const sync = useMutation({ mutationFn: syncRepositories, onSuccess: () => setTimeout(() => queryClient.invalidateQueries({queryKey:['repositories']}), 1500) });
  if (repos.isLoading) return <p>Loading repositories…</p>;
  if (repos.isError) return <p className="text-red-400">Could not load repositories. Please try again.</p>;
  const data = repos.data ?? [];
  return <><div className="mb-6 flex items-center justify-between"><div><h1 className="text-2xl font-bold">Repositories</h1><p className="text-slate-400">{data.length} synced from GitHub</p></div><button disabled={sync.isPending} onClick={() => sync.mutate()} className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50">{sync.isPending ? 'Syncing…' : 'Sync GitHub'}</button></div>{data.length === 0 ? <div className="rounded border border-dashed border-slate-700 p-12 text-center text-slate-400">No repositories yet. Sync your GitHub account to get started.</div> : <div className="grid gap-4 md:grid-cols-2">{data.map(repo => <a key={repo.id} href={repo.html_url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-800 bg-slate-900 p-5 hover:border-slate-600"><div className="flex justify-between"><h2 className="font-semibold">{repo.full_name}</h2><span>{repo.is_private ? 'Private' : 'Public'}</span></div><p className="mt-2 min-h-12 text-sm text-slate-400">{repo.description ?? 'No description'}</p><footer className="mt-4 text-sm text-slate-400">{repo.language ?? '—'} · ★ {repo.stars}</footer></a>)}</div>}</>;
}
