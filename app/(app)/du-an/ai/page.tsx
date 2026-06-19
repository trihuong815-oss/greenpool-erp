// V9.1 (2026-06-19): Khối Dự án > AI & Chuyển đổi số — placeholder.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export const dynamic = 'force-dynamic';

export default async function DuAnAiPage() {
  const { profile } = await requireAuthedProfile();
  if (!canAccessRoute(profile.roleCode, 'du-an/ai', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="AI & Chuyển đổi số" icon="settings" />
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
      topBarTitle="AI & Chuyển đổi số"
      topBarIcon="settings"
      pageTitle="Khối Dự án — AI & Chuyển đổi số"
      description="Dự án ứng dụng AI vào vận hành (phân tích dữ liệu, dự báo, AI coach cá nhân, tự động hoá quy trình) + lộ trình chuyển đổi số toàn công ty."
      status="soon"
    />
  );
}
