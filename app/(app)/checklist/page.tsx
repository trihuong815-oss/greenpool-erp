import { canAccessRoute, getChecklistScope } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { ChecklistClient } from './ChecklistClient';
import { todayISO } from './helpers';
import { getChecklistOperationsDataFirebase } from './data.firebase';
import { getChecklistReferenceDataFirebase } from './data.refs.firebase';

export default async function ChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { profile } = await requireAuthedProfile();
  const sp = await searchParams;
  const date = isValidISODate(sp.date) ? sp.date! : todayISO();

  if (!canAccessRoute(profile.roleCode, 'checklist', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Checklist vận hành" icon="checkSquare" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }

  const scope = getChecklistScope({
    roleCode: profile.roleCode,
    facilityId: profile.branchId,
    departmentId: profile.departmentId,
    shiftAssignment: profile.shiftAssignment,
    isSharedShift: profile.isSharedShiftAccount,
  });

  const [refData, opsData] = await Promise.all([
    getChecklistReferenceDataFirebase(profile.roleCode),
    getChecklistOperationsDataFirebase({
      scope, date,
      userId: profile.id,
      userRole: profile.roleCode,
      userFacility: profile.branchId,
      userDepartment: profile.departmentId,
      userShift: profile.shiftAssignment,
      isSharedShift: profile.isSharedShiftAccount,
    }),
  ]);

  return (
    <>
      <AppTopBar
        title="Checklist vận hành"
        subtitle="Theo dõi · Phân cơ sở · Phân bộ phận · Phê duyệt"
        icon="checkSquare"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <ChecklistClient
          date={date}
          userId={profile.id}
          userName={profile.displayName}
          userRole={profile.roleCode}
          userFacility={profile.branchId}
          userDepartment={profile.departmentId}
          userShift={profile.shiftAssignment}
          isSharedShift={profile.isSharedShiftAccount}
          facilities={refData.facilities}
          roles={refData.roles}
          departments={refData.departments}
          initialCards={opsData.cards}
          initialError={opsData.error}
        />
      </div>
    </>
  );
}

function isValidISODate(s?: string): boolean {
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
