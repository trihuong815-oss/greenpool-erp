// Phase UI-2.2 (2026-06-07): Skeleton loader components.
// Thay <Loader2 spinner /> bằng skeleton → perceived performance tốt hơn (user thấy
// shape của content trước khi load xong → cảm giác "đang đến", không phải "đứng yên").
//
// Pattern: Apple SF Skeleton, Material Skeleton, Tailwind animate-pulse base.

import { type HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Width — Tailwind class (vd 'w-32') hoặc inline. Default w-full. */
  width?: string;
  /** Height — Tailwind class (vd 'h-4'). Default h-4. */
  height?: string;
  /** Variant: rectangular (default), circular (avatar), text (rounded sm) */
  variant?: 'rect' | 'circle' | 'text';
}

/**
 * Skeleton primitive — animated pulsing rectangle.
 * Compose nhiều Skeleton → mock layout của content thật.
 */
export function Skeleton({
  width = 'w-full',
  height = 'h-4',
  variant = 'rect',
  className = '',
  ...rest
}: SkeletonProps) {
  const radius = variant === 'circle' ? 'rounded-full' : variant === 'text' ? 'rounded-sm' : 'rounded-md';
  return (
    <div
      className={`bg-slate-200 animate-pulse ${radius} ${width} ${height} ${className}`}
      aria-hidden
      {...rest}
    />
  );
}

/**
 * SkeletonCard — pre-composed card với header + body, dùng cho list loading state.
 */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" width="w-10" height="h-10" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="w-32" height="h-3" />
          <Skeleton variant="text" width="w-20" height="h-2" />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} variant="text" width={i === lines - 1 ? 'w-3/4' : 'w-full'} height="h-3" />
        ))}
      </div>
    </div>
  );
}

/**
 * SkeletonList — N SkeletonCard cho task list / message list.
 */
export function SkeletonList({ count = 5, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  );
}

/**
 * SkeletonTable — bảng N row × M col cho list view.
 */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-full">
        {/* Header */}
        <div className="grid gap-3 py-3 border-b border-slate-200" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} variant="text" width="w-20" height="h-3" />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-3 py-3 border-b border-slate-100" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} variant="text" height="h-4" width={c === 0 ? 'w-3/4' : 'w-full'} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * SkeletonKpiCard — 2-3 KPI tiles cho dashboard loading state.
 */
export function SkeletonKpiGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <Skeleton variant="text" width="w-20" height="h-2" />
          <Skeleton width="w-3/4" height="h-7" />
          <Skeleton variant="text" width="w-16" height="h-2" />
        </div>
      ))}
    </div>
  );
}
