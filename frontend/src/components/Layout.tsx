import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useWebSocket } from '../lib/useWebSocket';
import { useThemeStore } from '../store/theme';
import { LiveNotificationBell } from './LiveNotificationBell';
import { RealtimeSyncToast } from './RealtimeSyncToast';

export function Layout() {
  const logout = useAuth(s => s.logout);
  const navigate = useNavigate();
  const { isConnected, lastEvent } = useWebSocket();
  const { resolvedTheme, toggleTheme } = useThemeStore();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
      isActive
        ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white font-semibold shadow-xs'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-900'
    }`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors duration-200">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 dark:border-slate-800/80 dark:bg-slate-950/80 backdrop-blur-md px-6 py-3.5 transition-colors duration-200">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-bold text-white shadow-md shadow-blue-600/30">
                RH
              </div>
              <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">
                RepoHub
              </span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800/60 font-semibold tracking-wider">
                Enterprise
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <NavLink to="/" end className={navLinkClass}>
                Repositories
              </NavLink>
              <NavLink to="/analytics" className={navLinkClass}>
                Developer Analytics
              </NavLink>
              <NavLink to="/organizations" className={navLinkClass}>
                Teams & Orgs
              </NavLink>
              <NavLink to="/intelligence" className={navLinkClass}>
                AI Intelligence
              </NavLink>
              <NavLink to="/profile" className={navLinkClass}>
                Profile
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Quick Header Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
              title={resolvedTheme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              aria-label="Toggle theme"
            >
              {resolvedTheme === 'dark' ? (
                /* Sun Icon */
                <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                /* Moon Icon */
                <svg className="h-4 w-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            <LiveNotificationBell isConnected={isConnected} lastEvent={lastEvent} />

            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl flex-1 w-full p-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-900 py-4 text-center text-xs text-slate-500">
        RepoHub Enterprise · Real-time Analytics & Observability
      </footer>

      {/* Global Real-time Sync Toast */}
      <RealtimeSyncToast lastEvent={lastEvent} />
    </div>
  );
}

