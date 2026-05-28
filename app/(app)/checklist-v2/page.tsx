// Module Checklist v2 — song song với /checklist cũ, không động.
// Spec: hardcoded 3 templates × 3 ca. User tick "đảm bảo" hoặc ghi chú.

import { redirect } from 'next/navigation';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { canAccessRoute } from '@/lib/permissions';
import { AppTopBar } from '@/components/AppTopBar';
import {
  templatesForRole, userRoleForChecklistV2, ROLE_LABEL_V2,
  type ChecklistRole, type ChecklistShift,
} from '@/lib/checklist-v2/templates';
import { ChecklistV2Client } from './ChecklistV2Client';

interface PageProps {
  searchParams: Promise<{ shift?: string }>;
}

export default async function ChecklistV2Page({ searchParams }: PageProps) {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'checklist-v2', profile.menuOverrides)) {
    redirect('/dashboard');
  }

  const role: ChecklistRole | null = userRoleForChecklistV2(profile.roleCode);
  const today = new Date().toISOString().slice(0, 10);
  const sp = await searchParams;
  const shift: ChecklistShift = sp.shift === 'morning' || sp.shift === 'afternoon' || sp.shift === 'evening'
    ? sp.shift
    : 'morning';

  // Nếu user không thuộc 3 role (vd. TP_KT, ADMIN, CEO) → render UI giám sát (Phase 3) —
  // Phase 1 tạm hiển thị thông báo.
  if (!role) {
    return (
      <>
        <AppTopBar title="Checklist v2" subtitle="Vận hành cơ sở · Kỹ thuật" icon="checkSquare" />
        <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md mx-auto">
            <div className="text-5xl mb-3">👀</div>
            <div className="font-bold text-slate-800 mb-2">Vai trò {profile.roleName ?? profile.roleCode} chỉ xem giám sát</div>
            <div className="text-sm text-slate-500">
              Module này dành cho QLCS · PP_HT · PP_XLN thực hiện checklist.<br />
              Dashboard giám sát đang trong Phase 3.
            </div>
          </div>
        </div>
      </>
    );
  }

  const templates = templatesForRole(role);

  return (
    <>
      <AppTopBar
        title="Checklist vận hành"
        subtitle={`${ROLE_LABEL_V2[role]} · hôm nay ${today}`}
        icon="checkSquare"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <ChecklistV2Client
          role={role}
          templates={templates}
          date={today}
          activeShift={shift}
          branchId={profile.branchId}
          branchName={profile.branchName}
          displayName={profile.displayName}
        />
      </div>
    </>
  );
}
