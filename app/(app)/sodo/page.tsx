import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppTopBar } from '@/components/AppTopBar';
import { OrgChartClient } from './OrgChartClient';
import type { Role, Profile } from '@/lib/types';

export default async function SoDoPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'sodo', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Sơ đồ tổ chức" icon="users" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }

  const db = getFirebaseAdminDb();
  const [rolesSnap, usersSnap] = await Promise.all([
    db.collection(COLLECTIONS.ROLES).orderBy('tier').get(),
    db.collection(COLLECTIONS.USERS).where('status', '==', 'active').get(),
  ]);
  const roles = rolesSnap.docs.map((d) => {
    const x = d.data();
    return {
      code: x.code ?? d.id,
      name: x.name ?? '',
      tier: x.tier ?? 0,
      block_id: x.block_id ?? null,
      dept_id: x.dept_id ?? null,
      facility_id: x.facility_id ?? null,
      is_qlcs: !!x.is_qlcs,
      is_tp: !!x.is_tp,
      parent_role: x.parent_role ?? null,
      description: x.description ?? null,
    } as Role;
  });
  const profiles = usersSnap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      full_name: x.displayName ?? '',
      email: x.email ?? '',
      role_code: x.roleId ?? '',
      facility_id: x.branchId ?? null,
      avatar_url: x.avatarUrl ?? null,
      active: x.status !== 'inactive',
    } as Profile;
  });

  return (
    <>
      <AppTopBar
        breadcrumb={[{ label: 'Khối văn phòng' }, { label: 'Sơ đồ tổ chức' }]}
        title="Sơ đồ tổ chức"
        subtitle={`${roles.length} vai trò × 6 tầng · Click vai trò để xem nhân sự`}
        icon="users"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <OrgChartClient
          roles={roles}
          profiles={profiles}
        />
      </div>
    </>
  );
}
