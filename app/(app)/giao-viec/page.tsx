import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppTopBar } from '@/components/AppTopBar';
import GiaoViecClient from './GiaoViecClient';

export default async function GiaoViecPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'giao-viec', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="ÃÂiÃ¡Â»Âu phÃ¡Â»Âi cÃÂ´ng viÃ¡Â»Âc" icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">Ã°ÂÂÂ</div>
            <div className="font-bold text-slate-800 text-lg mb-2">KhÃÂ´ng cÃÂ³ quyÃ¡Â»Ân truy cÃ¡ÂºÂ­p</div>
          </div>
        </div>
      </>
    );
  }

  // Fetch lookup data: departments + branches + active users (cho assignee picker)
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
      displayName: x.displayName ?? '(unknown)',
      email: x.email ?? '',
      roleId: x.roleId ?? '',
      branchId: x.branchId ?? null,
      departmentId: x.departmentId ?? null,
      status: (x.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
    };
  });

  return (
    <>
      <AppTopBar
        title="ÃÂiÃ¡Â»Âu phÃ¡Â»Âi cÃÂ´ng viÃ¡Â»Âc"
        subtitle="Workflow 3 cÃ¡ÂºÂ¥p ÃÂ· LiÃÂªn khÃ¡Â»Âi ÃÂ· PhÃÂª duyÃ¡Â»Ât tÃ¡Â»Â± ÃÂÃ¡Â»Âng"
        icon="task"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <GiaoViecClient
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
