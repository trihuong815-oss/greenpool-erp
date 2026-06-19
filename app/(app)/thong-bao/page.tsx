// V9.0 Sidebar restructure (2026-06-19).
// Placeholder Trung tâm Thông báo — sẽ list noti history cross-module
// (đối tượng noti từ V6.5 noti-engine) ở giai đoạn sau.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export const dynamic = 'force-dynamic';

export default async function ThongBaoPage() {
  const { profile } = await requireAuthedProfile();
  if (!canAccessRoute(profile.roleCode, 'thong-bao', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Thông báo" icon="task" />
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
      topBarTitle="Thông báo"
      topBarIcon="task"
      pageTitle="Trung tâm Thông báo"
      description="Lịch sử mọi thông báo nhận được từ hệ thống (đề xuất, dispatch, chat, KT, ...). Hiện chuông thông báo trên thanh trên cùng vẫn hoạt động bình thường."
      status="wip"
    />
  );
}
