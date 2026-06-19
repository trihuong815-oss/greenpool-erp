// V9.1 (2026-06-19): Dashboard từng cơ sở. Permission KHÔNG theo route per-branch.
// Logic:
//   1. canAccessRoute('co-so', ...) — kiểm tra role có quyền vào module Cơ sở không.
//   2. Branch access: top mgmt (CEO/CHU_TICH/GĐ/TP_GS) → any branch; else → CHỈ
//      profile.branchId === [branchId].

import { notFound } from 'next/navigation';
import { canAccessRoute, canSeeAllFacilities, isTopAdmin, getVisibleFacilities } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { PlaceholderPage } from '@/components/PlaceholderPage';
import { BRANCH_BY_ID, isBranchId } from '@/lib/branches';

export const dynamic = 'force-dynamic';

export default async function CoSoBranchPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  if (!isBranchId(branchId)) notFound();

  const { profile } = await requireAuthedProfile();
  const branch = BRANCH_BY_ID[branchId];

  // 1. Module access — chỉ role có 'co-so' trong MENU_PERMISSIONS mới vào được.
  if (!canAccessRoute(profile.roleCode, 'co-so', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title={`Cơ sở ${branch.name}`} icon="home" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }

  // 2. Branch-level access — V9.3: fallback qua getVisibleFacilities (bao gồm
  // QLCS_FACILITY mapping nếu profile.branchId thiếu trong DB).
  const seeAll = canSeeAllFacilities(profile.roleCode)
    || isTopAdmin(profile.roleCode)
    || profile.roleCode === 'CHU_TICH'
    || profile.roleCode === 'TP_GS';
  const allowedBranchIds = seeAll
    ? null  // unrestricted
    : getVisibleFacilities(profile.roleCode, profile.branchId);
  const canAccessThisBranch = allowedBranchIds === null || allowedBranchIds.includes(branchId);

  if (!canAccessThisBranch) {
    return (
      <>
        <AppTopBar title={`Cơ sở ${branch.name}`} icon="home" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🚧</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Ngoài phạm vi cơ sở của bạn</div>
            <div className="text-sm text-slate-600">
              Bạn được phân quyền cho cơ sở khác. Vào <strong>Cơ sở</strong> ở menu để xem cơ sở của mình.
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <PlaceholderPage
      topBarTitle={`Cơ sở ${branch.name}`}
      topBarIcon="home"
      pageTitle={`Dashboard ${branch.name}`}
      description="Trang tổng quan riêng cho cơ sở này — sẽ gom KPI doanh số, kỹ thuật, nhân sự, checklist vận hành trong các giai đoạn sau. Hiện tại chỉ là khung navigation."
      status="wip"
    />
  );
}
