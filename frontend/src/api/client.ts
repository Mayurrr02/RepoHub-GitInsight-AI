import axios from 'axios';
import { useAuth } from '../store/auth';

const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    const clean = envUrl.trim().replace(/\/+$/, '');
    if (clean.endsWith('/api/v1')) return clean;
    return `${clean}/api/v1`;
  }

  // Auto-detect Render deployment environment if VITE_API_URL wasn't populated during build
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname.endsWith('.onrender.com')) {
      const apiHost = hostname.replace(/-web(?=\.onrender\.com$)/, '-api');
      return `https://${apiHost}/api/v1`;
    }
  }

  return 'http://localhost:8000/api/v1';
};

export const api = axios.create({ baseURL: getApiBaseUrl() });

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = useAuth.getState().refreshToken;
      if (!refreshToken) {
        isRefreshing = false;
        useAuth.getState().logout();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refresh_token: refreshToken });
        useAuth.getState().setTokens(data.access_token, data.refresh_token);
        processQueue(null, data.access_token);
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        useAuth.getState().logout();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

