'use client';

// Phase 13.13: badge ở sidebar mục "Kỹ thuật vận hành".
// Số = kt_proposal + kt_task (techWork tổng) — đồng bộ với chuông + app badge OS.

import { useNotiCounts } from '@/lib/hooks/use-noti-counts';

export function TechWorkBadge() {
  const { techWork } = useNotiCounts();
  if (techWork <= 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-violet-600 text-white">
      {techWork > 99 ? '99+' : techWork}
    </span>
  );
}
