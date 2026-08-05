import { api } from './client';
export type Repository = { id: number; name: string; full_name: string; html_url: string; description: string | null; is_private: boolean; language: string | null; stars: number; updated_at: string | null };
export const getRepositories = () => api.get<Repository[]>('/repositories').then(r => r.data);
export const syncRepositories = () => api.post('/repositories/sync').then(r => r.data);
export const getMe = () => api.get<{login:string; name:string|null; avatar_url:string|null}>('/users/me').then(r => r.data);
