import { AppTopBar } from '@/components/AppTopBar';
import { canSeeAllFacilities, getVisibleFacilities } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { countUnhandledErrors } from '@/lib/firebase/system-errors';
import { kyThuatReadScope } from '@/lib/firebase/ky-thuat-scope';
import { DashboardContent } from './DashboardContent';
import { ChecklistV2SupervisorWidget } from './ChecklistV2SupervisorWidget';
import { fetchDashboardBranches } from './data.firebase';
import { fetchKyThuatSummary } from './data.kythuat';
import { fetchSalesReport } from '../doanh-so/data.firebase';
import { checklistV2SupervisorScope } from '@/lib/checklist-v2/templates';
import type { Facility, Task } from '@/lib/types';

const ALL_BRANCHES_KT = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

export default async function DashboardPage() {
  const { profile } = await requireAuthedProfile();

  const visibleFacilities = getVisibleFacilities(profile.roleCode, profile.branchId);
  const isAdmin = canSeeAllFacilities(profile.roleCode);
  const isSystemAdmin = profile.roleCode === 'ADMIN';
  const systemErrorCount = isSystemAdmin ? await countUnhandledErrors() : 0;

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;     // 1-12
  const monthIdx = currentMonth - 1;              // 0-11

  // KT dashboard data: chỉ fetch nếu user nằm trong role được xem KT module.
  // Visible branches scope giống module KT (kyThuatReadScope).
  const callerProfileForKT = {
    uid: profile.id, role_code: profile.roleCode, facility_id: profile.branchId,
    department_id: profile.departmentId, shift_assignment: profile.shiftAssignment,
    is_shared_shift_account: profile.isSharedShiftAccount,
    sub_areas: profile.subAreas,
  };
  const ktScope = kyThuatReadScope(callerProfileForKT);
  const ktVisibleBranchIds: string[] = ktScope.branchIds === null
    ? [...ALL_BRANCHES_KT]
    : (ktScope.branchIds.length > 0 ? ktScope.branchIds : []);
  const showKTSection = ktVisibleBranchIds.length > 0;
  const kyThuatSummary = showKTSection
    ? await fetchKyThuatSummary(currentYear, callerProfileForKT).catch((e: any) => {
        console.warn('[dashboard kyThuatSummary]', e?.message);
        return null;
      })
    : null;

  // Parallel fetch toàn bộ data dashboard cần. Mỗi fetch wrap fallback để 1 nguồn fail
  // không làm sập cả dashboard.
  const [facilities, salesReport, taskCounts] = await Promise.all([
    fetchDashboardBranches().catch((e) => { console.warn('[dashboard] facilities', e?.message); return []; }),
    fetchSalesReport(
      {
        uid: profile.id,
        role_code: profile.roleCode,
        facility_id: profile.branchId,
        department_id: profile.departmentId,
        shift_assignment: profile.shiftAssignment,
        is_shared_shift_account: profile.isSharedShiftAccount,
      },
      currentYear,
    ).catch((e) => {
      console.warn('[dashboard] salesReport', e?.message);
      return { year: currentYear, branches: [], system: { totalLeads: 0, totalClosed: 0, totalNotClosed: 0, totalRevenue: 0, totalPackagesSold: 0, closeRate: 0 } };
    }),
    fetchTaskCounts(profile.id, profile.roleCode),
  ]);

  // Aggregate revenue summary — LIÊN THÔNG với /doanh-so: filter active sale roles (NV_SALE + NV_SALE_PT)
  // để 2 trang show cùng 1 số. Lý do: mergeRegistry ở /doanh-so chỉ tính active sales — dashboard phải khớp.
  const db = getFirebaseAdminDb();
  const { SALE_ROLE_CODES } = await import('@/lib/sales-roles');
  const usersSnap = await db.collection(COLLECTIONS.USERS)
    .where('status', '==', 'active').where('roleId', 'in', SALE_ROLE_CODES as unknown as string[]).get();
  const activeByBranch: Record<string, Set<string>> = {};
  for (const d of usersSnap.docs) {
    const x = d.data();
    if (!x.branchId) continue;
    (activeByBranch[x.branchId] ??= new Set()).add(d.id);
  }
  // Sentinel '__aggregate' (entries nhập mode-tháng không gắn sale) cũng được tính.
  const yearTarget = salesReport.branches.reduce((s, b) => s + (b.yearTarget ?? 0), 0);
  const monthTarget = salesReport.branches.reduce((s, b) => s + (b.monthTargets?.[monthIdx] ?? 0), 0);
  let yearActual = 0;
  let monthActual = 0;
  for (const b of salesReport.branches) {
    const activeIds = activeByBranch[b.branchId] ?? new Set<string>();
    for (const s of b.staff) {
      if (s.saleId !== '__aggregate' && !activeIds.has(s.saleId)) continue; // filter inactive
      yearActual += s.totalRevenue;
      monthActual += s.revenueByMonth[monthIdx] ?? 0;
    }
  }

  const revenueSummary = {
    year: currentYear,
    month: currentMonth,
    yearActual, yearTarget,
    monthActual, monthTarget,
    branchCount: salesReport.branches.length,
  };

  // Checklist v2 supervisor widget — chỉ hiện cho ADMIN/CEO/GD_KD/GD_VP/TP_KT.
  const isChecklistV2Supervisor = checklistV2SupervisorScope(profile.roleCode) !== null;

  return (
    <>
      <AppTopBar
        title="Green Pool System"
        subtitle={`Dashboard · ${profile.roleName ?? profile.roleCode}`}
        icon="home"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        {/* Phase 13.7 (2026-06-05): bỏ EnableNotiBanner — chuyển vào /bao-mat (Cài đặt) theo yêu cầu anh.
            User chủ động bật trong /bao-mat → bật 1 lần dùng mãi. Không hiện banner ép buộc. */}
        {isSystemAdmin && systemErrorCount > 0 && (
          <div className="mb-4 rounded-lg ring-1 ring-rose-300 bg-rose-50 px-4 py-3 flex items-start gap-3 text-rose-900">
            <span className="text-xl shrink-0">⚠️</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                Có {systemErrorCount} lỗi hệ thống chưa xử lý
              </div>
              <div className="text-xs text-rose-700 mt-0.5">
                <a href="/api/admin/system-errors?limit=50" className="underline">Xem chi tiết</a>
                {' · '}Liên hệ team dev để khắc phục, sau đó đánh dấu <em>handled</em>.
              </div>
            </div>
          </div>
        )}
        {isChecklistV2Supervisor && (
          <div className="mb-4">
            <ChecklistV2SupervisorWidget myUid={profile.id} />
          </div>
        )}
        <DashboardContent
          roleCode={profile.roleCode}
          facilities={facilities as unknown as Facility[]}
          tasks={[] as Task[]}
          taskCounts={taskCounts}
          revenueSummary={revenueSummary}
          visibleFacilities={visibleFacilities}
          isAdmin={isAdmin}
          kyThuatSummary={kyThuatSummary}
          ktVisibleBranchIds={ktVisibleBranchIds}
        />
      </div>
    </>
  );
}

