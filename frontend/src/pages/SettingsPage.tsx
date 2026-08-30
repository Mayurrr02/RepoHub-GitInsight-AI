import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMe } from '../api/repositories';
import { getApiKeys, createApiKey, revokeApiKey, ApiKeyCreated } from '../api/users';
import { GitHubIcon } from '../components/icons/Icons';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const { data: keys = [] } = useQuery({ queryKey: ['api-keys'], queryFn: getApiKeys });

  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const createKeyMutation = useMutation({
    mutationFn: (name: string) => createApiKey({ name }),
    onSuccess: (data) => {
      setCreatedKey(data);
      setNewKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: number) => revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const copyKey = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Settings & Credentials
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your account profile, GitHub integration, and API access tokens
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-6 shadow-card-light dark:shadow-card-dark space-y-4 transition-colors">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Profile Overview</h2>
          <div className="flex items-center gap-4 pt-2">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt="Avatar"
                className="h-14 w-14 rounded-2xl border-2 border-brand-purple object-cover"
              />
            ) : (
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-purple to-indigo-600 flex items-center justify-center font-bold text-white text-xl">
                {(user?.name || user?.login || 'U').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-base font-bold text-slate-900 dark:text-white">
                {user?.name || user?.login || 'Developer'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">@{user?.login}</p>
              <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 dark:bg-brand-purple/20 dark:text-purple-300 dark:border-purple-500/30">
                GitHub Authorized
              </span>
            </div>
          </div>
        </div>

        {/* GitHub Connection */}
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-6 shadow-card-light dark:shadow-card-dark space-y-4 transition-colors">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">GitHub Integration</h2>
          <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/20 flex items-center justify-between transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-slate-900 text-white">
                <GitHubIcon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">Connected as @{user?.login}</p>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400">OAuth token active & synchronized</p>
              </div>
            </div>
            <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">● Active</span>
          </div>
        </div>

        {/* API Credentials */}
        <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-6 shadow-card-light dark:shadow-card-dark space-y-4 transition-colors">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">API Access Tokens</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Generate personal API tokens to programmatically query RepoHub analytics from CI/CD scripts and external services.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="API Key Name (e.g. GitHub Actions, Terminal CLI)..."
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-brand-purple focus:outline-none"
            />
            <button
              onClick={() => {
                if (newKeyName.trim()) createKeyMutation.mutate(newKeyName.trim());
              }}
              disabled={createKeyMutation.isPending || !newKeyName.trim()}
              className="rounded-xl bg-brand-purple hover:bg-purple-600 disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold shadow-glow-purple transition cursor-pointer"
            >
              {createKeyMutation.isPending ? 'Creating...' : '+ Create Key'}
            </button>
          </div>

          {createdKey && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/30 p-4 space-y-2">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                🎉 Key Created Successfully! Copy it now (it won't be displayed again):
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={createdKey.raw_key}
                  className="flex-1 font-mono text-xs bg-white dark:bg-[#080B12] border border-emerald-300 dark:border-emerald-800 rounded-lg px-3 py-1.5 text-slate-900 dark:text-emerald-200"
                />
                <button
                  onClick={() => copyKey(createdKey.raw_key)}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-medium transition cursor-pointer"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-white/[0.04] pt-2">
            {keys.length > 0 ? (
              keys.map((k) => (
                <div key={k.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">{k.name}</span>
                    <span className="font-mono text-slate-500 ml-2">{k.prefix}</span>
                  </div>
                  <button
                    onClick={() => revokeKeyMutation.mutate(k.id)}
                    className="text-rose-600 dark:text-rose-400 hover:underline text-xs cursor-pointer"
                  >
                    Revoke
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-2">No active API keys created yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
