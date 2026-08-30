import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  isLoading?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  actionText,
  onAction,
  isLoading,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0a0e18]/40">
      {icon && (
        <div className="p-3 rounded-2xl bg-purple-50 text-purple-600 dark:bg-brand-purple/10 dark:text-purple-400 mb-3.5">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm leading-relaxed">
        {description}
      </p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          disabled={isLoading}
          className="mt-4 rounded-xl bg-brand-purple hover:bg-purple-600 disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold shadow-glow-purple transition cursor-pointer"
        >
          {isLoading ? 'Processing...' : actionText}
        </button>
      )}
    </div>
  );
}