// Lightweight task counter cho dashboard — không qua API HTTP, đọc trực tiếp Firestore.
// Wrap try/catch từng query: nếu 1 query fail (vd index chưa build) → trả 0 thay vì crash page.
async function fetchTaskCounts(uid: string, roleCode: string) {
  const db = getFirebaseAdminDb();
  const col = db.collection(COLLECTIONS.TASKS);
  const isCEO = roleCode === 'CEO' || roleCode === 'ADMIN';
  const isGD = roleCode === 'GD_KD' || roleCode === 'GD_VP';

  // Tasks chờ tôi duyệt (chỉ CEO/GĐ Khối có) — orderBy để khớp composite index 3-field đã deploy
  let approvalCount = 0;
  try {
    if (isCEO) {
      const snap = await col
        .where('status', '==', 'pending_approval')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();
      approvalCount = snap.size;
    } else if (isGD) {
      // Phase B.7 phase 2 (2026-06-07): query theo currentApprover = 'role:<roleCode>'.
      // Phase Stability 2026-06-09: query 2 lần — role-key + user-key (Phase 12.5+
      // proposal cross-block có thể assign user cụ thể qua chain). Merge để
      // GĐ Khối thấy đủ docs chờ mình duyệt.
      const [roleSnap, userSnap] = await Promise.all([
        col
          .where('status', '==', 'pending_approval')
          .where('currentApprover', '==', `role:${roleCode}`)
          .orderBy('createdAt', 'desc')
          .limit(200)
          .get(),
        col
          .where('status', '==', 'pending_approval')
          .where('currentApprover', '==', `user:${uid}`)
          .orderBy('createdAt', 'desc')
          .limit(200)
          .get(),
      ]);
      const seen = new Set<string>();
      roleSnap.docs.forEach((d) => seen.add(d.id));
      userSnap.docs.forEach((d) => seen.add(d.id));
      approvalCount = seen.size;
    }
  } catch (e: any) {
    console.warn('[dashboard fetchTaskCounts] approval query failed:', e?.code, e?.message);
  }

  // Tasks assign trực tiếp tôi (count theo status)
  let pending = 0, inProgress = 0, done = 0, total = 0;
  try {
    const snap = await col
      .where('assigneeUserIds', 'array-contains', uid)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    total = snap.size;
    for (const d of snap.docs) {
      const s = d.data().status;
      if (s === 'pending') pending++;
      else if (s === 'in_progress') inProgress++;
      else if (s === 'done') done++;
    }
  } catch (e: any) {
    console.warn('[dashboard fetchTaskCounts] assigned query failed:', e?.code, e?.message);
  }

  // Checklist v2 hôm nay: số ca đã gửi + số thông báo chưa xem (supervisor)
  let checklistSent = 0;
  let checklistUnread = 0;
  try {
    const db2 = getFirebaseAdminDb();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    // Số ca đã nộp hôm nay (chỉ hiện cho nhân viên điều vận)
    const [clSnap, notiSnap] = await Promise.all([
      db2.collection(COLLECTIONS.CHECKLIST_RUNS_V2)
        .where('ownerId', '==', uid)
        .where('date', '==', today)
        .where('status', '==', 'submitted')
        .get(),
      // Số notification chưa xem trong 24h (chỉ supervisor)
      db2.collection(COLLECTIONS.CHECKLIST_NOTIFICATIONS_V2)
        .where('submittedAt', '>=', new Date(Date.now() - 86400000).toISOString())
        .limit(100)
        .get(),
    ]);
    checklistSent = clSnap.size;
    checklistUnread = notiSnap.docs.filter(
      (d) => { const s = d.data().seenBy; return !Array.isArray(s) || !s.includes(uid); }
    ).length;
  } catch (_e) { /* ignore */ }

  return {
    approvalNeeded: approvalCount,
    myPending: pending,
    myInProgress: inProgress,
    myDone: done,
    myTotal: total,
    checklistSent,
    checklistUnread,
  };
}
