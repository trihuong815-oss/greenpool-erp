// PR-CASH1C (2026-06-23) — Server bootstrap cho UI Chi phí cơ sở.
// Tách auth + permission + branch resolve trước khi render client orchestrator.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { canCreateExpense } from '@/lib/finance/expense-permissions';
import { isBranchId, type BranchId } from '@/lib/branches';
import { AppTopBar } from '@/components/AppTopBar';
import ChiPhiCoSoClient from './ChiPhiCoSoClient';

export const dynamic = 'force-dynamic';

const TOP_ROLES = new Set(['ADMIN', 'CEO', 'CHU_TICH', 'GD_VP', 'TP_KE']);

export default async function ChiPhiCoSoPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'chi-phi-co-so', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Chi phí cơ sở" icon="dollar" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
            <div className="text-sm text-slate-500">Trang này chỉ dành cho Kế toán cơ sở + Trưởng phòng Kế toán + Quản lý cơ sở.</div>
          </div>
        </div>
      </>
    );
  }

  const branchId: BranchId | null = isBranchId(profile.branchId) ? profile.branchId : null;
  const canEdit = canCreateExpense(profile.roleCode);
  const canSelectBranch = TOP_ROLES.has(profile.roleCode);

  return (
    <>
      <AppTopBar
        title="Chi phí cơ sở"
        subtitle="Ghi nhận khoản chi thực tế trong ngày và nộp báo cáo thu-chi"
        icon="dollar"
      />
      <ChiPhiCoSoClient
        myRoleCode={profile.roleCode}
        myBranchId={branchId}
        canEdit={canEdit}
        canSelectBranch={canSelectBranch}
      />
    </>
  );
}
