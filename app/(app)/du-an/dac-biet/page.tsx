// V9.0 Sidebar restructure (2026-06-19) — placeholder Khối Dự án > Dự án đặc biệt.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export const dynamic = 'force-dynamic';

export default async function DuAnDacBietPage() {
  const { profile } = await requireAuthedProfile();
  if (!canAccessRoute(profile.roleCode, 'du-an/dac-biet', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Dự án đặc biệt" icon="task" />
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
      topBarTitle="Dự án đặc biệt"
      topBarIcon="task"
      pageTitle="Khối Dự án — Dự án đặc biệt"
      description="Các sáng kiến chiến lược, R&D, hợp tác đối tác lớn, sự kiện cộng đồng, ... — quản lý timeline + nguồn lực."
      status="soon"
    />
  );
}
