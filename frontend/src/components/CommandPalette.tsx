import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  OverviewIcon,
  RepositoriesIcon,
  AnalyticsIcon,
  ActivityIcon,
  IntelligenceIcon,
  ReportsIcon,
  SettingsIcon,
  SearchIcon,
  TeamIcon,
} from './icons/Icons';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          setQuery('');
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      title: 'Overview Dashboard',
      category: 'Views',
      icon: <OverviewIcon className="h-4 w-4 text-purple-500" />,
      run: () => {
        navigate('/');
        onClose();
      },
    },
    {
      title: 'Repositories Explorer',
      category: 'Views',
      icon: <RepositoriesIcon className="h-4 w-4 text-blue-500" />,
      run: () => {
        navigate('/repositories');
        onClose();
      },
    },
    {
      title: 'Engineering Analytics & Velocity',
      category: 'Views',
      icon: <AnalyticsIcon className="h-4 w-4 text-cyan-500" />,
      run: () => {
        navigate('/analytics');
        onClose();
      },
    },
    {
      title: 'AI Intelligence Assistant',
      category: 'AI',
      icon: <IntelligenceIcon className="h-4 w-4 text-purple-500" />,
      run: () => {
        navigate('/intelligence');
        onClose();
      },
    },
    {
      title: 'Activity Feed & Events',
      category: 'Views',
      icon: <ActivityIcon className="h-4 w-4 text-amber-500" />,
      run: () => {
        navigate('/activity');
        onClose();
      },
    },
    {
      title: 'Team & Organizations',
      category: 'Views',
      icon: <TeamIcon className="h-4 w-4 text-emerald-500" />,
      run: () => {
        navigate('/team');
        onClose();
      },
    },
    {
      title: 'Engineering Reports & PDF',
      category: 'Reports',
      icon: <ReportsIcon className="h-4 w-4 text-emerald-500" />,
      run: () => {
        navigate('/reports');
        onClose();
      },
    },
    {
      title: 'Settings & API Keys',
      category: 'Settings',
      icon: <SettingsIcon className="h-4 w-4 text-slate-400" />,
      run: () => {
        navigate('/settings');
        onClose();
      },
    },
  ];

  const filtered = actions.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-md animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] shadow-2xl overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-white/[0.08] px-4 py-3.5 bg-slate-50 dark:bg-[#080B12]">
          <SearchIcon className="h-5 w-5 text-slate-400" />
          <input
            autoFocus
            type="text"
            placeholder="Search repositories, metrics, commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
          />
          <kbd className="rounded border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800/80 px-2 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 shadow-xs">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length > 0 ? (
            filtered.map((item, index) => (
              <button
                key={index}
                onClick={item.run}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 group-hover:border-slate-300 dark:group-hover:border-slate-700">
                    {item.icon}
                  </div>
                  <span>{item.title}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {item.category}
                </span>
              </button>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-slate-400">
              No matching commands or pages found.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#05070B] px-4 py-2 text-[11px] text-slate-500">
          <span>Click or press Enter to navigate</span>
          <span className="font-mono text-[10px]">RepoHub Command Center</span>
        </div>
      </div>
    </div>
  );
}
