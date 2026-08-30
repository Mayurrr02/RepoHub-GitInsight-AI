import React from 'react';

interface HealthScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showBar?: boolean;
}

export function getHealthTier(score: number): {
  label: 'Excellent' | 'Good' | 'Needs Attention' | 'Critical';
  color: string;
  badgeClass: string;
  barClass: string;
} {
  if (score >= 90) {
    return {
      label: 'Excellent',
      color: '#10B981',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/80 dark:text-emerald-400',
      barClass: 'bg-emerald-500 shadow-xs shadow-emerald-500/50',
    };
  }
  if (score >= 75) {
    return {
      label: 'Good',
      color: '#3B82F6',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:border-blue-800/80 dark:text-blue-400',
      barClass: 'bg-blue-500',
    };
  }
  if (score >= 50) {
    return {
      label: 'Needs Attention',
      color: '#F59E0B',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:border-amber-800/80 dark:text-amber-400',
      barClass: 'bg-amber-500',
    };
  }
  return {
    label: 'Critical',
    color: '#F43F5E',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:border-rose-800/80 dark:text-rose-400',
    barClass: 'bg-rose-500',
  };
}

export function HealthScoreBadge({ score, showBar = false }: HealthScoreBadgeProps) {
  const tier = getHealthTier(score);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono border uppercase tracking-wider ${tier.badgeClass}`}
        >
          {score} · {tier.label}
        </span>
      </div>
      {showBar && (
        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#182030] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${tier.barClass}`}
            style={{ width: `${Math.min(100, Math.max(5, score))}%` }}
          />
        </div>
      )}
    </div>
  );
}
