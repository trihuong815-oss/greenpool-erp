// V9.0 Sidebar restructure (2026-06-19) — placeholder Khối Dự án > Mở cơ sở mới.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export const dynamic = 'force-dynamic';

export default async function DuAnMoCoSoPage() {
  const { profile } = await requireAuthedProfile();
  if (!canAccessRoute(profile.roleCode, 'du-an/mo-co-so', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Mở cơ sở mới" icon="home" />
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
      topBarTitle="Mở cơ sở mới"
      topBarIcon="home"
      pageTitle="Khối Dự án — Mở cơ sở mới"
      description="Quản lý quy trình mở chi nhánh mới: khảo sát mặt bằng, đầu tư thiết bị, tuyển nhân sự, ra mắt, KPI 90 ngày đầu."
      status="soon"
    />
  );
}
