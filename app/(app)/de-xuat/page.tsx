import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppTopBar } from '@/components/AppTopBar';
import { DeXuatClient } from './DeXuatClient';

export default async function DeXuatPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'de-xuat', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Đề xuất" icon="task" />
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
  const [deptSnap, branchSnap, userSnap] = await Promise.all([
    db.collection(COLLECTIONS.DEPARTMENTS).get(),
    db.collection(COLLECTIONS.BRANCHES).get(),
    db.collection(COLLECTIONS.USERS).where('status', '==', 'active').get(),
  ]);
  const departments = deptSnap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, name: x.name ?? d.id, blockId: x.block_id ?? null };
  });
  const branches = branchSnap.docs.map((d) => ({ id: d.id, name: d.data().name ?? d.id }));
  const users = userSnap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      name: x.displayName ?? '(unknown)',
      roleId: x.roleId ?? '',
      branchId: x.branchId ?? null,
      departmentId: x.departmentId ?? null,
    };
  });

  return (
    <>
      <AppTopBar
        breadcrumb={[{ label: 'Trung tâm điều hành' }, { label: 'Đề xuất' }]}
        title="Đề xuất"
        subtitle="Đề xuất lên trên · Ngang cấp · Liên khối"
        icon="task"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <DeXuatClient
          currentUserId={profile.id}
          currentUserName={profile.displayName}
          currentUserRole={profile.roleCode}
          currentBranchId={profile.branchId ?? null}
          currentDepartmentId={profile.departmentId ?? null}
          departments={departments}
          branches={branches}
          users={users}
        />
      </div>
    </>
  );
}
