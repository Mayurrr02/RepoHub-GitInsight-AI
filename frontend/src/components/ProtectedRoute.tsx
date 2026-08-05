import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../store/auth';
export function ProtectedRoute() { return useAuth(s => s.accessToken) ? <Outlet /> : <Navigate to="/login" replace />; }
