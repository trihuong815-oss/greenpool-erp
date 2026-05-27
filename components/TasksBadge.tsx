'use client';

import { useEffect, useState } from 'react';

// Badge nhỏ hiển thị count task cần chú ý.
// - GD/CEO: count pending_approval (cần duyệt)
// - Khác: count assigned chưa hoàn thành (Đang làm + Chờ làm) — show nếu > 0
// Tự refresh mỗi 60s. Khi user click vào trang giao-viec sẽ thấy chi tiết.

interface Props { roleCode: string; }

const GD_OR_CEO = new Set(['CEO', 'GD_KD', 'GD_VP']);

export function TasksBadge({ roleCode }: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const isApprover = GD_OR_CEO.has(roleCode);
        const mode = isApprover ? 'pending_approval' : 'assigned';
        const url = `/api/tasks?mode=${mode}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) { if (!cancelled) setCount(null); return; }
        const j = await res.json();
        const rows = Array.isArray(j?.rows) ? j.rows : [];
        const n = isApprover
          ? rows.length
          : rows.filter((r: any) => r.status === 'pending' || r.status === 'in_progress').length;
        if (!cancelled) setCount(n);
      } catch {
        if (!cancelled) setCount(null);
      }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [roleCode]);

  if (count === null || count === 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  );
}
