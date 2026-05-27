import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppTopBar } from '@/components/AppTopBar';
import { UsersClient } from './UsersClient';

export default async function UsersPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'users', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Quản lý người dùng" icon="userCog" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
            <div className="text-sm text-slate-500">Chỉ CEO / GĐ Khối quản lý được người dùng.</div>
          </div>
        </div>
      </>
    );
  }

  const db = getFirebaseAdminDb();
  const [branchesSnap, rolesSnap] = await Promise.all([
    db.collection(COLLECTIONS.BRANCHES).get(),
    db.collection(COLLECTIONS.ROLES).orderBy('tier').get(),
  ]);
  const facilities = branchesSnap.docs.map((d) => ({ id: d.id, name: d.data().name ?? '' }));
  const roles = rolesSnap.docs.map((d) => {
    const x = d.data();
    return { code: x.code ?? d.id, name: x.name ?? '', block_id: x.block_id ?? null, tier: x.tier ?? 0 };
  });

  return (
    <>
      <AppTopBar
        title="Quản lý người dùng"
        subtitle="Tạo · Sửa · Tắt tài khoản · Phân vai trò"
        icon="userCog"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <UsersClient
          currentUserId={profile.id}
          currentUserRole={profile.roleCode}
          isAdminUser={profile.roleCode === 'ADMIN'}
          facilities={facilities}
          roles={roles}
        />
      </div>
    </>
  );
}
