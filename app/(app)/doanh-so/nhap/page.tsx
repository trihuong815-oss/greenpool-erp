import { canAccessRoute, canSeeAllFacilities, isQLCS, isTP } from '@/lib/permissions';
import { isSaleRole } from '@/lib/sales-roles';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppTopBar } from '@/components/AppTopBar';
import { NhapClient } from './NhapClient';

export default async function NhapDoanhSoPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'doanh-so', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Nhập dữ liệu doanh số - Lead" icon="barChart" />
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
  // Lấy mọi user (kể cả inactive) — admin cần thấy inactive để reactivate qua ManageSalesModal.
  // Entry form sẽ tự filter status='active' ở client.
  const [branchesSnap, usersSnap] = await Promise.all([
    db.collection(COLLECTIONS.BRANCHES).get(),
    db.collection(COLLECTIONS.USERS).get(),
  ]);
  const branches = branchesSnap.docs.map((d) => ({ id: d.id, name: d.data().name ?? d.id }));
  // NV_SALE (Member) + NV_SALE_PT (PT Gym, chỉ cơ sở 24) — thống nhất với /doanh-so dashboard và ManageSalesModal.
  // Bao gồm cả inactive để admin có thể reactivate qua modal (form nhập filter active ở client).
  const staffUsers = usersSnap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        name: x.displayName ?? '(no name)',
        roleId: x.roleId ?? '',
        branchId: x.branchId ?? null,
        status: x.status ?? 'active',
      };
    })
    .filter((u) => isSaleRole(u.roleId));

  // Scope branches user được nhập
  const isAdmin = canSeeAllFacilities(profile.roleCode);
  let allowedBranches = branches;
  if (!isAdmin) {
    if (isQLCS(profile.roleCode) || (!isTP(profile.roleCode) && profile.branchId)) {
      allowedBranches = branches.filter((b) => b.id === profile.branchId);
    }
  }

  return (
    <>
      <AppTopBar
        title="Nhập dữ liệu doanh số - Lead"
        subtitle="Tách 2 form: Lead (per sale × nguồn) · Doanh số & gói (per sale + per gói)"
        icon="barChart"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <NhapClient
          currentUserId={profile.id}
          currentUserName={profile.displayName}
          currentUserRole={profile.roleCode}
          allowedBranches={allowedBranches}
          staffUsers={staffUsers}
        />
      </div>
    </>
  );
}
