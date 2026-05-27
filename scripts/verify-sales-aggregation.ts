// Verify aggregation cho /doanh-so dashboard.
// In ra raw totals + so sánh với logic dashboard (fetchSalesReport + BranchCard/SystemCard).
// CHỈ ĐỌC, KHÔNG GHI.
//
// Chạy:  npx --yes tsx scripts/verify-sales-aggregation.ts [year]
// VD:    npx --yes tsx scripts/verify-sales-aggregation.ts 2026

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// ----- bootstrap Firebase Admin -----
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS (đường dẫn .json không tồn tại)');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
  });
}
const db = getFirestore();

// ----- constants -----
const YEAR = Number(process.argv[2] || new Date().getFullYear());
const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;
const SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;

// ----- helpers -----
function fmtVND(n: number): string {
  return n.toLocaleString('vi-VN');
}
function pct(num: number, den: number): string {
  return den > 0 ? `${((num / den) * 100).toFixed(1)}%` : 'n/a';
}
function hr(c = '─', w = 78) { console.log(c.repeat(w)); }
function title(t: string) { console.log(); hr('═'); console.log(`  ${t}`); hr('═'); }

// ----- aggregators -----
interface BranchTotals {
  branchId: string;
  // From salesEntries (lead grid):
  leads: number; closed: number; notClosed: number;
  // From packageSales (revenue grid):
  packagesQty: number; revenue: number;
  // Per-source from salesEntries:
  bySource: Record<string, { leads: number; closed: number }>;
  // Per-month from salesEntries / packageSales:
  byMonth: Array<{ month: number; leads: number; closed: number; packages: number; revenue: number }>;
  // Per-sale revenue (from packageSales):
  bySale: Record<string, { saleName: string; revenue: number; packages: number; closed: number }>;
  // Per-periodType + duplicate detection:
  monthEntriesByMonth: Record<number, number>;   // count docs periodType=month
  dayEntriesByMonth: Record<number, number>;     // count docs periodType=day
  monthPkgByMonth: Record<number, number>;       // count packageSales periodType=month
  dayPkgByMonth: Record<number, number>;
}

function emptyBranch(branchId: string): BranchTotals {
  return {
    branchId,
    leads: 0, closed: 0, notClosed: 0,
    packagesQty: 0, revenue: 0,
    bySource: Object.fromEntries(SOURCES.map((s) => [s, { leads: 0, closed: 0 }])),
    byMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, leads: 0, closed: 0, packages: 0, revenue: 0 })),
    bySale: {},
    monthEntriesByMonth: {}, dayEntriesByMonth: {},
    monthPkgByMonth: {}, dayPkgByMonth: {},
  };
}

