import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import {
  addMember,
  getAuditLogs,
  getOrganization,
  linkRepository,
  listMembers,
  listOrgRepositories,
  removeMember,
  unlinkRepository,
  updateMemberRole,
} from '../api/organizations';
import {
  getContributorRankings,
  getReviewBottlenecks,
  getTeamOverview,
  getTeamProductivity,
} from '../api/team_analytics';
import { getRepositories } from '../api/repositories';

type Tab = 'overview' | 'rankings' | 'productivity' | 'bottlenecks' | 'members' | 'repositories' | 'audit';

export function TeamDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const orgId = parseInt(id || '0', 10);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Form states
  const [inviteLogin, setInviteLogin] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [selectedRepoId, setSelectedRepoId] = useState<number | ''>('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Queries
  const orgQuery = useQuery({
    queryKey: ['organization', orgId],
    queryFn: () => getOrganization(orgId),
    enabled: !!orgId,
  });

  const overviewQuery = useQuery({
    queryKey: ['team-overview', orgId],
    queryFn: () => getTeamOverview(orgId),
    enabled: !!orgId && activeTab === 'overview',
  });

  const rankingsQuery = useQuery({
    queryKey: ['rankings', orgId],
    queryFn: () => getContributorRankings(orgId),
    enabled: !!orgId && activeTab === 'rankings',
  });

  const productivityQuery = useQuery({
    queryKey: ['productivity', orgId],
    queryFn: () => getTeamProductivity(orgId, 12),
    enabled: !!orgId && activeTab === 'productivity',
  });

  const bottlenecksQuery = useQuery({
    queryKey: ['bottlenecks', orgId],
    queryFn: () => getReviewBottlenecks(orgId),
    enabled: !!orgId && activeTab === 'bottlenecks',
  });

  const membersQuery = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => listMembers(orgId),
    enabled: !!orgId && activeTab === 'members',
  });

  const orgReposQuery = useQuery({
    queryKey: ['org-repos', orgId],
    queryFn: () => listOrgRepositories(orgId),
    enabled: !!orgId && activeTab === 'repositories',
  });

  const userReposQuery = useQuery({
    queryKey: ['user-repos'],
    queryFn: getRepositories,
    enabled: !!orgId && activeTab === 'repositories',
  });

  const auditQuery = useQuery({
    queryKey: ['audit-logs', orgId, auditActionFilter],
    queryFn: () => getAuditLogs(orgId, auditActionFilter || undefined),
    enabled: !!orgId && activeTab === 'audit',
  });

  // Mutations
  const addMemberMutation = useMutation({
    mutationFn: () => addMember(orgId, { login: inviteLogin, role: inviteRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
      setInviteLogin('');
      setMessage({ type: 'success', text: `Added @${inviteLogin} as ${inviteRole}` });
    },
    onError: (err: any) => {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to add member' });
    },
  });

  const roleUpdateMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) => updateMemberRole(orgId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
      setMessage({ type: 'success', text: 'Member role updated successfully' });
    },
    onError: (err: any) => {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to update role' });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: number) => removeMember(orgId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
      setMessage({ type: 'success', text: 'Member removed from organization' });
    },
    onError: (err: any) => {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to remove member' });
    },
  });

  const linkRepoMutation = useMutation({
    mutationFn: (repoId: number) => linkRepository(orgId, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-repos', orgId] });
      queryClient.invalidateQueries({ queryKey: ['team-overview', orgId] });
      setSelectedRepoId('');
      setMessage({ type: 'success', text: 'Repository linked to team' });
    },
    onError: (err: any) => {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to link repository' });
    },
  });

  const unlinkRepoMutation = useMutation({
    mutationFn: (repoId: number) => unlinkRepository(orgId, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-repos', orgId] });
      queryClient.invalidateQueries({ queryKey: ['team-overview', orgId] });
      setMessage({ type: 'success', text: 'Repository unlinked from team' });
    },
    onError: (err: any) => {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to unlink repository' });
    },
  });

  if (orgQuery.isLoading) return <div className="p-8 text-center text-slate-400">Loading organization…</div>;
  if (orgQuery.isError || !orgQuery.data) return <div className="p-8 text-center text-red-400">Organization not found.</div>;

  const org = orgQuery.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-4">
          {org.avatar_url ? (
            <img src={org.avatar_url} alt={org.name} className="h-12 w-12 rounded-xl object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-xl font-bold text-white shadow-lg">
              {org.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-100">{org.name}</h1>
              <span className="text-xs font-mono text-slate-400">@{org.slug}</span>
              {org.my_role && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-blue-800 bg-blue-950/60 text-blue-300 uppercase">
                  {org.my_role}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Multi-tenant engineering workspace · {org.members_count} members · {org.repositories_count} linked repositories
            </p>
          </div>
        </div>

        <Link
          to="/organizations"
          className="text-xs text-slate-400 hover:text-slate-200 border border-slate-800 bg-slate-900 rounded-lg px-3 py-2 transition-colors self-start sm:self-auto"
        >
          ← All Organizations
        </Link>
      </div>

      {/* Toast Feedback */}
      {message && (
        <div
          className={`flex items-center justify-between rounded-lg p-3 text-xs ${
            message.type === 'success'
              ? 'border border-emerald-800 bg-emerald-950/40 text-emerald-300'
              : 'border border-red-800 bg-red-950/40 text-red-300'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-4 font-bold opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 text-sm overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`border-b-2 px-4 py-3 font-medium whitespace-nowrap transition-colors ${
            activeTab === 'overview'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('rankings')}
          className={`border-b-2 px-4 py-3 font-medium whitespace-nowrap transition-colors ${
            activeTab === 'rankings'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Contributor Rankings
        </button>
        <button
          onClick={() => setActiveTab('productivity')}
          className={`border-b-2 px-4 py-3 font-medium whitespace-nowrap transition-colors ${
            activeTab === 'productivity'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Productivity & Velocity
        </button>
        <button
          onClick={() => setActiveTab('bottlenecks')}
          className={`border-b-2 px-4 py-3 font-medium whitespace-nowrap transition-colors ${
            activeTab === 'bottlenecks'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Review Bottlenecks
        </button>
        <button
          onClick={() => setActiveTab('members')}
          className={`border-b-2 px-4 py-3 font-medium whitespace-nowrap transition-colors ${
            activeTab === 'members'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Members & RBAC
        </button>
        <button
          onClick={() => setActiveTab('repositories')}
          className={`border-b-2 px-4 py-3 font-medium whitespace-nowrap transition-colors ${
            activeTab === 'repositories'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Repositories
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`border-b-2 px-4 py-3 font-medium whitespace-nowrap transition-colors ${
            activeTab === 'audit'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Audit Logs
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in">
          {overviewQuery.isLoading ? (
            <p className="text-slate-400 text-sm">Loading team overview…</p>
          ) : overviewQuery.data ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
                  <p className="text-xs text-slate-400">Team Health Score</p>
                  <p className="mt-2 text-3xl font-bold text-blue-400">{overviewQuery.data.health_score} <span className="text-sm font-normal text-slate-500">/ 100</span></p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
                  <p className="text-xs text-slate-400">Team Activity Score</p>
                  <p className="mt-2 text-3xl font-bold text-emerald-400">{overviewQuery.data.activity_score} <span className="text-sm font-normal text-slate-500">/ 100</span></p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
                  <p className="text-xs text-slate-400">PR Merge Rate</p>
                  <p className="mt-2 text-3xl font-bold text-indigo-400">{overviewQuery.data.merge_rate}%</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
                  <p className="text-xs text-slate-400">Issue Resolution Rate</p>
                  <p className="mt-2 text-3xl font-bold text-purple-400">{overviewQuery.data.issue_resolution_rate}%</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
                  <p className="text-xs text-slate-400">Linked Repositories</p>
                  <p className="mt-2 text-3xl font-bold text-slate-200">{overviewQuery.data.repositories_count}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
                  <p className="text-xs text-slate-400">Active Members</p>
                  <p className="mt-2 text-3xl font-bold text-slate-200">{overviewQuery.data.members_count}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="font-semibold text-slate-200">Team Health Diagnostics</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Calculated by aggregating commit velocity, review turnout, merged pull requests, and documentation completeness across all linked repositories.
                </p>
                <div className="mt-4 flex gap-4">
                  <button onClick={() => setActiveTab('rankings')} className="text-xs text-blue-400 hover:underline">
                    View Contributor Rankings →
                  </button>
                  <button onClick={() => setActiveTab('bottlenecks')} className="text-xs text-blue-400 hover:underline">
                    Inspect Review Bottlenecks →
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Tab 2: Contributor Rankings */}
      {activeTab === 'rankings' && (
        <div className="space-y-6 animate-in fade-in">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Team Contributor Rankings</h2>
            <p className="text-xs text-slate-400">
              Rankings weighted by commits (×2.0), merged pull requests (×5.0), and completed code reviews (×3.5).
            </p>
          </div>

          {rankingsQuery.isLoading ? (
            <p className="text-slate-400 text-sm">Calculating rankings…</p>
          ) : rankingsQuery.data && rankingsQuery.data.rankings.length > 0 ? (
            <div className="space-y-6">
              {/* Podium for top 3 */}
              <div className="grid gap-4 sm:grid-cols-3">
                {rankingsQuery.data.rankings.slice(0, 3).map((item) => (
                  <div
                    key={item.login}
                    className={`relative rounded-xl border p-5 text-center shadow-md ${
                      item.rank === 1
                        ? 'border-amber-500/50 bg-gradient-to-b from-amber-950/30 to-slate-900'
                        : item.rank === 2
                        ? 'border-slate-400/50 bg-gradient-to-b from-slate-800/30 to-slate-900'
                        : 'border-amber-700/50 bg-gradient-to-b from-amber-950/20 to-slate-900'
                    }`}
                  >
                    <div className="absolute top-3 right-3 text-lg">
                      {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : '🥉'}
                    </div>
                    {item.avatar_url && (
                      <img
                        src={item.avatar_url}
                        alt={item.login}
                        className="mx-auto h-16 w-16 rounded-full border-2 border-slate-700 object-cover"
                      />
                    )}
                    <h4 className="mt-3 font-semibold text-slate-100">{item.name || `@${item.login}`}</h4>
                    <p className="text-xs font-mono text-slate-400">@{item.login}</p>
                    <div className="mt-4 rounded-lg bg-slate-950/60 p-2">
                      <span className="text-xs text-slate-400">Impact Score</span>
                      <p className="text-xl font-bold text-blue-400">{item.impact_score}</p>
                    </div>
                    <div className="mt-3 flex justify-around text-xs text-slate-400">
                      <span>{item.commits} Commits</span>
                      <span>{item.pull_requests} PRs</span>
                      <span>{item.reviews} Reviews</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Full Table */}
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-5 py-3">Rank</th>
                      <th className="px-5 py-3">Contributor</th>
                      <th className="px-5 py-3 text-center">Commits</th>
                      <th className="px-5 py-3 text-center">Pull Requests</th>
                      <th className="px-5 py-3 text-center">Reviews</th>
                      <th className="px-5 py-3 text-right">Impact Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {rankingsQuery.data.rankings.map((row) => (
                      <tr key={row.login} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-slate-300">
                          {row.rank === 1 ? '🥇 #1' : row.rank === 2 ? '🥈 #2' : row.rank === 3 ? '🥉 #3' : `#${row.rank}`}
                        </td>
                        <td className="px-5 py-3.5 flex items-center gap-3">
                          {row.avatar_url && (
                            <img src={row.avatar_url} alt={row.login} className="h-7 w-7 rounded-full" />
                          )}
                          <div>
                            <span className="font-semibold text-slate-200">{row.name || row.login}</span>
                            <span className="block text-xs text-slate-500 font-mono">@{row.login}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono text-slate-300">{row.commits}</td>
                        <td className="px-5 py-3.5 text-center font-mono text-slate-300">{row.pull_requests}</td>
                        <td className="px-5 py-3.5 text-center font-mono text-slate-300">{row.reviews}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-blue-400">{row.impact_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
              No contributor data found. Make sure repositories are synced.
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Productivity & Velocity */}
      {activeTab === 'productivity' && (
        <div className="space-y-6 animate-in fade-in">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Team Productivity & Velocity</h2>
            <p className="text-xs text-slate-400">
              Weekly commit trends, PR throughput, and sprint velocity over the last 12 weeks.
            </p>
          </div>

          {productivityQuery.isLoading ? (
            <p className="text-slate-400 text-sm">Calculating velocity…</p>
          ) : productivityQuery.data ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <span className="text-xs text-slate-400">Total Commits (12w)</span>
                  <p className="mt-1 text-2xl font-bold text-slate-100">{productivityQuery.data.total_commits}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <span className="text-xs text-slate-400">Avg Weekly Commits</span>
                  <p className="mt-1 text-2xl font-bold text-blue-400">{productivityQuery.data.average_weekly_commits}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <span className="text-xs text-slate-400">PRs Merged (12w)</span>
                  <p className="mt-1 text-2xl font-bold text-emerald-400">{productivityQuery.data.total_pull_requests_merged}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <span className="text-xs text-slate-400">Sprint Velocity</span>
                  <p className="mt-1 text-2xl font-bold text-purple-400">{productivityQuery.data.sprint_velocity}</p>
                </div>
              </div>

              {/* Weekly bar chart */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="font-semibold text-sm text-slate-200">Weekly Activity Timeline</h3>
                <div className="mt-6 flex h-48 items-end gap-2">
                  {productivityQuery.data.periods.map((p) => {
                    const maxVal = Math.max(...productivityQuery.data.periods.map(x => x.commits), 1);
                    const pct = Math.max(8, (p.commits / maxVal) * 100);
                    return (
                      <div key={p.period} className="flex-1 flex flex-col items-center gap-2 group">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-blue-600 to-indigo-500 group-hover:from-blue-500 group-hover:to-indigo-400 transition-all"
                          style={{ height: `${pct}%` }}
                          title={`${p.period}: ${p.commits} commits, ${p.pull_requests_merged} PRs merged`}
                        />
                        <span className="text-[10px] text-slate-400 truncate max-w-full font-mono">
                          {p.period.split(' - ')[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Tab 4: Review Bottlenecks */}
      {activeTab === 'bottlenecks' && (
        <div className="space-y-6 animate-in fade-in">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Pull Request Review Bottlenecks</h2>
            <p className="text-xs text-slate-400">
              Identify slow review turnaround times, unreviewed pull requests, and reviewer workload imbalances.
            </p>
          </div>

          {bottlenecksQuery.isLoading ? (
            <p className="text-slate-400 text-sm">Analyzing bottlenecks…</p>
          ) : bottlenecksQuery.data ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <span className="text-xs text-slate-400">Avg Time to First Review</span>
                  <p className="mt-2 text-3xl font-bold text-amber-400">
                    {bottlenecksQuery.data.average_review_time_hours} <span className="text-sm font-normal text-slate-500">hours</span>
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <span className="text-xs text-slate-400">Avg Time to Merge</span>
                  <p className="mt-2 text-3xl font-bold text-blue-400">
                    {bottlenecksQuery.data.average_merge_time_hours} <span className="text-sm font-normal text-slate-500">hours</span>
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <span className="text-xs text-slate-400">Unreviewed Open PRs</span>
                  <p className="mt-2 text-3xl font-bold text-rose-400">
                    {bottlenecksQuery.data.unreviewed_pr_count} <span className="text-sm font-normal text-slate-500">/ {bottlenecksQuery.data.total_open_prs} open</span>
                  </p>
                </div>
              </div>

              {/* Unreviewed PRs Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-950/40">
                  <h3 className="font-semibold text-sm text-slate-200">Open PRs Awaiting Review</h3>
                </div>
                {bottlenecksQuery.data.unreviewed_prs.length === 0 ? (
                  <p className="p-6 text-center text-xs text-slate-400">No open unreviewed pull requests. Excellent review throughput!</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase text-slate-400">
                      <tr>
                        <th className="px-5 py-3">Repository</th>
                        <th className="px-5 py-3">PR #</th>
                        <th className="px-5 py-3">Author</th>
                        <th className="px-5 py-3 text-right">Waiting Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {bottlenecksQuery.data.unreviewed_prs.map((pr) => (
                        <tr key={pr.id} className="hover:bg-slate-800/30">
                          <td className="px-5 py-3 font-semibold text-slate-300">{pr.repository_name}</td>
                          <td className="px-5 py-3 text-blue-400">#{pr.number}</td>
                          <td className="px-5 py-3 font-mono text-xs text-slate-400">@{pr.author_login || 'unknown'}</td>
                          <td className="px-5 py-3 text-right">
                            <span className="inline-block rounded-full bg-rose-950/60 border border-rose-800 px-2.5 py-0.5 text-xs font-semibold text-rose-300">
                              {pr.waiting_hours}h waiting
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Tab 5: Members & RBAC */}
      {activeTab === 'members' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Team Members & Access Control</h2>
              <p className="text-xs text-slate-400">
                Manage roles (Owner, Admin, Member, Viewer) with fine-grained access control.
              </p>
            </div>

            {/* Invite Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (inviteLogin) addMemberMutation.mutate();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="GitHub username"
                value={inviteLogin}
                onChange={(e) => setInviteLogin(e.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:border-blue-500 focus:outline-none font-mono"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                disabled={addMemberMutation.isPending || !inviteLogin}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {addMemberMutation.isPending ? 'Adding…' : '+ Add Member'}
              </button>
            </form>
          </div>

          {membersQuery.isLoading ? (
            <p className="text-slate-400 text-sm">Loading members…</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Joined</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(membersQuery.data ?? []).map((m) => (
                    <tr key={m.id} className="hover:bg-slate-800/30">
                      <td className="px-5 py-3.5 flex items-center gap-3">
                        {m.user.avatar_url && (
                          <img src={m.user.avatar_url} alt={m.user.login} className="h-8 w-8 rounded-full" />
                        )}
                        <div>
                          <p className="font-semibold text-slate-200">{m.user.name || m.user.login}</p>
                          <p className="text-xs font-mono text-slate-500">@{m.user.login}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <select
                          value={m.role}
                          onChange={(e) => roleUpdateMutation.mutate({ userId: m.user_id, role: e.target.value })}
                          disabled={m.role === 'owner'}
                          className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200 disabled:opacity-50"
                        >
                          <option value="owner" disabled>Owner</option>
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-400">
                        {new Date(m.joined_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {m.role !== 'owner' && (
                          <button
                            onClick={() => {
                              if (confirm(`Remove @${m.user.login} from organization?`)) {
                                removeMemberMutation.mutate(m.user_id);
                              }
                            }}
                            className="text-xs text-rose-400 hover:text-rose-300"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 6: Repositories */}
      {activeTab === 'repositories' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Linked Repositories</h2>
              <p className="text-xs text-slate-400">
                Repositories associated with this team for aggregated insights and rankings.
              </p>
            </div>

            {/* Link Repo selector */}
            <div className="flex items-center gap-2">
              <select
                value={selectedRepoId}
                onChange={(e) => setSelectedRepoId(e.target.value ? Number(e.target.value) : '')}
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select a repository to link…</option>
                {(userReposQuery.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name}
                  </option>
                ))}
              </select>
              <button
                disabled={!selectedRepoId || linkRepoMutation.isPending}
                onClick={() => {
                  if (selectedRepoId) linkRepoMutation.mutate(selectedRepoId);
                }}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {linkRepoMutation.isPending ? 'Linking…' : '+ Link Repo'}
              </button>
            </div>
          </div>

          {orgReposQuery.isLoading ? (
            <p className="text-slate-400 text-sm">Loading repositories…</p>
          ) : (orgReposQuery.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
              No repositories linked yet. Use the dropdown above to attach repositories.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(orgReposQuery.data ?? []).map((link) => (
                <div
                  key={link.id}
                  className="flex justify-between items-start rounded-xl border border-slate-800 bg-slate-900 p-4 hover:border-slate-700 transition-all"
                >
                  <div>
                    <h4 className="font-semibold text-slate-100">{link.repository.full_name}</h4>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                      {link.repository.description || 'No description'}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                      <span>{link.repository.language || 'Plain'}</span>
                      <span>★ {link.repository.stars}</span>
                      <span>Linked {new Date(link.added_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Unlink ${link.repository.full_name}?`)) {
                        unlinkRepoMutation.mutate(link.repository_id);
                      }
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300"
                  >
                    Unlink
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 7: Audit Logs */}
      {activeTab === 'audit' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Security & Audit Logs</h2>
              <p className="text-xs text-slate-400">
                Immutable event stream of administrative actions, role updates, and repository connections.
              </p>
            </div>

            <select
              value={auditActionFilter}
              onChange={(e) => setAuditActionFilter(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Actions</option>
              <option value="org.create">org.create</option>
              <option value="org.update">org.update</option>
              <option value="member.add">member.add</option>
              <option value="member.role_update">member.role_update</option>
              <option value="member.remove">member.remove</option>
              <option value="repo.link">repo.link</option>
              <option value="repo.unlink">repo.unlink</option>
            </select>
          </div>

          {auditQuery.isLoading ? (
            <p className="text-slate-400 text-sm">Loading audit trail…</p>
          ) : (auditQuery.data?.logs ?? []).length === 0 ? (
            <p className="text-slate-400 text-xs">No audit logs recorded for this filter.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">Action</th>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Resource</th>
                    <th className="px-5 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {auditQuery.data?.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="px-5 py-3 font-mono text-xs text-slate-400">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-950/50 text-blue-300 border border-blue-800/50">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-300 font-mono">
                        {log.user_login ? `@${log.user_login}` : 'System'}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-400 font-mono">
                        {log.resource_type}:{log.resource_id || '-'}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-400 font-mono truncate max-w-xs">
                        {log.details || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
