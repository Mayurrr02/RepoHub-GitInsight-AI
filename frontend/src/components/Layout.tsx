import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
export function Layout() {
  const logout = useAuth(s => s.logout); const navigate = useNavigate();
  return <div className="min-h-screen"><header className="border-b border-slate-800 px-6 py-4 flex justify-between"><Link to="/" className="font-bold text-xl">RepoHub</Link><nav className="flex gap-4 text-slate-300"><Link to="/">Repositories</Link><Link to="/analytics">Analytics</Link><Link to="/intelligence">AI</Link><Link to="/profile">Profile</Link><button onClick={() => { logout(); navigate('/login'); }}>Log out</button></nav></header><main className="mx-auto max-w-6xl p-6"><Outlet /></main></div>;
}
