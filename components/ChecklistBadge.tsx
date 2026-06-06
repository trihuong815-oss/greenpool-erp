'use client';

// Phase 13.13: badge ở sidebar mục "Checklist vận hành".
// Số = checklist notifications chưa seen (supervisor) — đồng bộ với chuông + app badge OS.

import { useNotiCounts } from '@/lib/hooks/use-noti-counts';

export function ChecklistBadge() {
  const { checklist } = useNotiCounts();
  if (checklist <= 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-emerald-600 text-white">
      {checklist > 99 ? '99+' : checklist}
    </span>
  );
}
