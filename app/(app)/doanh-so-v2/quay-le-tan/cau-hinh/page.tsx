// V8 Reception (2026-06-18) — Page cấu hình đơn giá quầy lễ tân (admin/CEO/TP_KE).

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import ReceptionPricingClient from './ReceptionPricingClient';

export const dynamic = 'force-dynamic';

export default async function ReceptionPricingPage() {
  const { profile } = await requireAuthedProfile();
  // Chỉ admin / CEO / TP_KE được setup giá (cho phép cấu hình toàn hệ thống).
  const allowed = canAccessRoute(profile.roleCode, 'doanh-so-v2/quay-le-tan/cau-hinh', profile.menuOverrides);
  if (!allowed) {
    return (
      <>
        <AppTopBar title="Cấu hình đơn giá quầy lễ tân" icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền</div>
            <div className="text-sm text-slate-600 mt-2">Chỉ ADMIN / CEO / TP_KE được cấu hình đơn giá vé lẻ.</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppTopBar breadcrumb={[{ label: 'Doanh số' }, { label: 'Quầy lễ tân' }, { label: 'Cấu hình đơn giá' }]} title="Cấu hình đơn giá quầy lễ tân" icon="task" />
      <ReceptionPricingClient />
    </>
  );
}
