import { api } from './client';

export type ContributorRanking = {
  rank: number;
  login: string;
  avatar_url: string | null;
  name: string | null;
  commits: number;
  pull_requests: number;
  reviews: number;
  impact_score: number;
};

export type ContributorRankingsResponse = {
  organization_id: number;
  total_contributors: number;
  rankings: ContributorRanking[];
};

export type ProductivityPeriod = {
  period: string;
  commits: number;
  pull_requests_merged: number;
  active_contributors: number;
  velocity_score: number;
};

export type TeamProductivityResponse = {
  organization_id: number;
  total_commits: number;
  total_pull_requests_merged: number;
  average_weekly_commits: number;
  sprint_velocity: number;
  periods: ProductivityPeriod[];
};

export type UnreviewedPR = {
  id: number;
  repository_name: string;
  number: number;
  author_login: string | null;
  state: string;
  created_at: string;
  waiting_hours: number;
};

export type ReviewBottlenecksResponse = {
  organization_id: number;
  average_review_time_hours: number;
  average_merge_time_hours: number;
  unreviewed_pr_count: number;
  total_open_prs: number;
  unreviewed_prs: UnreviewedPR[];
  reviewer_workload: { login: string; reviews_completed: number }[];
};

export type TeamSummaryResponse = {
  organization_id: number;
  name: string;
  slug: string;
  repositories_count: number;
  members_count: number;
  health_score: number;
  activity_score: number;
  merge_rate: number;
  issue_resolution_rate: number;
};

export async function getTeamOverview(orgId: number): Promise<TeamSummaryResponse> {
  const { data } = await api.get(`/organizations/${orgId}/analytics/overview`);
  return data;
}

export async function getContributorRankings(orgId: number): Promise<ContributorRankingsResponse> {
  const { data } = await api.get(`/organizations/${orgId}/analytics/rankings`);
  return data;
}

export async function getTeamProductivity(orgId: number, weeks: number = 12): Promise<TeamProductivityResponse> {
  const { data } = await api.get(`/organizations/${orgId}/analytics/productivity`, { params: { weeks } });
  return data;
}

export async function getReviewBottlenecks(orgId: number): Promise<ReviewBottlenecksResponse> {
  const { data } = await api.get(`/organizations/${orgId}/analytics/bottlenecks`);
  return data;
}
