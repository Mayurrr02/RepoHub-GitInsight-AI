import { useState } from 'react';
import { api } from '../api/client';
export function LoginPage() {
  const [error, setError] = useState('');
  const login = async () => { try { const { data } = await api.post('/auth/github/login'); window.location.assign(data.authorization_url); } catch { setError('GitHub sign-in is unavailable. Check the API configuration.'); } };
  return <main className="min-h-screen grid place-items-center p-6"><section className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8"><h1 className="text-3xl font-bold">RepoHub</h1><p className="mt-2 text-slate-400">Your GitHub repositories, in one place.</p>{error && <p className="mt-4 text-red-400">{error}</p>}<button onClick={login} className="mt-7 w-full rounded bg-white px-4 py-3 font-medium text-slate-900">Continue with GitHub</button></section></main>;
}
