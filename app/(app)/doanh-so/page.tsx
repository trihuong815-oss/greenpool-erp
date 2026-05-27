import { canSeeAllFacilities, isQLCS } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { fetchSalesReport, type BranchAgg, type StaffAgg } from './data.firebase';
import { RevenueDashboardPage } from '@/src/modules/revenue/components/RevenueDashboardPage';

const BRANCH_LABELS: Record<string, string> = {
  HM:  'Green Pool Hoàng Mai',
  TK:  'Green Pool 20 Thuỵ Khuê',
  CTT: 'Green Pool Cung Thể Thao MĐ',
  '24': 'Green Pool 24 NCT',
  TT:  'Green Pool Thanh Trì',
};
// Thứ tự ổn định cho UI list cơ sở.
const ALL_BRANCH_IDS = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

// Tạo BranchAgg rỗng cho cơ sở chưa có dữ liệu (để UI luôn show đủ 5 cơ sở).
function emptyBranch(branchId: string): BranchAgg {
  return {
    branchId,
    totalLeads: 0, totalClosed: 0, totalNotClosed: 0,
    totalPackagesSold: 0, totalRevenue: 0, closeRate: 0,
    sources: {
      MKT:        { leads: 0, closed: 0, notClosed: 0 },
      Sale:       { leads: 0, closed: 0, notClosed: 0 },
      Renew:      { leads: 0, closed: 0, notClosed: 0 },
      Referral:   { leads: 0, closed: 0, notClosed: 0 },
      'Walk-in':  { leads: 0, closed: 0, notClosed: 0 },
    },
    groups: [],
    byMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, packagesSold: 0, leads: 0, closed: 0 })),
    staff: [],
    yearTarget: 0,
    monthTargets: null,
    yearLeadTarget: 0,
    leadTargets: null,
    staffTargets: null,
    packageQuantities: [],
  };
}

// Registry: branchId → list { saleId, saleName } từ users collection (status=active, NV_SALE).
// Mục đích:
//  1. Zero-fill sale active chưa có doanh thu → UI hiện đủ team.
//  2. ẨN sale aggregate có saleId không thuộc registry (vd. inactive/deleted user) → tránh leak tên cũ.
//  3. Giữ sentinel '__aggregate' (data nhập theo tháng không có per-sale).
type SalesRegistry = Record<string, { saleId: string; saleName: string }[]>;

// Server-side: load active NV_SALE users grouped by branchId.
// Một query duy nhất, in-memory group → tránh N+1.
async function fetchSalesRegistry(): Promise<SalesRegistry> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTIONS.USERS)
    .where('status', '==', 'active')
    .where('roleId', '==', 'NV_SALE')
    .get();
  const out: SalesRegistry = {};
  for (const d of snap.docs) {
    const x = d.data();
    const branchId: string | null = x.branchId ?? null;
    if (!branchId) continue;
    (out[branchId] ??= []).push({
      saleId: d.id,
      saleName: x.displayName ?? '(không tên)',
    });
  }
  // Sort theo tên cho UI ổn định
  for (const list of Object.values(out)) {
    list.sort((a, b) => a.saleName.localeCompare(b.saleName, 'vi'));
  }
  return out;
}