async function main() {
  console.log(`Verify aggregation năm ${YEAR}\n`);

  // 1. Pull raw collections
  const [entriesSnap, pkgSalesSnap, tgtSnap, salesSnap, leadsSnap] = await Promise.all([
    db.collection('salesEntries').where('year', '==', YEAR).get(),
    db.collection('packageSales').where('year', '==', YEAR).get(),
    db.collection('salesTargets').where('year', '==', YEAR).get(),
    db.collection('sales').get(),                  // Legacy Phase 6 collection — check nếu có data
    db.collection('leads').get(),                  // Legacy — check
  ]);

  console.log(`📥 RAW DOC COUNTS (year=${YEAR}):`);
  console.log(`  salesEntries  : ${entriesSnap.size}`);
  console.log(`  packageSales  : ${pkgSalesSnap.size}`);
  console.log(`  salesTargets  : ${tgtSnap.size}`);
  console.log(`  sales (legacy): ${salesSnap.size}    ← Phase 6 collection; dashboard KHÔNG đọc, kiểm tra có ghi nhầm không`);
  console.log(`  leads (legacy): ${leadsSnap.size}    ← Phase 6 collection; dashboard KHÔNG đọc`);

  // 2. Aggregate from salesEntries
  const branchMap: Record<string, BranchTotals> = {};
  const ensureBranch = (id: string) => (branchMap[id] ??= emptyBranch(id));

  for (const d of entriesSnap.docs) {
    const x = d.data() as any;
    const b = ensureBranch(x.branchId);
    const leads = Number(x.leads ?? 0);
    const closed = Number(x.closed ?? 0);
    const notClosed = Number(x.notClosed ?? 0);
    const src: string = SOURCES.includes(x.source) ? x.source : 'Walk-in';
    const m: number = Number(x.month ?? 0);

    b.leads += leads;
    b.closed += closed;
    b.notClosed += notClosed;
    b.bySource[src].leads += leads;
    b.bySource[src].closed += closed;
    if (m >= 1 && m <= 12) {
      b.byMonth[m - 1].leads += leads;
      b.byMonth[m - 1].closed += closed;
    }
    if (x.periodType === 'month') b.monthEntriesByMonth[m] = (b.monthEntriesByMonth[m] ?? 0) + 1;
    if (x.periodType === 'day')   b.dayEntriesByMonth[m]   = (b.dayEntriesByMonth[m]   ?? 0) + 1;
  }

  // 3. Aggregate from packageSales
  for (const d of pkgSalesSnap.docs) {
    const x = d.data() as any;
    const b = ensureBranch(x.branchId);
    const qty = Number(x.quantity ?? 0);
    const rev = Number(x.revenue ?? 0);
    const m: number = Number(x.month ?? 0);

    b.packagesQty += qty;
    b.revenue += rev;
    if (m >= 1 && m <= 12) {
      b.byMonth[m - 1].packages += qty;
      b.byMonth[m - 1].revenue += rev;
    }
    const sid: string = x.saleId ?? '__aggregate';
    const sname: string = x.saleName ?? 'Tổng cơ sở';
    b.bySale[sid] ??= { saleName: sname, revenue: 0, packages: 0, closed: 0 };
    b.bySale[sid].revenue += rev;
    b.bySale[sid].packages += qty;
    if (x.periodType === 'month') b.monthPkgByMonth[m] = (b.monthPkgByMonth[m] ?? 0) + 1;
    if (x.periodType === 'day')   b.dayPkgByMonth[m]   = (b.dayPkgByMonth[m]   ?? 0) + 1;
  }

  // 4. Build target map
  const targetByBranch: Record<string, { yearTarget: number; monthTargets: number[] | null; yearLeadTarget: number }> = {};
  for (const d of tgtSnap.docs) {
    const x = d.data() as any;
    targetByBranch[x.branchId] = {
      yearTarget: Number(x.yearTarget ?? 0),
      monthTargets: Array.isArray(x.monthTargets) && x.monthTargets.length === 12
        ? x.monthTargets.map((n: any) => Number(n ?? 0))
        : null,
      yearLeadTarget: Number(x.yearLeadTarget ?? 0),
    };
  }

  // 5. PER-BRANCH OUTPUT
  for (const bid of ALL_BRANCHES) {
    const b = branchMap[bid] ?? emptyBranch(bid);
    const t = targetByBranch[bid];
    title(`Cơ sở ${bid}`);
    console.log(`  Lead total       : ${b.leads}`);
    console.log(`  Closed total     : ${b.closed}`);
    console.log(`  NotClosed total  : ${b.notClosed}  (raw stored; logic mới đang auto = leads-closed = ${Math.max(0, b.leads - b.closed)})`);
    console.log(`  Close rate       : ${pct(b.closed, b.leads)}`);
    console.log(`  Packages sold    : ${b.packagesQty}`);
    console.log(`  REVENUE năm      : ${fmtVND(b.revenue)} VND`);
    console.log(`  YearTarget       : ${t ? fmtVND(t.yearTarget) + ' VND' : '(chưa đặt)'}`);
    console.log(`  Achievement      : ${t && t.yearTarget > 0 ? pct(b.revenue, t.yearTarget) : 'n/a'}`);
    console.log();
    console.log(`  Theo nguồn:`);
    for (const s of SOURCES) {
      const x = b.bySource[s];
      console.log(`    ${s.padEnd(10)} leads=${String(x.leads).padStart(5)}  closed=${String(x.closed).padStart(5)}  rate=${pct(x.closed, x.leads)}`);
    }
    console.log();
    console.log(`  Theo tháng (M=#docs month-mode / D=#docs day-mode):`);
    b.byMonth.forEach((m) => {
      if (m.leads === 0 && m.revenue === 0 && m.packages === 0) return;
      const mE = b.monthEntriesByMonth[m.month] ?? 0;
      const dE = b.dayEntriesByMonth[m.month] ?? 0;
      const mP = b.monthPkgByMonth[m.month] ?? 0;
      const dP = b.dayPkgByMonth[m.month] ?? 0;
      const dup = (mE > 0 && dE > 0) || (mP > 0 && dP > 0);
      console.log(`    T${String(m.month).padStart(2)}: leads=${String(m.leads).padStart(4)} closed=${String(m.closed).padStart(4)} pkgs=${String(m.packages).padStart(4)} rev=${String(fmtVND(m.revenue)).padStart(15)} | entriesM/D=${mE}/${dE} pkgM/D=${mP}/${dP}${dup ? ' ⚠️ DOUBLE-MODE' : ''}`);
    });
    console.log();
    console.log(`  Theo Sale (revenue/closed nguồn = packageSales/salesEntries):`);
    const saleList = Object.entries(b.bySale).sort((a, b) => b[1].revenue - a[1].revenue);
    for (const [sid, s] of saleList) {
      const label = sid === '__aggregate' ? '__aggregate (month-mode)' : sid;
      console.log(`    ${label.padEnd(30)}  rev=${fmtVND(s.revenue).padStart(15)}  pkgs=${String(s.packages).padStart(4)}  (${s.saleName})`);
    }
  }

  // 6. SYSTEM TOTAL
  title('TỔNG HỆ THỐNG (5 cơ sở)');
  const sys = ALL_BRANCHES.reduce(
    (acc, bid) => {
      const b = branchMap[bid] ?? emptyBranch(bid);
      acc.leads += b.leads;
      acc.closed += b.closed;
      acc.revenue += b.revenue;
      acc.packages += b.packagesQty;
      return acc;
    },
    { leads: 0, closed: 0, revenue: 0, packages: 0 },
  );
  const sysTargetYear = ALL_BRANCHES.reduce((s, bid) => s + (targetByBranch[bid]?.yearTarget ?? 0), 0);
  console.log(`  TỔNG LEAD       : ${sys.leads}`);
  console.log(`  TỔNG CHỐT       : ${sys.closed}  (close rate ${pct(sys.closed, sys.leads)})`);
  console.log(`  TỔNG GÓI BÁN    : ${sys.packages}`);
  console.log(`  TỔNG REVENUE YR : ${fmtVND(sys.revenue)} VND`);
  console.log(`  TỔNG TARGET YR  : ${fmtVND(sysTargetYear)} VND`);
  console.log(`  Achievement     : ${pct(sys.revenue, sysTargetYear)}`);

  // 7. ĐỐI CHIẾU VỚI DASHBOARD (theo công thức hiện tại của file RevenueDashboardPage.tsx)
  title('ĐỐI CHIẾU VỚI DASHBOARD HIỆN TẠI (logic ở RevenueDashboardPage.tsx)');
  console.log(`  CHÚ Ý: Dashboard hiện tại đang dùng các công thức SAI (chi tiết trong report).`);
  console.log();
  console.log(`  Dashboard "Tổng tháng" (SystemProgressCard scope=month):`);
  console.log(`    target = sum(branch.sales[].target) = ${fmtVND(sysTargetYear)} VND  ← thực chất là YEAR target`);
  console.log(`    actual = sum(branch.sales[].actual) = ${fmtVND(sys.revenue)} VND     ← thực chất là YEAR actual`);
  console.log();
  const curMonth = new Date().getMonth() + 1;
  const yearlyTargetWrong = sysTargetYear * 12;
  const yearlyActualWrong = sys.revenue * curMonth;
  console.log(`  Dashboard "Tổng năm" (SystemProgressCard scope=year):`);
  console.log(`    target = sysTarget × 12  = ${fmtVND(yearlyTargetWrong)} VND   ❌ phóng đại 12×`);
  console.log(`    actual = sysActual × month=${curMonth} = ${fmtVND(yearlyActualWrong)} VND   ❌ phóng đại ${curMonth}×`);
  console.log(`    rate   = ${pct(yearlyActualWrong, yearlyTargetWrong)} ← chỉ tình cờ cancel khi tỷ lệ month=12 thì đúng (không phải)`);
  console.log();
  console.log(`  CÔNG THỨC ĐÚNG:`);
  console.log(`    Tổng năm    target = ${fmtVND(sysTargetYear)} VND, actual = ${fmtVND(sys.revenue)} VND, rate = ${pct(sys.revenue, sysTargetYear)}`);
  const monthIdx = curMonth - 1;
  const sysMonthTarget = ALL_BRANCHES.reduce((s, bid) => {
    const mt = targetByBranch[bid]?.monthTargets;
    return s + (mt ? Number(mt[monthIdx] ?? 0) : 0);
  }, 0);
  const sysMonthActual = ALL_BRANCHES.reduce((s, bid) => {
    const b = branchMap[bid] ?? emptyBranch(bid);
    return s + b.byMonth[monthIdx].revenue;
  }, 0);
  console.log(`    Tổng T${curMonth}      target = ${fmtVND(sysMonthTarget)} VND, actual = ${fmtVND(sysMonthActual)} VND, rate = ${pct(sysMonthActual, sysMonthTarget)}`);

  // 8. WARN: double-mode entries
  title('CẢNH BÁO TIỀM NĂNG DOUBLE-COUNT');
  let dupFound = false;
  for (const bid of ALL_BRANCHES) {
    const b = branchMap[bid];
    if (!b) continue;
    for (let m = 1; m <= 12; m++) {
      const e = (b.monthEntriesByMonth[m] ?? 0) > 0 && (b.dayEntriesByMonth[m] ?? 0) > 0;
      const p = (b.monthPkgByMonth[m] ?? 0) > 0 && (b.dayPkgByMonth[m] ?? 0) > 0;
      if (e || p) {
        dupFound = true;
        console.log(`  ${bid} T${m}: ${e ? 'salesEntries có CẢ month + day' : ''}${e && p ? ' | ' : ''}${p ? 'packageSales có CẢ month + day' : ''}`);
      }
    }
  }
  if (!dupFound) console.log('  ✓ Không tìm thấy double-mode entry cho năm này.');

  console.log();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
