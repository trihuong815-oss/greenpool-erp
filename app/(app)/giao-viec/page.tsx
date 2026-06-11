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
        <AppTopBar title="ÃÂÃÂiÃÂ¡ÃÂ»ÃÂu phÃÂ¡ÃÂ»ÃÂi cÃÂÃÂ´ng viÃÂ¡ÃÂ»ÃÂc" icon="task" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">ÃÂ°ÃÂÃÂÃÂ</div>
            <div className="font-bold text-slate-800 text-lg mb-2">KhÃÂÃÂ´ng cÃÂÃÂ³ quyÃÂ¡ÃÂ»ÃÂn truy cÃÂ¡ÃÂºÃÂ­p</div>
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
        title="ÃÂÃÂiÃÂ¡ÃÂ»ÃÂu phÃÂ¡ÃÂ»ÃÂi cÃÂÃÂ´ng viÃÂ¡ÃÂ»ÃÂc"
        subtitle="Workflow 3 cÃÂ¡ÃÂºÃÂ¥p ÃÂÃÂ· LiÃÂÃÂªn khÃÂ¡ÃÂ»ÃÂi ÃÂÃÂ· PhÃÂÃÂª duyÃÂ¡ÃÂ»ÃÂt tÃÂ¡ÃÂ»ÃÂ± ÃÂÃÂÃÂ¡ÃÂ»ÃÂng"
        icon="task"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <GiaoViecClient
          userId={profile.id}
          userName={profile.displayName ?? ''}
          userRole={profile.roleName ?? ''}
          roleCode={profile.roleCode ?? ''}
          departments={departments}
          branches={branches}
          users={users as any}
          isAdmin={['ADMIN','CEO','CHU_DAU_TU'].includes(profile.roleCode ?? '')}
          isCEO={['CEO','CHU_DAU_TU'].includes(profile.roleCode ?? '')}
          canCreateAssignment={true}
          canCreateProposal={true}
        />
      </div>
    </>
  );
}
