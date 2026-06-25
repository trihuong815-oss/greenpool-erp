import { canAccessRoute, canSeeAllFacilities, isQLCS, isTP } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppTopBar } from '@/components/AppTopBar';
import { PackagesClient } from './PackagesClient';

export default async function PackagesPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'doanh-so/packages', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Quản lý gói dịch vụ" icon="settings" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền</div>
          </div>
        </div>
      </>
    );
  }

  const db = getFirebaseAdminDb();
  const branchesSnap = await db.collection(COLLECTIONS.BRANCHES).get();
  const branches = branchesSnap.docs.map((d) => ({ id: d.id, name: d.data().name ?? d.id }));

  const isAdmin = canSeeAllFacilities(profile.roleCode);
  let allowedBranches = branches;
  if (!isAdmin && !isTP(profile.roleCode)) {
    if (isQLCS(profile.roleCode) || profile.branchId) {
      allowedBranches = branches.filter((b) => b.id === profile.branchId);
    }
  }

  return (
    <>
      <AppTopBar
        breadcrumb={[{ label: 'Cài đặt' }, { label: 'Quản lý gói dịch vụ' }]}
        title="Quản lý gói dịch vụ"
        subtitle="Thêm / sửa / tắt nhóm + gói theo từng cơ sở"
        icon="settings"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <PackagesClient allowedBranches={allowedBranches} />
      </div>
    </>
  );
}
