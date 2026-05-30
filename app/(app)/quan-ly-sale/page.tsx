// /quan-ly-sale — Admin-only module trong khu Quản trị.
// Liệt kê NV_SALE per branch + add/toggle/rename inline. Reuse /api/sales-staff endpoints.

import { canAccessRoute, canSeeAllFacilities } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppTopBar } from '@/components/AppTopBar';
import { QuanLySaleClient } from './QuanLySaleClient';

export default async function QuanLySalePage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'quan-ly-sale', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Quản lý Sale" icon="users" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền</div>
            <div className="text-sm text-slate-500">Chỉ admin (CEO/GĐ Khối) được quản lý sale.</div>
          </div>
        </div>
      </>
    );
  }

  const isAdmin = canSeeAllFacilities(profile.roleCode);
  // Admin → 5 cơ sở. Non-admin (defensive — shouldn't reach here vì canAccessRoute đã chặn).
  const db = getFirebaseAdminDb();
  const branchesSnap = await db.collection(COLLECTIONS.BRANCHES).get();
  const allBranches = branchesSnap.docs
    .map((d) => ({ id: d.id, name: d.data().name ?? d.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const allowedBranches = isAdmin ? allBranches : allBranches.filter((b) => b.id === profile.branchId);

  // Pre-fetch toàn bộ sale roles (NV_SALE + NV_SALE_PT, kể cả inactive) để client filter theo branch
  const { SALE_ROLE_CODES } = await import('@/lib/sales-roles');
  const usersSnap = await db.collection(COLLECTIONS.USERS).where('roleId', 'in', SALE_ROLE_CODES as unknown as string[]).get();
  const staffUsers = usersSnap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      name: x.displayName ?? '(no name)',
      roleId: x.roleId ?? '',
      branchId: x.branchId ?? null,
      status: x.status ?? 'active',
    };
  });

  return (
    <>
      <AppTopBar
        title="Quản lý Sale"
        subtitle="Thêm · tắt · đổi tên NV_SALE theo từng cơ sở"
        icon="users"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <QuanLySaleClient allowedBranches={allowedBranches} staffUsers={staffUsers} />
      </div>
    </>
  );
}
