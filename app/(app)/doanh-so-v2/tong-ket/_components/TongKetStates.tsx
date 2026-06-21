// PR-TK1 (2026-06-21) — Loading / Error / Empty states cho /tong-ket.
// Tách từ TongKetClient.tsx — giữ nguyên markup + text.

import { SkeletonKpiGrid, SkeletonCard } from '@/components/ui/Skeleton';
import { fmtMonth } from './utils';

export function LoadingState() {
  return (
    <div className="space-y-3">
      <SkeletonKpiGrid count={5} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return <div className="card text-center py-12 text-rose-600 text-sm">⚠️ {message}</div>;
}

export function EmptyState({ month }: { month: string }) {
  return (
    <div className="card text-center py-16 text-slate-400">
      <div className="text-5xl mb-3">📭</div>
      <div className="text-base font-medium text-slate-600">
        Tháng {fmtMonth(month)} chưa có giao dịch nào đã đối chiếu
      </div>
      <div className="text-sm mt-1.5">
        Dashboard chỉ tính dữ liệu đã được kế toán duyệt chính thức.
      </div>
    </div>
  );
}
