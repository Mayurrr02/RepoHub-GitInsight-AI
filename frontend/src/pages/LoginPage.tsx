import React, { useState } from 'react';
import { api } from '../api/client';
import { RepoHubLogo, GitHubIcon } from '../components/icons/Icons';
import { useThemeStore } from '../store/theme';

export function LoginPage() {
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { resolvedTheme, toggleTheme } = useThemeStore();

  const login = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/github/login');
      if (data?.authorization_url) {
        window.location.assign(data.authorization_url);
      } else {
        setError('Received an invalid authorization URL from the server.');
        setIsLoading(false);
      }
    } catch (err: any) {
      setIsLoading(false);
      const detail = err.response?.data?.detail;
      const status = err.response?.status;
      if (status === 405) {
        setError('Received 405 Method Not Allowed. Please ensure VITE_API_URL in Vercel is set to your Railway backend URL (e.g. https://your-app.up.railway.app) and redeployed.');
      } else if (detail) {
        setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
      } else if (err.message === 'Network Error') {
        setError(`Unable to reach the RepoHub backend API. Please ensure the backend server is running.`);
      } else if (status === 503) {
        setError('GitHub OAuth client credentials are not configured in backend environment.');
      } else {
        setError(err.message || 'GitHub sign-in is unavailable.');
      }
    }
  };

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-slate-50 text-slate-900 dark:bg-[#05070B] dark:text-slate-100 selection:bg-brand-purple/30 selection:text-white relative overflow-hidden transition-colors duration-150">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-brand-purple/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[450px] h-[450px] bg-brand-blue/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top right theme toggle */}
      <div className="absolute top-6 right-6">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 dark:border-white/[0.08] dark:bg-[#0D111A] dark:text-slate-300 dark:hover:bg-white/[0.06] px-3 py-1.5 text-xs transition-colors shadow-xs cursor-pointer"
        >
          {resolvedTheme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      <div className="w-full max-w-md relative z-10">
        <section className="rounded-3xl border border-slate-200 bg-white/90 dark:border-white/[0.08] dark:bg-[#0D111A]/90 backdrop-blur-2xl p-8 shadow-2xl space-y-6 transition-colors">
          {/* Brand Header */}
          <div className="flex items-center gap-3">
            <RepoHubLogo className="h-10 w-10" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">RepoHub</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Engineering Observability & GitHub Intelligence</p>
            </div>
          </div>

          <div className="pt-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Sign in with GitHub</h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Connect your authorized GitHub account to synchronize repositories, track commit velocity, and monitor developer scores.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300 p-4 text-xs space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <span>⚠️</span>
                <span>Connection Notice</span>
              </div>
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          {/* GitHub Sign In Button */}
          <button
            onClick={login}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-brand-purple hover:bg-purple-600 text-white px-5 py-3.5 font-medium shadow-glow-purple transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer text-sm"
          >
            {isLoading ? (
              <span className="animate-pulse">Connecting to GitHub OAuth...</span>
            ) : (
              <>
                <GitHubIcon className="h-5 w-5" />
                <span>Continue with GitHub</span>
              </>
            )}
          </button>

          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 leading-normal">
            Requires GitHub OAuth authorization. Live data is synchronized securely from GitHub APIs.
          </p>
        </section>
      </div>
    </main>
  );
}
