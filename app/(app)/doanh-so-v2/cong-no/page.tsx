// Công nợ — list khách còn nợ theo scope role.
// Phase 5 (2026-06-17).

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { getScopeRole } from '@/lib/sales-v2/scope';
import CongNoClient from './CongNoClient';

export const dynamic = 'force-dynamic';

export default async function CongNoPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'doanh-so-v2/cong-no', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Công nợ" icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }

  const role = getScopeRole(profile.roleCode) ?? 'qlcs';
  return (
    <>
      <AppTopBar title="Công nợ" icon="task" />
      <CongNoClient scope={role} />
    </>
  );
}