function mergeRegistry(b: BranchAgg, registry: SalesRegistry): StaffAgg[] {
  const aggMap = new Map(b.staff.map((s) => [s.saleId, s]));
  const result: StaffAgg[] = [];
  // Sale active của branch: ưu tiên agg data, nếu không có thì zero-fill
  for (const r of registry[b.branchId] ?? []) {
    const agg = aggMap.get(r.saleId);
    if (agg) {
      // Cập nhật saleName từ registry (mới nhất, tránh lệch với users collection)
      result.push({ ...agg, saleName: r.saleName });
    } else {
      const lbms: Record<string, number[]> = {};
      const cbms: Record<string, number[]> = {};
      for (const src of ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in']) {
        lbms[src] = Array(12).fill(0);
        cbms[src] = Array(12).fill(0);
      }
      result.push({
        saleId: r.saleId,
        saleName: r.saleName,
        totalRevenue: 0,
        totalPackagesSold: 0,
        closedNew: 0, closedRenew: 0, closedUpsell: 0,
        revenueByMonth: Array(12).fill(0),
        totalLeads: 0, totalClosed: 0,
        leadsByMonth: Array(12).fill(0),
        closedByMonth: Array(12).fill(0),
        leadsByMonthSource: lbms,
        closedByMonthSource: cbms,
      });
    }
  }
  // Giữ '__aggregate' (entries nhập theo tháng, không gắn sale cụ thể)
  const aggregate = aggMap.get('__aggregate');
  if (aggregate) result.push(aggregate);
  // Sort lại theo doanh thu desc (active sale có data lên trên)
  return result.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function adaptReport(branches: BranchAgg[], salesRegistry: SalesRegistry) {
  return branches.map((b) => {
    const branchName = BRANCH_LABELS[b.branchId] ?? `Cơ sở ${b.branchId}`;
    const hasRealTarget = b.yearTarget > 0;
    const mergedStaff = mergeRegistry(b, salesRegistry);
    const sales = mergedStaff.map((s) => {
      // QLCS-set monthly targets per sale (nếu có) → ưu tiên dùng.
      // Fallback: phân bổ branch yearTarget theo tỉ lệ doanh thu sale.
      const qlcsMonths = b.staffTargets ? b.staffTargets[s.saleId] : null;
      const qlcsYear = qlcsMonths ? qlcsMonths.reduce((a, n) => a + n, 0) : 0;
      let target = 0;
      let monthlyTargets: number[] = qlcsMonths ?? Array(12).fill(0);
      if (qlcsYear > 0) {
        target = qlcsYear;
      } else if (hasRealTarget && b.totalRevenue > 0) {
        target = Math.round(b.yearTarget * (s.totalRevenue / b.totalRevenue));
      } else if (hasRealTarget) {
        target = b.staff.length > 0 ? Math.round(b.yearTarget / b.staff.length) : b.yearTarget;
      }
      return {
        saleId: s.saleId,
        saleName: s.saleId === '__aggregate' ? 'Tổng cơ sở (nhập theo tháng)' : s.saleName,
        actual: s.totalRevenue,
        target,
        revenueByMonth: s.revenueByMonth,       // 12 numbers (actual per month)
        monthlyTargets,                          // 12 numbers (target per month, QLCS-set)
        newCustomers: s.closedNew,
        renewCustomers: s.closedRenew,
        upsellCustomers: s.closedUpsell,
        // Phần 2B — Lead per Sale per Month
        totalLeads: s.totalLeads,
        totalClosed: s.totalClosed,
        leadsByMonth: s.leadsByMonth,
        closedByMonth: s.closedByMonth,
      };
    });
    // byMonth recomputed từ merged sales → đảm bảo sum(sales[].revenueByMonth[m]) === byMonth[m].revenue.
    // Raw b.byMonth bao gồm cả inactive sales' historical (vì aggregate ở data.firebase quét hết),
    // còn sales[] đã filter qua mergeRegistry. Không recompute → BranchCard year (sum sales) ≠ month (byMonth).
    // Fix: byMonth = sum của các sale visible. Deactivate sale → ẩn cả historical trên dashboard.
    // leadsBySource + closedBySource: sum {leads,closed}ByMonthSource per source per month — data thực.
    // Tránh estimate hoặc fake (closedFromLeads dùng random là anti-pattern, đã gỡ).
    const SOURCE_KEYS = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;
    const byMonth = Array.from({ length: 12 }, (_, idx) => {
      let revenue = 0, leads = 0, closed = 0;
      const leadsBySource: Record<string, number> = {};
      const closedBySource: Record<string, number> = {};
      for (const src of SOURCE_KEYS) { leadsBySource[src] = 0; closedBySource[src] = 0; }
      for (const s of mergedStaff) {
        revenue += s.revenueByMonth[idx] ?? 0;
        leads += s.leadsByMonth[idx] ?? 0;
        closed += s.closedByMonth[idx] ?? 0;
        for (const src of SOURCE_KEYS) {
          leadsBySource[src] += s.leadsByMonthSource?.[src]?.[idx] ?? 0;
          closedBySource[src] += s.closedByMonthSource?.[src]?.[idx] ?? 0;
        }
      }
      return {
        month: idx + 1,
        revenue,
        leads,
        closed,
        leadsBySource,
        closedBySource,
        target: b.monthTargets ? Number(b.monthTargets[idx] ?? 0) : null,
      };
    });
    // realSources — RECOMPUTE từ mergedStaff (consistent với mergeRegistry filter).
    // Trước đây forward raw b.sources → có thể bao gồm inactive sales' historical → mismatch với byMonth.
    // Bây giờ: leads/closed/notClosed per source = sum across mergedStaff[].{leads,closed}ByMonthSource.
    // → ∑(byMonth[m].leadsBySource[src]) === realSources[src].leads (year invariant).
    type SourceKey = 'MKT' | 'Sale' | 'Renew' | 'Referral' | 'Walk-in';
    const ALL_SOURCES: readonly SourceKey[] = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'];
    const realSources = ALL_SOURCES.map((src) => {
      let leads = 0, closed = 0;
      for (const s of mergedStaff) {
        const lArr = s.leadsByMonthSource?.[src];
        const cArr = s.closedByMonthSource?.[src];
        if (lArr) for (const v of lArr) leads += v;
        if (cArr) for (const v of cArr) closed += v;
      }
      // notClosed = leads - closed (form auto-compute notClosed = leads - closed nên invariant này luôn đúng).
      const notClosed = Math.max(0, leads - closed);
      const leadTargetMonths = b.leadTargets ? (b.leadTargets[src] ?? null) : null;
      return {
        source: src,
        leads,
        closed,
        notClosed,
        targetLeadsByMonth: leadTargetMonths,
        targetLeadsYear: leadTargetMonths ? leadTargetMonths.reduce((a, n) => a + n, 0) : 0,
      };
    });
    return {
      branchId: b.branchId,
      branchName,
      sales,
      byMonth,
      realSources,
      yearTarget: b.yearTarget,
      monthTargets: b.monthTargets,
      yearLeadTarget: b.yearLeadTarget,
      // PHẦN 3: cơ cấu SL gói theo tháng (từ collection packageQuantities, độc lập revenue).
      packageQuantities: b.packageQuantities,
    };
  });
}

export default async function DoanhSoPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { profile } = await requireAuthedProfile();
  const sp = await searchParams;
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : new Date().getFullYear();

  const isAdmin = canSeeAllFacilities(profile.roleCode);
  const hasFacility = !isAdmin && !!profile.branchId && !!BRANCH_LABELS[profile.branchId];

  const viewer = {
    uid: profile.id,
    name: profile.displayName || profile.roleCode,
    role: (isAdmin ? 'ceo' : isQLCS(profile.roleCode) ? 'branch_manager' : hasFacility ? 'branch_manager' : 'ceo') as
      | 'ceo' | 'business_director' | 'branch_manager' | 'sale' | 'admin',
    branchIds: hasFacility ? [profile.branchId!] : [],
  };

  // Parallel: fetch sales report + active sales registry
  const [realReport, salesRegistry] = await Promise.all([
    fetchSalesReport(
      {
        uid: profile.id,
        role_code: profile.roleCode,
        facility_id: profile.branchId,
        department_id: profile.departmentId,
        shift_assignment: profile.shiftAssignment,
        is_shared_shift_account: profile.isSharedShiftAccount,
      },
      year,
    ),
    fetchSalesRegistry(),
  ]);

  // Zero-fill: đảm bảo UI luôn show đủ cơ sở trong scope, không phụ thuộc data có sẵn.
  // - Admin (CEO/GD_KD/TP) → 5 cơ sở.
  // - QLCS → chỉ branch của họ.
  const visibleBranchIds: readonly string[] = isAdmin
    ? ALL_BRANCH_IDS
    : hasFacility ? [profile.branchId!] : [];
  const byId = new Map(realReport.branches.map((b) => [b.branchId, b]));
  const filledBranches: BranchAgg[] = visibleBranchIds.map((id) => byId.get(id) ?? emptyBranch(id));

  const realBranches = adaptReport(filledBranches, salesRegistry);

  // Pending discrepancies > 24h chưa xử lý — cảnh báo cho admin (CEO/GĐ KD).
  // QLCS không thấy (vì cảnh báo này dành cho cấp cao xử lý).
  const staleDiscrepancies: { branchId: string; branchName: string; year: number; month: number; diff: number; perSaleRev: number; perPkgRev: number; createdAt: string }[] = [];
  if (isAdmin) {
    const db = getFirebaseAdminDb();
    const cutoff = new Date(Date.now() - 24 * 3600_000);
    const discSnap = await db.collection(COLLECTIONS.DISCREPANCIES)
      .where('resolved', '==', false)
      .where('createdAt', '<', cutoff)
      .get();
    for (const d of discSnap.docs) {
      const x = d.data();
      const createdAtIso = x.createdAt && typeof x.createdAt.toDate === 'function'
        ? x.createdAt.toDate().toISOString() : new Date().toISOString();
      staleDiscrepancies.push({
        branchId: x.branchId,
        branchName: BRANCH_LABELS[x.branchId] ?? x.branchId,
        year: x.year,
        month: x.month,
        diff: x.diff,
        perSaleRev: x.perSaleRev,
        perPkgRev: x.perPkgRev,
        createdAt: createdAtIso,
      });
    }
    staleDiscrepancies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  return <RevenueDashboardPage viewer={viewer} realBranches={realBranches} initialYear={year} staleDiscrepancies={staleDiscrepancies} />;
}
