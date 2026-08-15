import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useWebSocket } from '../lib/useWebSocket';
import { LiveNotificationBell } from './LiveNotificationBell';
import { RealtimeSyncToast } from './RealtimeSyncToast';

export function Layout() {
  const logout = useAuth(s => s.logout);
  const navigate = useNavigate();
  const { isConnected, lastEvent } = useWebSocket();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
      isActive
        ? 'bg-slate-800 text-white font-semibold'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-bold text-white shadow-lg shadow-blue-600/30">
                RH
              </div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                RepoHub
              </span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60 font-semibold tracking-wider">
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

          <div className="flex items-center gap-3">
            <LiveNotificationBell isConnected={isConnected} lastEvent={lastEvent} />
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl flex-1 w-full p-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500">
        RepoHub Enterprise · Real-time Analytics & Observability
      </footer>

      {/* Global Real-time Sync Toast */}
      <RealtimeSyncToast lastEvent={lastEvent} />
    </div>
  );
}
