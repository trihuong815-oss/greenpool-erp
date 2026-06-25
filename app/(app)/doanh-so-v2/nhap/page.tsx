// Sale nhập daily batch — server component bootstrap.
// Phase 1 (2026-06-17).

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { canSaleEnter, resolveSaleContext } from '@/lib/sales-v2/scope';
import { listPackagesForBranch } from '@/lib/sales-v2/packages';
import NhapClient from './NhapClient';
import type { AuthedCaller } from '@/lib/firebase/checklist-auth';

export const dynamic = 'force-dynamic';

export default async function NhapDoanhSoV2Page() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'doanh-so-v2/nhap', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Nhập doanh số ngày" icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }

  // Chỉ Sale mới được nhập — role khác (kế toán/QLCS/GD) có quyền vào menu để xem demo
  // nhưng hiển thị "Chỉ Sale nhập".
  if (!canSaleEnter(profile.roleCode)) {
    return (
      <>
        <AppTopBar title="Nhập doanh số ngày" icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-4xl mb-3">📝</div>
            <div className="font-bold text-slate-800 mb-2">Chỉ tài khoản Sale mới nhập</div>
            <div className="text-sm text-slate-500">Vai trò của bạn: {profile.roleCode}</div>
          </div>
        </div>
      </>
    );
  }

  // Resolve context Sale + load packages
  const fakeCaller: AuthedCaller = {
    profile: {
      uid: profile.id,
      role_code: profile.roleCode,
      facility_id: profile.branchId,
      department_id: profile.departmentId,
      shift_assignment: profile.shiftAssignment,
      is_shared_shift_account: profile.isSharedShiftAccount,
      sub_areas: profile.subAreas,
    },
    actorName: profile.displayName,
    actorRole: profile.roleName ?? profile.roleCode,
  };
  const ctx = await resolveSaleContext(fakeCaller);
  if ('error' in ctx) {
    return (
      <>
        <AppTopBar title="Nhập doanh số ngày" icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-4xl mb-3">⚠️</div>
            <div className="font-bold text-slate-800 mb-2">{ctx.error}</div>
            <div className="text-sm text-slate-500">Liên hệ ADMIN để gán cơ sở cho tài khoản.</div>
          </div>
        </div>
      </>
    );
  }

  const packages = await listPackagesForBranch(ctx.branchId);

  return (
    <>
      <AppTopBar breadcrumb={[{ label: 'Doanh số' }, { label: 'Nhập doanh số ngày' }]} title="Nhập doanh số ngày" icon="task" />
      <NhapClient
        branchId={ctx.branchId}
        branchName={ctx.branchName}
        saleName={ctx.saleName}
        packages={packages}
      />
    </>
  );
}
