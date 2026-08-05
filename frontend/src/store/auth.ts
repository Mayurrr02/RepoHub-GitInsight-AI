import { create } from 'zustand';

type AuthState = { accessToken: string | null; refreshToken: string | null; setTokens: (access: string, refresh: string) => void; logout: () => void };
export const useAuth = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('accessToken'), refreshToken: localStorage.getItem('refreshToken'),
  setTokens: (accessToken, refreshToken) => { localStorage.setItem('accessToken', accessToken); localStorage.setItem('refreshToken', refreshToken); set({ accessToken, refreshToken }); },
  logout: () => { localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); set({ accessToken: null, refreshToken: null }); },
}));
