import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createOrganization, listOrganizations, Organization } from '../api/organizations';

export function OrganizationsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const orgs = useQuery({
    queryKey: ['organizations'],
    queryFn: listOrganizations,
  });

  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setModalOpen(false);
      setName('');
      setSlug('');
      setAvatarUrl('');
      setErrorMsg('');
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.detail || 'Failed to create organization');
    },
  });

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, '-')) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
  };

  const roleColors: Record<string, string> = {
    owner: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    admin: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
    member: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    viewer: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Organizations & Teams</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Manage multi-tenant engineering teams, contributor rankings, and team analytics.
          </p>
        </div>
        <button
          onClick={() => { setErrorMsg(''); setModalOpen(true); }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors shadow-md shadow-blue-600/20"
        >
          <span>+</span> Create Organization
        </button>
      </div>

      {orgs.isLoading ? (
        <div className="flex justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : orgs.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 p-4 text-sm">
          Failed to load organizations. Please try again.
        </div>
      ) : (orgs.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30 p-12 text-center transition-colors duration-200">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            🏢
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-200">No organizations found</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Create an organization to aggregate team metrics, track contributor rankings, and monitor review bottlenecks.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            Create your first organization
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {(orgs.data ?? []).map((org: Organization) => (
            <div
              key={org.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 hover:border-slate-300 hover:shadow-md dark:hover:border-slate-700 transition-all shadow-xs transition-colors duration-200"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {org.avatar_url ? (
                      <img src={org.avatar_url} alt={org.name} className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-lg font-bold text-white shadow-inner">
                        {org.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h2 className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">{org.name}</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">@{org.slug}</p>
                    </div>
                  </div>
                  {org.my_role && (
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                        roleColors[org.my_role.toLowerCase()] || roleColors.viewer
                      }`}
                    >
                      {org.my_role}
                    </span>
                  )}
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 border-t border-b border-slate-100 dark:border-slate-800/80 py-3">
                  <div className="text-center">
                    <span className="block text-xs text-slate-500 dark:text-slate-400">Members</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-slate-200">{org.members_count}</span>
                  </div>
                  <div className="text-center border-l border-slate-100 dark:border-slate-800/80">
                    <span className="block text-xs text-slate-500 dark:text-slate-400">Repositories</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-slate-200">{org.repositories_count}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-2">
                <Link
                  to={`/organizations/${org.id}/team`}
                  className="flex-1 text-center rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 dark:bg-blue-600/20 dark:hover:bg-blue-600 dark:text-blue-300 dark:hover:text-white dark:border-blue-500/30 px-3 py-2 text-xs font-semibold transition-colors"
                >
                  Launch Team Hub →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-2xl transition-colors duration-200">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Create New Organization</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Set up a multi-tenant team workspace with role-based access.
            </p>

            {errorMsg && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 p-3 text-xs">
                {errorMsg}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({ name, slug, avatar_url: avatarUrl || undefined });
              }}
              className="mt-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Organization Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Acme Engineering"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Slug (URL identifier)</label>
                <input
                  type="text"
                  required
                  pattern="^[a-z0-9-]+$"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="e.g. acme-engineering"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Avatar URL (Optional)</label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800 dark:text-slate-300 px-4 py-2 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !name || !slug}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating…' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
