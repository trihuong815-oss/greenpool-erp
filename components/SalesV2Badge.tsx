'use client';

// Badge sidebar cho menu Doanh số v2.
// kind='submit' → Sale: count batch returned cần sửa (sales_batch_returned)
// kind='review' → Kế toán/TP_KE: count batch pending cần đối chiếu (sales_batch_submitted)
// 2026-06-17 — Phase 3.3 wire V6.5 notification.

import { useNotiCounts } from '@/lib/hooks/use-noti-counts';

interface Props {
  kind: 'submit' | 'review';
}

export function SalesV2Badge({ kind }: Props) {
  const { salesSubmit, salesReview } = useNotiCounts();
  const count = kind === 'submit' ? salesSubmit : salesReview;
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  );
}
