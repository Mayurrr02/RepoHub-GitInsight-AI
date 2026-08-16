import { useState } from 'react';
import { api } from '../api/client';
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
      if (detail) {
        setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
      } else if (err.message === 'Network Error') {
        setError(`Unable to connect to the backend API at ${api.defaults.baseURL}. Please verify that the API service is running and accessible.`);
      } else if (status === 503) {
        setError('GitHub sign-in is not yet configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in the deployment environment variables.');
      } else {
        setError(err.message || 'GitHub sign-in is unavailable. Check the API configuration.');
      }
    }
  };

  const isConfigError = error.includes('GITHUB_CLIENT_ID') || error.includes('not configured') || error.includes('environment variables');

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 selection:bg-blue-500 selection:text-white transition-colors duration-200">
      <div className="w-full max-w-md">
        {/* Top Right Theme Toggle */}
        <div className="flex justify-end mb-3">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs"
            title={resolvedTheme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {resolvedTheme === 'dark' ? (
              <>
                <svg className="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span>Dark Mode</span>
              </>
            )}
          </button>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 backdrop-blur-xl p-8 shadow-2xl transition-colors duration-200">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
              <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">RepoHub</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Engineering Intelligence & Repository Analytics</p>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sign in to your account</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Connect your GitHub account to sync repositories, inspect commit velocity, and monitor team health.
            </p>
          </div>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200 p-4 text-sm">
              <div className="flex items-start gap-2.5">
                <svg className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1 text-xs leading-relaxed">
                  <span className="font-semibold block text-red-800 dark:text-red-300 mb-1">Sign-In Notice</span>
                  {error}
                </div>
              </div>

              {isConfigError && (
                <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-500/20 text-[11px] text-slate-600 dark:text-slate-300">
                  <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">Required Render Environment Variables:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                    <li>GITHUB_CLIENT_ID</li>
                    <li>GITHUB_CLIENT_SECRET</li>
                    <li>GITHUB_REDIRECT_URI (optional, auto-detected)</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          <button
            onClick={login}
            disabled={isLoading}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-5 py-3.5 font-medium shadow-lg transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <>
                <svg className="h-5 w-5 animate-spin text-current" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Connecting to GitHub...</span>
              </>
            ) : (
              <>
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>Continue with GitHub</span>
              </>
            )}
          </button>

          <p className="mt-5 text-center text-xs text-slate-500">
            By signing in, you grant access to read public & private repository metadata for productivity insights.
          </p>
        </section>
      </div>
    </main>
  );
}
