// Module Checklist v2 — song song với /checklist cũ, không động.
// Spec: hardcoded 3 templates × 3 ca. User tick "đảm bảo" hoặc ghi chú.

import { redirect } from 'next/navigation';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { canAccessRoute } from '@/lib/permissions';
import { AppTopBar } from '@/components/AppTopBar';
import {
  templatesForRole, userRoleForChecklistV2, checklistV2SupervisorScope, ROLE_LABEL_V2,
  type ChecklistRole, type ChecklistShift,
} from '@/lib/checklist-v2/templates';
import { ChecklistV2Client } from './ChecklistV2Client';
import { SupervisorView } from './SupervisorView';
import { ChecklistHeatmap } from './ChecklistHeatmap';

interface PageProps {
  searchParams: Promise<{ shift?: string }>;
}

export default async function ChecklistV2Page({ searchParams }: PageProps) {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'checklist-v2', profile.menuOverrides)) {
    redirect('/dashboard');
  }

  const role: ChecklistRole | null = userRoleForChecklistV2(profile.roleCode);
  // Phải tính theo VN tz (UTC+7) — server chạy UTC, dùng toISOString() sẽ lệch ngày sau 17h VN.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const sp = await searchParams;
  const shift: ChecklistShift = sp.shift === 'morning' || sp.shift === 'afternoon' || sp.shift === 'evening'
    ? sp.shift
    : 'morning';

  // Non-submitter role:
  //   - Nếu là supervisor (ADMIN/CEO/GD_KD/GD_VP/TP_KT) → render SupervisorView
  //   - Còn lại → hiển thị thông báo không có quyền
  if (!role) {
    const supScope = checklistV2SupervisorScope(profile.roleCode);
    if (supScope && supScope.length > 0) {
      return (
        <>
          <AppTopBar
            title="Checklist vận hành"
            subtitle={`Giám sát · ${profile.roleName ?? profile.roleCode}`}
            icon="checkSquare"
          />
          <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50 space-y-6">
            <SupervisorView myUid={profile.id} myRoleLabel={profile.roleName ?? profile.roleCode} />
            {/* Phase Checklist-Chart (2026-06-09): heatmap thống kê cho supervisor */}
            <ChecklistHeatmap />
          </div>
        </>
      );
    }
    return (
      <>
        <AppTopBar title="Checklist vận hành" subtitle="Vận hành cơ sở · Kỹ thuật" icon="checkSquare" />
        <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md mx-auto">
            <div className="text-5xl mb-3">🚫</div>
            <div className="font-bold text-slate-800 mb-2">Vai trò {profile.roleName ?? profile.roleCode} không có quyền</div>
            <div className="text-sm text-slate-500">
              Module này dành cho QLCS · PP_HT · PP_XLN (gửi) và ADMIN/CEO/GD/TP_KT (giám sát).
            </div>
          </div>
        </div>
      </>
    );
  }

  const templates = templatesForRole(role);
  // Phase Checklist-Visibility (2026-06-09): QLCS được xem checklist của các
  // QLCS cơ sở khác. Render SupervisorView dưới khu vực nhập của mình.
  const supScope = checklistV2SupervisorScope(profile.roleCode);
  const showSupervisorPanel = !!supScope && supScope.length > 0;

  return (
    <>
      <AppTopBar
        breadcrumb={[{ label: 'Khối văn phòng' }, { label: 'Checklist vận hành' }]}
        title="Checklist vận hành"
        subtitle={`${ROLE_LABEL_V2[role]} · hôm nay ${today}`}
        icon="checkSquare"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50 space-y-6">
        <ChecklistV2Client
          role={role}
          templates={templates}
          date={today}
          activeShift={shift}
          branchId={profile.branchId}
          branchName={profile.branchName}
          displayName={profile.displayName}
        />
        {showSupervisorPanel && (
          <>
            <div className="border-t border-slate-200 pt-6">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
                Xem checklist các cơ sở khác
              </div>
              <SupervisorView myUid={profile.id} myRoleLabel={profile.roleName ?? profile.roleCode} />
            </div>
            {/* Phase Checklist-Chart (2026-06-09): heatmap thống kê N ngày */}
            <div className="border-t border-slate-200 pt-6">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
                Thống kê tổng quát
              </div>
              <ChecklistHeatmap />
            </div>
          </>
        )}
      </div>
    </>
  );
}
