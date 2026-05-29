// Phase 6.D — Aggregate data từ salesEntries + packageSales cho Doanh số dashboard.
// Đọc cả month + day entries trong cùng năm (T1-T5/2025 = month, T6+ = day).
// Không double-count vì user chỉ nhập 1 mode/period.

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { salesFilterForList } from '@/lib/firebase/sales-scope';
import type { CallerProfile } from '@/lib/firebase/checklist-scope';

export const SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;
type Source = typeof SOURCES[number];

export interface SourceLeadStat { leads: number; closed: number; notClosed: number; }
export interface GroupRevenue { groupId: string; groupName: string; qty: number; revenue: number; }

export interface StaffAgg {
  saleId: string;
  saleName: string;
  totalRevenue: number;
  totalPackagesSold: number;
  closedNew: number;       // MKT + Walk-in
  closedRenew: number;     // Renew
  closedUpsell: number;    // Sale + Referral
  revenueByMonth: number[]; // 12 elements (T1..T12)
  totalLeads: number;
  totalClosed: number;
  leadsByMonth: number[];   // 12 elements
  closedByMonth: number[];  // 12 elements
  /** Lead theo nguồn × tháng (T1..T12). 5 sources × 12 months = 60 numbers. */
  leadsByMonthSource: Record<string, number[]>;
  /** Closed (chốt) theo nguồn × tháng — phục vụ recompute realSources sau filter. */
  closedByMonthSource: Record<string, number[]>;
}

/** Cơ cấu SL + Doanh số gói — phục vụ PHẦN 3 (SL) và Section 1C (doanh số/tháng) dashboard.
 *  Tách khỏi packageSales (per Sale) — đây là tổng per branch × tháng × gói. */
export interface PackageQuantityAgg {
  packageId: string;
  packageName: string;
  groupId: string;
  groupName: string;
  qtyByMonth: number[];        // 12 elements — SL gói theo tháng
  totalYearQty: number;        // sum qtyByMonth
  revenueByMonth: number[];    // 12 elements — Doanh số gói theo tháng (Section 3B input)
  totalYearRevenue: number;    // sum revenueByMonth
}

/** Cảnh báo lệch giữa 2 nguồn doanh thu:
 *  - revenuePerSale: tổng từ packageSales (per Sale, includes __total sentinel)
 *  - revenuePerPackage: tổng từ packageQuantities (per Package detail)
 *  Cùng (branch × tháng) nên sum bằng nhau. Nếu lệch → data inconsistent, cần admin kiểm tra. */
export interface RevenueDiscrepancy {
  month: number;             // 1-12 (0 = tổng năm)
  revenuePerSale: number;    // sum packageSales doanh thu
  revenuePerPackage: number; // sum packageQuantities doanh thu
  diff: number;              // perSale - perPackage
}

export interface BranchAgg {
  branchId: string;
  totalLeads: number;
  totalClosed: number;
  totalNotClosed: number;
  totalPackagesSold: number;
  totalRevenue: number;
  closeRate: number;                  // closed / leads
  sources: Record<string, SourceLeadStat>;
  groups: GroupRevenue[];             // doanh thu theo nhóm thẻ
  byMonth: { month: number; revenue: number; packagesSold: number; leads: number; closed: number }[];
  staff: StaffAgg[];                  // breakdown per sale (cho mock UI cũ)
  yearTarget: number;                 // Phase 6.I — admin-set target/year per branch (= sum monthTargets)
  monthTargets: number[] | null;      // 12-month doanh số target
  yearLeadTarget: number;             // = sum tất cả leadTargets
  leadTargets: Record<string, number[]> | null;  // per source × 12 months
  staffTargets: Record<string, number[]> | null; // saleId → 12 months target (QLCS-set)
  /** SL gói theo package × 12 tháng (từ collection packageQuantities, độc lập với revenue). */
  packageQuantities: PackageQuantityAgg[];
  /** Cảnh báo lệch doanh thu per-sale vs per-package — chỉ chứa tháng có lệch > threshold. */
  revenueDiscrepancies: RevenueDiscrepancy[];
}

export interface SalesReport {
  year: number;
  branches: BranchAgg[];
  system: {
    totalLeads: number; totalClosed: number; totalNotClosed: number;
    totalRevenue: number; totalPackagesSold: number; closeRate: number;
  };
}

