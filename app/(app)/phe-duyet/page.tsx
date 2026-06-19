// V9.0 Sidebar restructure (2026-06-19).
// Placeholder Trung tâm Phê duyệt — sẽ gom dữ liệu cần duyệt từ nhiều module
// (đề xuất, công nợ, batch doanh số, đề xuất KT, ...) ở giai đoạn sau.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export const dynamic = 'force-dynamic';

export default async function PheDuyetPage() {
  const { profile } = await requireAuthedProfile();
  if (!canAccessRoute(profile.roleCode, 'phe-duyet', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Phê duyệt" icon="checkSquare" />
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
      topBarTitle="Phê duyệt"
      topBarIcon="checkSquare"
      pageTitle="Trung tâm Phê duyệt"
      description="Gom mọi yêu cầu cần phê duyệt từ các module: đề xuất, công nợ, batch doanh số, đề xuất kỹ thuật, ... Một nơi duy nhất để xử lý nhanh."
      status="wip"
    />
  );
}
