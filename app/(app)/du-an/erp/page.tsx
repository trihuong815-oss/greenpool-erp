// V9.0 Sidebar restructure (2026-06-19) — placeholder Khối Dự án > ERP.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export const dynamic = 'force-dynamic';

export default async function DuAnErpPage() {
  const { profile } = await requireAuthedProfile();
  if (!canAccessRoute(profile.roleCode, 'du-an/erp', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Dự án ERP" icon="settings" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }
  return (
    <PlaceholderPage
      topBarTitle="Dự án ERP"
      topBarIcon="settings"
      pageTitle="Khối Dự án — ERP"
      description="Trang quản lý dự án triển khai/nâng cấp hệ thống ERP nội bộ (kế hoạch, sprint, bug log, release notes)."
      status="soon"
    />
  );
}
