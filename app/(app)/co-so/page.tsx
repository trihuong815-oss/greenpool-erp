// V9.1 (2026-06-19): /co-so — danh sách cơ sở. Click card → /co-so/[branchId].
// Quyền truy cập branch lấy từ profile.branchId hoặc canSeeAllFacilities — KHÔNG
// dùng permission route per-branch. Top mgmt (CEO/CHU_TICH/GĐ) thấy 5; others
// chỉ thấy branch của mình.

import Link from 'next/link';
import { canAccessRoute, canSeeAllFacilities, isTopAdmin, getVisibleFacilities } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { BRANCHES } from '@/lib/branches';
import { Building2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CoSoListPage() {
  const { profile } = await requireAuthedProfile();
  if (!canAccessRoute(profile.roleCode, 'co-so', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Cơ sở" icon="home" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }

  // V9.3 (2026-06-20): lọc cơ sở qua getVisibleFacilities helper — bao gồm fallback
  // QLCS_FACILITY map nếu user thiếu profile.branchId trong DB (vd QLCS_HM rỗng
  // branchId vẫn thấy Hoàng Mai qua role-code mapping).
  // Top mgmt explicit (CHU_TICH + TP_GS chưa nằm trong canSeeAllFacilities helper).
  const seeAll = canSeeAllFacilities(profile.roleCode)
    || isTopAdmin(profile.roleCode)
    || profile.roleCode === 'CHU_TICH'
    || profile.roleCode === 'TP_GS';

  const visibleIds = seeAll
    ? BRANCHES.map((b) => b.id)
    : getVisibleFacilities(profile.roleCode, profile.branchId);
  const visibleBranches = BRANCHES.filter((b) => visibleIds.includes(b.id));

  return (
    <>
      <AppTopBar title="Cơ sở" icon="home" />
      <div className="flex-1 p-3 md:p-6 bg-slate-50 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-emerald-200">
                <Building2 size={20} className="text-emerald-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-800">Cơ sở Green Pool</h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  {seeAll
                    ? `Toàn hệ thống ${BRANCHES.length} cơ sở. Click vào cơ sở để xem dashboard riêng.`
                    : `Cơ sở bạn được phân quyền. Click để xem dashboard.`}
                </p>
              </div>
            </div>
          </div>

          {visibleBranches.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">
              <div className="text-5xl mb-3">📍</div>
              <div className="text-base font-medium text-slate-600">Bạn chưa được gán cơ sở</div>
              <div className="text-sm mt-1.5">Liên hệ ADMIN để cấu hình branchId trong hồ sơ.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleBranches.map((b) => (
                <Link
                  key={b.id}
                  href={`/co-so/${b.id}`}
                  className="group block rounded-xl bg-white p-5 ring-1 ring-slate-200 hover:ring-emerald-300 hover:shadow-md transition"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ring-1"
                      style={{ backgroundColor: `${b.color}15`, borderColor: `${b.color}40`, color: b.color }}
                    >
                      <Building2 size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Mã: {b.id}
                      </div>
                      <div className="text-base font-bold text-slate-800 mt-0.5 group-hover:text-emerald-700 truncate">
                        {b.name}
                      </div>
                      <div className="text-xs text-slate-400 mt-2 italic">
                        Click để xem dashboard cơ sở →
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
