// PR-TK1 (2026-06-21) — Loading / Error / Empty states cho /tong-ket.
// Tách từ TongKetClient.tsx — giữ nguyên markup + text.
// PR-TK4D (2026-06-22) — EmptyState nhận scope/roleCode → message per role.

import { SkeletonKpiGrid, SkeletonCard } from '@/components/ui/Skeleton';
import type { ScopeRole } from '@/lib/sales-v2/scope';
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

// PR-TK4D: message theo persona, giữ visual identical (📭 + fmtMonth)
function emptyMessageForRole(scope?: ScopeRole, roleCode?: string): string {
  if (roleCode === 'TP_GS') return 'Chưa có dữ liệu để giám sát trong tháng này.';
  if (scope === 'sale') return 'Bạn chưa có giao dịch nào trong tháng này.';
  if (scope === 'qlcs') return 'Cơ sở chưa có giao dịch được duyệt trong tháng này.';
  // top, accountant (NV_KE/TP_KE), default
  return 'Chưa có dữ liệu doanh số được duyệt trong tháng này.';
}

interface EmptyStateProps {
  month: string;
  scope?: ScopeRole;
  roleCode?: string;
}

export function EmptyState({ month, scope, roleCode }: EmptyStateProps) {
  return (
    <div className="card text-center py-16 text-slate-400">
      <div className="text-5xl mb-3">📭</div>
      <div className="text-base font-medium text-slate-600">
        {emptyMessageForRole(scope, roleCode)}
      </div>
      <div className="text-sm mt-1.5">
        Tháng {fmtMonth(month)} · Dashboard chỉ tính dữ liệu đã được kế toán duyệt chính thức.
      </div>
    </div>
  );
}
