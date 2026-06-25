import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import DieuPhoiClient from './DieuPhoiClient';

export default async function Page() {
  const { profile } = await requireAuthedProfile();
  const allowed =
    canAccessRoute(profile.roleCode, 'dieu-phoi', profile.menuOverrides) ||
    canAccessRoute(profile.roleCode, 'giao-viec', profile.menuOverrides);
  if (!allowed) {
    return (
      <>
        <AppTopBar
          title="Điều phối công việc"
          subtitle="Điều hành liên khối · phòng ban · cơ sở"
          icon="task"
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-slate-400">Không có quyền truy cập</div>
        </div>
      </>
    );
  }
  return (
    <>
      <AppTopBar
        breadcrumb={[{ label: 'Trung tâm điều hành' }, { label: 'Điều phối công việc' }]}
        title="Điều phối công việc"
        subtitle="Điều hành liên khối · phòng ban · cơ sở"
        icon="task"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-5 bg-slate-50">
        <DieuPhoiClient
          currentUserUid={profile.id}
          currentUserName={profile.displayName}
          currentUserRole={profile.roleCode}
          currentUserDeptId={profile.departmentId ?? null}
          currentUserFacilityId={profile.branchId ?? null}
        />
      </div>
    </>
  );
}
