'use client';

// V6.4 (2026-06-13): Badge "Điều phối công việc" sidebar.
// Count = kind='assignment' chờ tôi (approval + assigned mode) — Action Required only.

import { useNotiCounts } from '@/lib/hooks/use-noti-counts';

export function DispatchBadge() {
  const { dispatch } = useNotiCounts();
  if (dispatch <= 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold tabular-nums">
      {dispatch > 99 ? '99+' : dispatch}
    </span>
  );
}
