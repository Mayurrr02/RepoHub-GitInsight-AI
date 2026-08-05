import axios from 'axios';
import { useAuth } from '../store/auth';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1' });
api.interceptors.request.use((config) => { const token = useAuth.getState().accessToken; if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
