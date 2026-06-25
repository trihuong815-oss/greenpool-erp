// V8 Reception (2026-06-18) — Page nhập doanh thu quầy lễ tân cho NV_KE/TP_KE.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { BRANCHES } from '@/lib/branches';
import type { BranchId } from '@/lib/branches';
import ReceptionNhapClient from './ReceptionNhapClient';

export const dynamic = 'force-dynamic';

export default async function ReceptionNhapPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'doanh-so-v2/quay-le-tan/nhap', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Nhập doanh thu quầy lễ tân" icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
            <div className="text-sm text-slate-600 mt-2">Chỉ kế toán cơ sở (NV_KE) hoặc TP_KE được nhập báo cáo quầy lễ tân.</div>
          </div>
        </div>
      </>
    );
  }

  // Cấp branch theo role:
  //  - NV_KE: branch của mình (forced)
  //  - TP_KE: chọn branch (mặc định branch đầu — UI cho phép switch)
  const isTpKe = profile.roleCode === 'TP_KE';
  const callerBranch = profile.branchId as BranchId | null;
  const defaultBranch: BranchId = (callerBranch ?? BRANCHES[0].id) as BranchId;

  return (
    <>
      <AppTopBar breadcrumb={[{ label: 'Doanh số' }, { label: 'Quầy lễ tân' }, { label: 'Nhập doanh thu' }]} title="Nhập doanh thu quầy lễ tân" icon="task" />
      <ReceptionNhapClient defaultBranch={defaultBranch} allowSwitchBranch={isTpKe} />
    </>
  );
}
