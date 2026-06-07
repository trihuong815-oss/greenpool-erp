// Phase UI-1 (2026-06-07): Card base component với padding variants.
// Thay cho `<div className="rounded-xl border border-slate-200 bg-white shadow-sm p-...">` inline.

import { type HTMLAttributes, type ReactNode } from 'react';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';
type CardElevation = 'flat' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  elevation?: CardElevation;
  interactive?: boolean; // hover effect (clickable card)
}

const PAD_CLS: Record<CardPadding, string> = {
  none: '',
  sm: 'p-2 sm:p-3',
  md: 'p-3 sm:p-4 md:p-5',
  lg: 'p-4 sm:p-5 md:p-6',
};

const ELEVATION_CLS: Record<CardElevation, string> = {
  flat: '',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
};

export function Card({
  padding = 'md',
  elevation = 'sm',
  interactive = false,
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        'rounded-xl border border-slate-200 bg-white',
        PAD_CLS[padding],
        ELEVATION_CLS[elevation],
        interactive ? 'transition hover:border-emerald-300 hover:shadow-md cursor-pointer' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-3 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-base sm:text-lg font-semibold text-slate-900 ${className}`}>{children}</h3>;
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
