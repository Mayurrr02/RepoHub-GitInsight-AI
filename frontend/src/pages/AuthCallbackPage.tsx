import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/auth';
export function AuthCallbackPage() { const [params] = useSearchParams(); const navigate = useNavigate(); const setTokens = useAuth(s => s.setTokens); useEffect(() => { const access = params.get('access_token'), refresh = params.get('refresh_token'); if (access && refresh) { setTokens(access, refresh); navigate('/'); } else navigate('/login'); }, [params, navigate, setTokens]); return <p className="p-8">Finishing sign-in…</p>; }
