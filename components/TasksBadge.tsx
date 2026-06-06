'use client';

// Phase 13.13: dùng useNotiCounts (source-of-truth chung) để đồng bộ với chuông + app badge OS.
// Count = tasksApproval + tasksAssigned (gộp cả 2, cho mọi role) — khớp với section
// "Đề xuất / Giao việc chờ duyệt" + "Nhiệm vụ chờ tôi" trong dropdown chuông.

import { useNotiCounts } from '@/lib/hooks/use-noti-counts';

// roleCode giữ làm prop để Sidebar không phải đổi callsite; KHÔNG dùng nội bộ (mọi role chung công thức).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TasksBadge({ roleCode: _roleCode }: { roleCode: string }) {
  const { tasks } = useNotiCounts();
  if (tasks <= 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold tabular-nums">
      {tasks > 99 ? '99+' : tasks}
    </span>
  );
}
