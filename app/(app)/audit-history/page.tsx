// PR-7A (2026-06-22) — /audit-history page (server gate).
// Permission: 7 role (ADMIN/CEO/CHU_TICH/GD_KD/GD_VP/TP_KE/TP_GS).
// Read-only UI. Data đọc từ salesAuditLogs only (Option A đã chốt với user).
// Programs/approve/return/target audit (ở auditLogs generic) defer PR-7B.

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { canReadAuditHistory } from '@/lib/audit-history/can-read';
import { AppTopBar } from '@/components/AppTopBar';
import AuditHistoryClient from './AuditHistoryClient';

export const dynamic = 'force-dynamic';

export default async function AuditHistoryPage() {
  const { profile } = await requireAuthedProfile();

  const allowedByRoute = canAccessRoute(profile.roleCode, 'audit-history', profile.menuOverrides);
  const allowedByRole = canReadAuditHistory(profile.roleCode);

  if (!allowedByRoute || !allowedByRole) {
    return (
      <>
        <AppTopBar title="Lịch sử thao tác" icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
            <div className="text-sm text-slate-500">
              Trang Lịch sử thao tác chỉ dành cho vai trò quản trị/kiểm soát.
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppTopBar
        breadcrumb={[{ label: 'Tài chính kế toán' }, { label: 'Lịch sử thao tác' }]}
        title="Lịch sử thao tác"
        subtitle="Chỉ xem · ghi lại mọi thao tác trên hệ thống"
        icon="task"
      />
      <AuditHistoryClient roleCode={profile.roleCode} />
    </>
  );
}
