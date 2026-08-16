import { useEffect, useState } from 'react';
import { WSEvent } from '../lib/useWebSocket';

type NotificationItem = {
  id: string;
  message: string;
  time: string;
  read: boolean;
};

export function LiveNotificationBell({ isConnected, lastEvent }: { isConnected: boolean; lastEvent: WSEvent | null }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'init-1',
      message: 'Welcome to RepoHub Enterprise! Live sync & team analytics ready.',
      time: 'Just now',
      read: false,
    },
  ]);

  useEffect(() => {
    if (lastEvent && lastEvent.event === 'sync_completed') {
      const jobId = lastEvent.data?.job_id || Date.now();
      setNotifications(prev => {
        if (prev.some(n => n.id === `sync-${jobId}`)) return prev;
        return [
          {
            id: `sync-${jobId}`,
            message: lastEvent.data?.message || 'Repository sync completed successfully.',
            time: 'Just now',
            read: false,
          },
          ...prev,
        ];
      });
    }
  }, [lastEvent]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
        title={isConnected ? 'Live WebSocket Connected' : 'WebSocket Disconnected'}
      >
        {/* Bell SVG */}
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Real-time connection dot */}
        <span
          className={`absolute bottom-1 right-1 h-2 w-2 rounded-full border border-white dark:border-slate-900 ${
            isConnected ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'
          }`}
          title={isConnected ? 'Real-time WebSocket Connected' : 'Disconnected'}
        />

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 w-80 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in transition-colors duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-950/50">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">Live Notifications</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                    isConnected
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {isConnected ? 'LIVE' : 'OFFLINE'}
                </span>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={() => setNotifications(ns => ns.map(n => ({ ...n, read: true })))}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                >
                  Mark read
                </button>
              )}
            </div>

            <div className="max-h-72 divide-y divide-slate-100 dark:divide-slate-800/50 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">No notifications yet.</div>
              ) : (
                notifications.map(item => (
                  <div
                    key={item.id}
                    className={`p-3 transition-colors ${
                      item.read
                        ? 'bg-transparent'
                        : 'bg-blue-50/60 dark:bg-blue-950/20'
                    }`}
                  >
                    <p className="text-xs text-slate-800 dark:text-slate-200">{item.message}</p>
                    <span className="mt-1 block text-[10px] text-slate-400 dark:text-slate-500">{item.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

