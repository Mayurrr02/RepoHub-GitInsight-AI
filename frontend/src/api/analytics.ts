import { api } from './client';
export type Developer = { commit_frequency:number; coding_streak:number; average_commits_per_day:number; coding_hours:number; weekend_activity:number; review_score:number; languages:{name:string; percent:number}[] };
export type RepoMetric = { repository_id:number; name:string; merge_rate:number; issue_resolution_rate:number; health_score:number; activity_score:number; documentation_score:number; maintenance_score:number };
export const getDeveloper = () => api.get<Developer>('/analytics/developer').then(r => r.data);
export const getRepoMetrics = () => api.get<RepoMetric[]>('/analytics/repository').then(r => r.data);
export const getHistory = () => api.get<{commits:{date:string; commits:number}[],languages:{name:string;percent:number}[]}>('/analytics/history').then(r => r.data);
