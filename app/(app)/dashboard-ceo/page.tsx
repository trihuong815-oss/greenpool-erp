// V9.1 (2026-06-19): /dashboard-ceo placeholder — anchor cho kiến trúc ERP tương lai.
// Route RIÊNG với /dashboard. Sau này sẽ hiển thị KPI tổng quan cấp CEO/Chủ tịch
// (doanh thu hệ thống, 5 cơ sở, dòng tiền, P&L, ...). Hiện chỉ giữ khung.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export const dynamic = 'force-dynamic';

export default async function DashboardCeoPage() {
  const { profile } = await requireAuthedProfile();
  if (!canAccessRoute(profile.roleCode, 'dashboard-ceo', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Dashboard CEO" icon="home" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
            <div className="text-sm text-slate-600">Dashboard CEO chỉ dành cho cấp Chủ tịch / CEO / Giám đốc.</div>
          </div>
        </div>
      </>
    );
  }
  return (
    <PlaceholderPage
      topBarTitle="Dashboard CEO"
      topBarIcon="home"
      pageTitle="Dashboard điều hành CEO"
      description="Trang KPI tổng quan cho cấp Chủ tịch / CEO / Giám đốc — doanh thu hệ thống, 5 cơ sở, dòng tiền, P&L, OKR công ty. Hiện đang ở giai đoạn dựng khung navigation."
      status="wip"
    />
  );
}
