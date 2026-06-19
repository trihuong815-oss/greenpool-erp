// V9.0 Sidebar restructure (2026-06-19).
// Dashboard cơ sở — placeholder per-branch. Validate branchId thuộc 5 cơ sở cố định.
// Page thật sẽ aggregate KPI cơ sở (doanh số / KT / nhân sự / checklist) giai đoạn sau.

import { notFound } from 'next/navigation';
import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { PlaceholderPage } from '@/components/PlaceholderPage';
import { BRANCH_BY_ID, isBranchId } from '@/lib/branches';

export const dynamic = 'force-dynamic';

export default async function CoSoPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  if (!isBranchId(branchId)) notFound();

  const { profile } = await requireAuthedProfile();
  // Route key dạng 'co-so/HM' để chấm điểm theo từng cơ sở
  const routeKey = `co-so/${branchId}`;
  if (!canAccessRoute(profile.roleCode, routeKey, profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title={`Cơ sở ${BRANCH_BY_ID[branchId].name}`} icon="home" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
            <div className="text-sm text-slate-600">Bạn không được phân quyền xem dashboard cơ sở này.</div>
          </div>
        </div>
      </>
    );
  }

  const branch = BRANCH_BY_ID[branchId];
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
