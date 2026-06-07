// Phase UI-1 (2026-06-07): Badge base — status pill consistent.

import { type ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'brand';
export type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  tone?: BadgeTone;
  size?: BadgeSize;
  children: ReactNode;
  className?: string;
}

const TONE_CLS: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  error: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  brand: 'bg-emerald-600 text-white ring-emerald-700',
};

const SIZE_CLS: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
};

export function Badge({ tone = 'neutral', size = 'sm', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded font-medium ring-1',
        TONE_CLS[tone],
        SIZE_CLS[size],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
