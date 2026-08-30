import React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800/80 ${className}`}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-brand-border dark:bg-brand-card p-5 space-y-3 shadow-card-light dark:shadow-card-dark">
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-4" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-36" />
      <Skeleton className="h-8 w-full mt-3" />
    </div>
  );
}
