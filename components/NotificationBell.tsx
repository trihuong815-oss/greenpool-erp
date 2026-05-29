'use client';

// Bell với badge đỏ đếm số thông báo chưa xem.
// Nguồn:
//  - Checklist v2 notifications chưa seen (nếu user là supervisor) → /api/checklist-v2/notifications?onlyUnseen=1
//  - Tasks pending_approval (nếu user là approver) → /api/tasks?mode=pending_approval
//  - Tasks mới assigned cho mình trong 7 ngày → /api/tasks?mode=assigned
// Tổng lại → badge đỏ trên chuông.

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import Link from 'next/link';

export function NotificationBell() {
  const [count, setCount] = useState<number>(0);
  const [linkTo, setLinkTo] = useState<string>('/cong-viec-ca-nhan');

  async function fetchCount() {
    let total = 0;
    let primaryLink = '/cong-viec-ca-nhan';
    // 1. Checklist v2 notifications chưa seen
    try {
      const res = await fetch('/api/checklist-v2/notifications?onlyUnseen=1', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        const unseen = Array.isArray(j.notifications) ? j.notifications.length : 0;
        if (unseen > 0) {
          total += unseen;
          primaryLink = '/checklist-v2';
        }
      }
    } catch { /* ignore */ }
    // 2. Tasks pending_approval (chỉ approver thấy)
    try {
      const res = await fetch('/api/tasks?mode=pending_approval', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        const arr = Array.isArray(j.rows) ? j.rows : [];
        if (arr.length > 0) {
          total += arr.length;
          if (primaryLink === '/cong-viec-ca-nhan') primaryLink = '/giao-viec';
        }
      }
    } catch { /* ignore */ }
    setCount(total);
    setLinkTo(primaryLink);
  }

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 60_000); // refresh mỗi phút
    // Cũng refresh khi tab quay foreground
    const onVis = () => { if (document.visibilityState === 'visible') fetchCount(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return (
    <Link
      href={linkTo}
      title={count > 0 ? `${count} thông báo chưa xem` : 'Thông báo'}
      className="relative rounded-lg p-2 text-emerald-100 hover:text-white hover:bg-white/10 transition"
    >
      <Bell size={18} />
      {count > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-emerald-700 shadow-sm"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
