// PR-CASH1D (2026-06-23) — Server bootstrap UI Báo cáo thu-chi ngày.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { isBranchId, type BranchId } from '@/lib/branches';
import { AppTopBar } from '@/components/AppTopBar';
import BaoCaoThuChiClient from './BaoCaoThuChiClient';

export const dynamic = 'force-dynamic';

// Roles được xem toàn hệ thống (CÓ thể chọn cơ sở) + xem KPI summary đa cơ sở.
const MULTI_BRANCH_ROLES = new Set([
  'ADMIN', 'CEO', 'CHU_TICH', 'GD_KD', 'GD_VP',
  'TP_KE', 'TP_GS', 'THU_QUY',
]);
// Roles được kiểm tra/trả lại — KHỚP với canCheckDailyCashflowReport server-side.
const CHECK_RETURN_ROLES = new Set(['TP_KE', 'ADMIN']);
// PR-CASH1C-REFINE: NV_KE/ADMIN nộp báo cáo trực tiếp ở /bao-cao-thu-chi
// (thay vì /chi-phi-co-so cũ). Server-side canSubmitDailyCashflowReport vẫn enforce
// (xem lib/finance/cashflow-report-permissions.ts).
const SUBMIT_ROLES = new Set(['NV_KE', 'ADMIN']);
// PR-CASH1F (2026-06-23): khóa báo cáo — KHỚP với canLockDailyCashflowReport.
const LOCK_ROLES = new Set(['TP_KE', 'ADMIN']);

export default async function BaoCaoThuChiPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'bao-cao-thu-chi', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Báo cáo thu-chi" icon="report" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
            <div className="text-sm text-slate-500">Trang này dành cho Thủ quỹ / Trưởng phòng Kế toán / Giám sát / Ban Lãnh đạo.</div>
          </div>
        </div>
      </>
    );
  }

  const branchId: BranchId | null = isBranchId(profile.branchId) ? profile.branchId : null;
  const canCheckReturn = CHECK_RETURN_ROLES.has(profile.roleCode);
  const canSubmit = SUBMIT_ROLES.has(profile.roleCode);
  const canLock = LOCK_ROLES.has(profile.roleCode);
  const isMultiBranch = MULTI_BRANCH_ROLES.has(profile.roleCode);

  return (
    <>
      <AppTopBar
        title="Báo cáo thu-chi"
        subtitle="Theo dõi báo cáo thu-chi đã nộp từ các cơ sở, kiểm tra và trả lại nếu cần bổ sung"
        icon="report"
      />
      <BaoCaoThuChiClient
        myRoleCode={profile.roleCode}
        myBranchId={branchId}
        canCheckReturn={canCheckReturn}
        canLock={canLock}
        canSubmit={canSubmit}
        canSelectBranch={isMultiBranch}
        showSummaryCards={isMultiBranch}
      />
    </>
  );
}
