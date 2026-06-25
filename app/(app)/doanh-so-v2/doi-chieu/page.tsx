// Kế toán đối chiếu doanh số daily batch — server bootstrap.
// Phase 2 (2026-06-17).

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { canAccountantReview, getScopeRole } from '@/lib/sales-v2/scope';
import { isBranchId, type BranchId } from '@/lib/branches';
import DoiChieuClient from './DoiChieuClient';

export const dynamic = 'force-dynamic';

export default async function DoiChieuPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'doanh-so-v2/doi-chieu', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Đối chiếu doanh số" icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }

  // Allow kế toán + top role review. QLCS view-only (read-only mode trong UI).
  const role = getScopeRole(profile.roleCode);
  const canReview = canAccountantReview(profile.roleCode);

  const branchId: BranchId | null = isBranchId(profile.branchId) ? profile.branchId : null;

  return (
    <>
      <AppTopBar breadcrumb={[{ label: 'Doanh số' }, { label: 'Đối chiếu doanh số' }]} title="Đối chiếu doanh số" icon="task" />
      <DoiChieuClient
        myRoleCode={profile.roleCode}
        myBranchId={branchId}
        scope={role ?? 'qlcs'}
        canReview={canReview}
      />
    </>
  );
}
