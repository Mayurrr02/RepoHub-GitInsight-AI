import { api } from './client';

export type Repository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  is_private: boolean;
  language: string | null;
  stars: number;
  updated_at: string | null;
};

export type CommitSummary = {
  sha: string;
  message: string;
  author_login: string | null;
  committed_at: string | null;
};

export type ContributorSummary = {
  login: string;
  contributions: number;
};

export type LanguageSummary = {
  name: string;
  bytes: number;
  percent: number;
};

export type MetricSummary = {
  health_score: number;
  activity_score: number;
  maintenance_score: number;
  documentation_score: number;
  merge_rate: number;
  issue_resolution_rate: number;
};

export type RepositoryDetail = {
  id: number;
  github_id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  description: string | null;
  is_private: boolean;
  language: string | null;
  stars: number;
  updated_at: string | null;
  total_commits: number;
  open_prs: number;
  merged_prs: number;
  closed_prs: number;
  total_prs: number;
  open_issues: number;
  closed_issues: number;
  total_issues: number;
  metrics: MetricSummary;
  languages: LanguageSummary[];
  top_contributors: ContributorSummary[];
  recent_commits: CommitSummary[];
};

export const getRepositories = () => api.get<Repository[]>('/repositories').then(r => r.data);
export const getRepositoryDetail = (id: number) => api.get<RepositoryDetail>(`/repositories/${id}`).then(r => r.data);
export const syncRepositories = () => api.post('/repositories/sync').then(r => r.data);
export const getMe = () => api.get<{ login: string; name: string | null; avatar_url: string | null }>('/users/me').then(r => r.data);