function emptyMonths(): BranchAgg['byMonth'] {
  return Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, packagesSold: 0, leads: 0, closed: 0 }));
}

function emptySources(): Record<string, SourceLeadStat> {
  const o: Record<string, SourceLeadStat> = {};
  for (const s of SOURCES) o[s] = { leads: 0, closed: 0, notClosed: 0 };
  return o;
}

export async function fetchSalesReport(
  profile: CallerProfile,
  year: number = new Date().getFullYear(),
): Promise<SalesReport> {
  const db = getFirebaseAdminDb();
  const scope = salesFilterForList(profile);
  if (scope.branchIds && scope.branchIds.length === 0) {
    return { year, branches: [], system: { totalLeads: 0, totalClosed: 0, totalNotClosed: 0, totalRevenue: 0, totalPackagesSold: 0, closeRate: 0 } };
  }

  // 1. Query salesEntries (Lead) + packageSales (doanh thu) + salesTargets + packageQuantities (SL gói) WHERE year=...
  let leadQ: FirebaseFirestore.Query = db.collection(COLLECTIONS.SALES_ENTRIES).where('year', '==', year);
  let pkgQ:  FirebaseFirestore.Query = db.collection(COLLECTIONS.PACKAGE_SALES).where('year', '==', year);
  let tgtQ:  FirebaseFirestore.Query = db.collection(COLLECTIONS.SALES_TARGETS).where('year', '==', year);
  let qtyQ:  FirebaseFirestore.Query = db.collection(COLLECTIONS.PACKAGE_QUANTITIES).where('year', '==', year);
  if (scope.branchIds) {
    if (scope.branchIds.length === 1) {
      leadQ = leadQ.where('branchId', '==', scope.branchIds[0]);
      pkgQ = pkgQ.where('branchId', '==', scope.branchIds[0]);
      tgtQ = tgtQ.where('branchId', '==', scope.branchIds[0]);
      qtyQ = qtyQ.where('branchId', '==', scope.branchIds[0]);
    } else {
      leadQ = leadQ.where('branchId', 'in', scope.branchIds.slice(0, 10));
      pkgQ = pkgQ.where('branchId', 'in', scope.branchIds.slice(0, 10));
      tgtQ = tgtQ.where('branchId', 'in', scope.branchIds.slice(0, 10));
      qtyQ = qtyQ.where('branchId', 'in', scope.branchIds.slice(0, 10));
    }
  }
  const [leadSnap, pkgSnap, tgtSnap, qtySnap] = await Promise.all([leadQ.get(), pkgQ.get(), tgtQ.get(), qtyQ.get()]);

  // Pre-load target map (branchId → { yearTarget, monthTargets, yearLeadTarget, leadTargets, staffTargets })
  const targetMap: Record<string, {
    yearTarget: number;
    monthTargets: number[] | null;
    yearLeadTarget: number;
    leadTargets: Record<string, number[]> | null;
    staffTargets: Record<string, number[]> | null;   // saleId → 12 months target
  }> = {};
  for (const d of tgtSnap.docs) {
    const x = d.data();
    const monthTargets = Array.isArray(x.monthTargets) && x.monthTargets.length === 12
      ? x.monthTargets.map((n: unknown) => Number(n ?? 0))
      : null;
    let leadTargets: Record<string, number[]> | null = null;
    if (x.leadTargets && typeof x.leadTargets === 'object') {
      leadTargets = {};
      for (const src of SOURCES) {
        const arr = (x.leadTargets as Record<string, unknown>)[src];
        leadTargets[src] = Array.isArray(arr) && arr.length === 12
          ? arr.map((n: unknown) => Number(n ?? 0))
          : Array(12).fill(0);
      }
    }
    // staffTargets: { [saleId]: number[12] }
    let staffTargets: Record<string, number[]> | null = null;
    if (x.staffTargets && typeof x.staffTargets === 'object') {
      staffTargets = {};
      for (const [saleId, arr] of Object.entries(x.staffTargets as Record<string, unknown>)) {
        staffTargets[saleId] = Array.isArray(arr) && arr.length === 12
          ? arr.map((n: unknown) => Number(n ?? 0))
          : Array(12).fill(0);
      }
    }
    targetMap[x.branchId] = {
      yearTarget: Number(x.yearTarget ?? 0),
      monthTargets,
      yearLeadTarget: Number(x.yearLeadTarget ?? 0),
      leadTargets,
      staffTargets,
    };
  }

  const byBranch: Record<string, BranchAgg> = {};
  const staffMap: Record<string, Record<string, StaffAgg>> = {};  // branchId → saleId → agg

  const ensureBranch = (branchId: string) => {
    if (!byBranch[branchId]) {
      byBranch[branchId] = {
        branchId,
        totalLeads: 0, totalClosed: 0, totalNotClosed: 0,
        totalPackagesSold: 0, totalRevenue: 0, closeRate: 0,
        sources: emptySources(),
        groups: [],
        byMonth: emptyMonths(),
        staff: [],
        yearTarget: 0,
        monthTargets: null,
        yearLeadTarget: 0,
        leadTargets: null,
        staffTargets: null,
        packageQuantities: [],
        revenueDiscrepancies: [],
      };
      staffMap[branchId] = {};
    }
    return byBranch[branchId];
  };
  const ensureStaff = (branchId: string, saleId: string, saleName: string): StaffAgg => {
    ensureBranch(branchId);
    if (!staffMap[branchId][saleId]) {
      const lbms: Record<string, number[]> = {};
      const cbms: Record<string, number[]> = {};
      for (const s of SOURCES) { lbms[s] = Array(12).fill(0); cbms[s] = Array(12).fill(0); }
      staffMap[branchId][saleId] = {
        saleId, saleName,
        totalRevenue: 0, totalPackagesSold: 0,
        closedNew: 0, closedRenew: 0, closedUpsell: 0,
        revenueByMonth: Array(12).fill(0),
        totalLeads: 0, totalClosed: 0,
        leadsByMonth: Array(12).fill(0),
        closedByMonth: Array(12).fill(0),
        leadsByMonthSource: lbms,
        closedByMonthSource: cbms,
      };
    }
    return staffMap[branchId][saleId];
  };

  // De-duplicate periodType: nếu cùng (branchId, month) có cả 'day' và 'month' →
  // ưu tiên 'day' (chi tiết hơn), bỏ qua doc 'month' để không double-count.
  // Tính set "(branchId, month)" mà mỗi collection có ít nhất 1 doc day-mode.
  const leadDayBranchMonths = new Set<string>();
  for (const d of leadSnap.docs) {
    const x = d.data();
    if (x.periodType === 'day') leadDayBranchMonths.add(`${x.branchId}__${x.month}`);
  }
  const pkgDayBranchMonths = new Set<string>();
  for (const d of pkgSnap.docs) {
    const x = d.data();
    if (x.periodType === 'day') pkgDayBranchMonths.add(`${x.branchId}__${x.month}`);
  }

  // 2. Aggregate Lead metrics từ salesEntries
  for (const d of leadSnap.docs) {
    const x = d.data();
    const branchId: string = x.branchId;
    const month: number = x.month ?? 1;
    // Skip month-mode doc nếu cùng tháng đã có day-mode (avoid double-count).
    if (x.periodType === 'month' && leadDayBranchMonths.has(`${branchId}__${month}`)) {
      continue;
    }
    const source: Source = (SOURCES as readonly string[]).includes(x.source) ? x.source : 'Walk-in';
    const leads = Number(x.leads ?? 0);
    const closed = Number(x.closed ?? 0);
    const notClosed = Number(x.notClosed ?? 0);

    const b = ensureBranch(branchId);
    b.totalLeads += leads;
    b.totalClosed += closed;
    b.totalNotClosed += notClosed;
    b.sources[source].leads += leads;
    b.sources[source].closed += closed;
    b.sources[source].notClosed += notClosed;
    if (month >= 1 && month <= 12) {
      b.byMonth[month - 1].leads += leads;
      b.byMonth[month - 1].closed += closed;
    }

    // Per-sale aggregation cho mock UI:
    const saleId: string = x.saleId ?? '__aggregate';
    const saleName: string = x.saleName ?? 'Tổng cơ sở';
    const s = ensureStaff(branchId, saleId, saleName);
    s.totalLeads += leads;
    s.totalClosed += closed;
    if (month >= 1 && month <= 12) {
      s.leadsByMonth[month - 1] += leads;
      s.closedByMonth[month - 1] += closed;
      // Track per-source per-month — phục vụ MonthlyLeadChart (Section 2A) lấy data thực,
      // không dùng estimate từ tỷ trọng năm × tổng tháng (đã từng cho ra số sai).
      s.leadsByMonthSource[source][month - 1] += leads;
      s.closedByMonthSource[source][month - 1] += closed;
    }
    if (source === 'MKT' || source === 'Walk-in') s.closedNew += closed;
    else if (source === 'Renew') s.closedRenew += closed;
    else if (source === 'Sale' || source === 'Referral') s.closedUpsell += closed;
  }

  // 3. Aggregate Revenue metrics từ packageSales (cùng dedup rule)
  const groupRevMap: Record<string, Record<string, GroupRevenue>> = {};  // branchId → groupId → agg
  for (const d of pkgSnap.docs) {
    const x = d.data();
    const branchId: string = x.branchId;
    const month: number = x.month ?? 1;
    if (x.periodType === 'month' && pkgDayBranchMonths.has(`${branchId}__${month}`)) {
      continue;
    }
    // __total sentinel doc: packageId='__total', qty=1 là placeholder (không phải qty thật).
    // Chỉ revenue có ý nghĩa. Bỏ qty để không inflate totalPackagesSold.
    const isTotalSentinel = x.packageId === '__total';
    const qty = isTotalSentinel ? 0 : Number(x.quantity ?? 0);
    const rev = Number(x.revenue ?? 0);

    const b = ensureBranch(branchId);
    b.totalPackagesSold += qty;
    b.totalRevenue += rev;
    if (month >= 1 && month <= 12) {
      b.byMonth[month - 1].packagesSold += qty;
      b.byMonth[month - 1].revenue += rev;
    }

    // Group revenue map — KHÔNG aggregate __total (sentinel cho per-sale tổng, không phải group thật)
    const groupId: string = x.groupId ?? 'unknown';
    const groupName: string = x.groupName ?? 'Khác';
    if (groupId !== '__total') {
      groupRevMap[branchId] ??= {};
      if (!groupRevMap[branchId][groupId]) {
        groupRevMap[branchId][groupId] = { groupId, groupName, qty: 0, revenue: 0 };
      }
      groupRevMap[branchId][groupId].qty += qty;
      groupRevMap[branchId][groupId].revenue += rev;
    }

    // Per-sale revenue + per-sale per-month
    const saleId: string = x.saleId ?? '__aggregate';
    const saleName: string = x.saleName ?? 'Tổng cơ sở';
    const s = ensureStaff(branchId, saleId, saleName);
    s.totalRevenue += rev;
    s.totalPackagesSold += qty;
    if (month >= 1 && month <= 12) {
      s.revenueByMonth[month - 1] += rev;
    }
  }

  // ───── Aggregate packageQuantities (cơ cấu SL + Doanh số gói per branch × month × package) ─────
  // Key: branchId → packageId → PackageQuantityAgg
  const pkgQtyMap: Record<string, Record<string, PackageQuantityAgg>> = {};
  for (const d of qtySnap.docs) {
    const x = d.data();
    const branchId: string = x.branchId;
    const month: number = Number(x.month);
    if (!(month >= 1 && month <= 12)) continue;
    const packageId: string = x.packageId;
    if (!packageId) continue;
    ensureBranch(branchId);
    pkgQtyMap[branchId] ??= {};
    if (!pkgQtyMap[branchId][packageId]) {
      pkgQtyMap[branchId][packageId] = {
        packageId,
        packageName: x.packageName ?? '(không tên)',
        groupId: x.groupId ?? 'unknown',
        groupName: x.groupName ?? 'Khác',
        qtyByMonth: Array(12).fill(0),
        totalYearQty: 0,
        revenueByMonth: Array(12).fill(0),
        totalYearRevenue: 0,
      };
    }
    const qty = Number(x.quantity ?? 0);
    const rev = Number(x.revenue ?? 0);
    pkgQtyMap[branchId][packageId].qtyByMonth[month - 1] += qty;
    pkgQtyMap[branchId][packageId].totalYearQty += qty;
    pkgQtyMap[branchId][packageId].revenueByMonth[month - 1] += rev;
    pkgQtyMap[branchId][packageId].totalYearRevenue += rev;
  }

  // Ensure all branches with targets show up even if zero entries
  for (const branchId of Object.keys(targetMap)) ensureBranch(branchId);

  // 4. Finalize per-branch (+ apply targets + compute discrepancy)
  // Invariant: ∑(packageSales.revenue) === ∑(packageQuantities.revenue) per (branch × month).
  // Cùng nguồn data, chỉ khác cách aggregate. Lệch → admin nhập sai 1 trong 2 chỗ.
  const DISCREPANCY_THRESHOLD = 1000; // ≤1000đ tính là noise (lỗi làm tròn), >1000đ mới warn
  for (const b of Object.values(byBranch)) {
    b.closeRate = b.totalLeads === 0 ? 0 : b.totalClosed / b.totalLeads;
    b.groups = Object.values(groupRevMap[b.branchId] ?? {}).sort((a, b) => b.revenue - a.revenue);
    b.staff = Object.values(staffMap[b.branchId] ?? {}).sort((a, b) => b.totalRevenue - a.totalRevenue);
    // packageQuantities: sort theo group → totalYearQty desc trong group → tên gói
    b.packageQuantities = Object.values(pkgQtyMap[b.branchId] ?? {})
      .sort((a, b) => {
        const g = a.groupName.localeCompare(b.groupName, 'vi');
        if (g !== 0) return g;
        return b.totalYearQty - a.totalYearQty;
      });
    const t = targetMap[b.branchId];
    if (t) {
      b.yearTarget = t.yearTarget;
      b.monthTargets = t.monthTargets;
      b.yearLeadTarget = t.yearLeadTarget;
      b.leadTargets = t.leadTargets;
      b.staffTargets = t.staffTargets;
    }

    // Compute discrepancy: so sánh byMonth.revenue (từ packageSales) vs sum packageQuantities.revenueByMonth
    const discrepancies: RevenueDiscrepancy[] = [];
    let yearPerSale = 0, yearPerPackage = 0;
    for (let m = 1; m <= 12; m++) {
      const perSale = b.byMonth[m - 1]?.revenue ?? 0;
      let perPackage = 0;
      for (const pq of b.packageQuantities) {
        perPackage += pq.revenueByMonth[m - 1] ?? 0;
      }
      yearPerSale += perSale;
      yearPerPackage += perPackage;
      const diff = perSale - perPackage;
      // Chỉ cảnh báo tháng có data (1 trong 2 nguồn > 0) và lệch > threshold
      if ((perSale > 0 || perPackage > 0) && Math.abs(diff) > DISCREPANCY_THRESHOLD) {
        discrepancies.push({ month: m, revenuePerSale: perSale, revenuePerPackage: perPackage, diff });
      }
    }
    // Year-level discrepancy (month=0 sentinel)
    const yearDiff = yearPerSale - yearPerPackage;
    if ((yearPerSale > 0 || yearPerPackage > 0) && Math.abs(yearDiff) > DISCREPANCY_THRESHOLD) {
      discrepancies.unshift({ month: 0, revenuePerSale: yearPerSale, revenuePerPackage: yearPerPackage, diff: yearDiff });
    }
    b.revenueDiscrepancies = discrepancies;
  }

  // 5. System aggregate
  const branches = Object.values(byBranch).sort((a, b) => b.totalRevenue - a.totalRevenue);
  const system = branches.reduce(
    (acc, b) => {
      acc.totalLeads += b.totalLeads;
      acc.totalClosed += b.totalClosed;
      acc.totalNotClosed += b.totalNotClosed;
      acc.totalRevenue += b.totalRevenue;
      acc.totalPackagesSold += b.totalPackagesSold;
      return acc;
    },
    { totalLeads: 0, totalClosed: 0, totalNotClosed: 0, totalRevenue: 0, totalPackagesSold: 0, closeRate: 0 },
  );
  system.closeRate = system.totalLeads === 0 ? 0 : system.totalClosed / system.totalLeads;

  return { year, branches, system };
}
