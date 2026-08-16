import { api } from './client';

export interface UserStats {
  total_repositories: number;
  public_repositories: number;
  private_repositories: number;
  total_commits: number;
  total_organizations: number;
  coding_streak: number;
  review_score: number;
}

export interface GitHubAccountInfo {
  connected: boolean;
  github_id: number | null;
  scope: string | null;
  scopes_list: string[];
}

export interface UserProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  stats: UserStats;
  github_account: GitHubAccountInfo;
}

export interface ApiKeyItem {
  id: number;
  name: string;
  prefix: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}

export interface ApiKeyCreated {
  id: number;
  name: string;
  prefix: string;
  raw_key: string;
  created_at: string;
  expires_at: string | null;
}

export const getUserProfile = (): Promise<UserProfile> =>
  api.get<UserProfile>('/users/me/profile').then((r) => r.data);

export const getApiKeys = (): Promise<ApiKeyItem[]> =>
  api.get<ApiKeyItem[]>('/users/me/api-keys').then((r) => r.data);

export const createApiKey = (data: { name: string; expires_in_days?: number }): Promise<ApiKeyCreated> =>
  api.post<ApiKeyCreated>('/users/me/api-keys', data).then((r) => r.data);

export const revokeApiKey = (keyId: number): Promise<void> =>
  api.delete(`/users/me/api-keys/${keyId}`).then(() => undefined);
