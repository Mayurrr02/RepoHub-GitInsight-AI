import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WSEvent } from '../lib/useWebSocket';

export function RealtimeSyncToast({ lastEvent }: { lastEvent: WSEvent | null }) {
  const queryClient = useQueryClient();
  const [syncState, setSyncState] = useState<{
    visible: boolean;
    progress: number;
    step: string;
    status: 'idle' | 'running' | 'completed' | 'failed';
  }>({
    visible: false,
    progress: 0,
    step: '',
    status: 'idle',
  });

  useEffect(() => {
    if (!lastEvent) return;

    if (lastEvent.event === 'sync_progress') {
      setSyncState({
        visible: true,
        progress: lastEvent.data?.progress || 10,
        step: lastEvent.data?.step || 'Syncing GitHub repositories...',
        status: 'running',
      });
    } else if (lastEvent.event === 'sync_completed') {
      setSyncState({
        visible: true,
        progress: 100,
        step: lastEvent.data?.message || 'Sync completed successfully!',
        status: 'completed',
      });

      // Automatically invalidate queries to refresh all UI tables and charts
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
      queryClient.invalidateQueries({ queryKey: ['developer'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['repo-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['team-overview'] });
      queryClient.invalidateQueries({ queryKey: ['rankings'] });

      const timer = setTimeout(() => {
        setSyncState(s => ({ ...s, visible: false }));
      }, 5000);
      return () => clearTimeout(timer);
    } else if (lastEvent.event === 'sync_failed') {
      setSyncState({
        visible: true,
        progress: 100,
        step: `Sync failed: ${lastEvent.data?.error || 'Unknown error'}`,
        status: 'failed',
      });
      const timer = setTimeout(() => {
        setSyncState(s => ({ ...s, visible: false }));
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [lastEvent, queryClient]);

  if (!syncState.visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 rounded-xl border border-slate-700/80 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {syncState.status === 'running' && (
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500"></span>
            </span>
          )}
          {syncState.status === 'completed' && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-xs text-emerald-400 font-bold">
              ✓
            </span>
          )}
          {syncState.status === 'failed' && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/20 text-xs text-rose-400 font-bold">
              ✕
            </span>
          )}
          <span className="text-sm font-semibold text-slate-200">
            {syncState.status === 'running' && 'Live Synchronization'}
            {syncState.status === 'completed' && 'Synchronization Complete'}
            {syncState.status === 'failed' && 'Synchronization Failed'}
          </span>
        </div>
        <span className="text-xs font-mono text-slate-400">{syncState.progress}%</span>
      </div>

      <p className="mt-2 text-xs text-slate-300 line-clamp-2">{syncState.step}</p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full transition-all duration-500 ease-out rounded-full ${
            syncState.status === 'completed'
              ? 'bg-emerald-500'
              : syncState.status === 'failed'
              ? 'bg-rose-500'
              : 'bg-blue-500'
          }`}
          style={{ width: `${syncState.progress}%` }}
        />
      </div>
    </div>
  );
}
