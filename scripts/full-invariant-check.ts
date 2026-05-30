// Comprehensive data invariant verification — đảm bảo số liệu hiển thị KHÔNG sai sót.
// Tự compute từ raw collections rồi mô phỏng aggregation/adaptReport logic, so sánh.
// Run: GOOGLE_APPLICATION_CREDENTIALS=... npx --yes tsx scripts/full-invariant-check.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) { console.error('Missing GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1); }
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

const BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;
const SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;
const YEAR = 2026;

(async () => {
  console.log(`\n🔬 INVARIANT CHECK — Year ${YEAR}, 5 cơ sở\n`);

  // Load active sale roles (NV_SALE + NV_SALE_PT) — đồng bộ với app code (lib/sales-roles.ts)
  const usersSnap = await db.collection('users')
    .where('status', '==', 'active').where('roleId', 'in', ['NV_SALE', 'NV_SALE_PT']).get();
  const activeByBranch: Record<string, Set<string>> = {};
  for (const d of usersSnap.docs) {
    const b: string | null = d.data().branchId ?? null;
    if (!b) continue;
    activeByBranch[b] ??= new Set();
    activeByBranch[b].add(d.id);
  }

  let totalFailures = 0;

  for (const branchId of BRANCHES) {
    const activeSet = activeByBranch[branchId] ?? new Set<string>();
    // Mặc định: kèm __aggregate
    activeSet.add('__aggregate');

    // Fetch raw data
    const [leadSnap, pkgSnap, qtySnap] = await Promise.all([
      db.collection('salesEntries').where('branchId', '==', branchId).where('year', '==', YEAR).get(),
      db.collection('packageSales').where('branchId', '==', branchId).where('year', '==', YEAR).get(),
      db.collection('packageQuantities').where('branchId', '==', branchId).where('year', '==', YEAR).get(),
    ]);

    // Lead aggregation (dedup periodType: skip month if day exists for same month)
    const leadDayMonths = new Set<number>();
    for (const d of leadSnap.docs) if (d.data().periodType === 'day') leadDayMonths.add(d.data().month);

    // Per-staff per-source per-month (sau filter active)
    const staffSrcMonth: Record<string, Record<string, number[]>> = {}; // saleId → source → [12 leads]
    const staffSrcMonthC: Record<string, Record<string, number[]>> = {}; // closed
    let branchTotalLeads = 0, branchTotalClosed = 0;
    const byMonthLeads = Array(12).fill(0);
    const byMonthClosed = Array(12).fill(0);
    const bySrcLeads: Record<string, number> = {};
    const bySrcClosed: Record<string, number> = {};
    for (const s of SOURCES) { bySrcLeads[s] = 0; bySrcClosed[s] = 0; }

    for (const d of leadSnap.docs) {
      const x = d.data();
      const m = x.month;
      if (x.periodType === 'month' && leadDayMonths.has(m)) continue; // dedup
      const sid = x.saleId ?? '__aggregate';
      if (!activeSet.has(sid)) continue; // mergeRegistry filter
      const src = SOURCES.includes(x.source) ? x.source : 'Walk-in';
      const l = Number(x.leads ?? 0);
      const c = Number(x.closed ?? 0);
      staffSrcMonth[sid] ??= {};
      staffSrcMonth[sid][src] ??= Array(12).fill(0);
      staffSrcMonth[sid][src][m - 1] += l;
      staffSrcMonthC[sid] ??= {};
      staffSrcMonthC[sid][src] ??= Array(12).fill(0);
      staffSrcMonthC[sid][src][m - 1] += c;
      branchTotalLeads += l;
      branchTotalClosed += c;
      byMonthLeads[m - 1] += l;
      byMonthClosed[m - 1] += c;
      bySrcLeads[src] += l;
      bySrcClosed[src] += c;
    }

    // INVARIANT 1: sum(per-staff per-src per-month) === byMonthLeads
    let inv1Pass = true;
    for (let m = 0; m < 12; m++) {
      let sumStaff = 0;
      for (const sid of Object.keys(staffSrcMonth)) {
        for (const src of SOURCES) sumStaff += staffSrcMonth[sid][src]?.[m] ?? 0;
      }
      if (sumStaff !== byMonthLeads[m]) {
        console.log(`  ❌ [${branchId}] T${m + 1}: ∑staff×src=${sumStaff} ≠ byMonth=${byMonthLeads[m]}`);
        inv1Pass = false;
        totalFailures++;
      }
    }

    // INVARIANT 2: sum(per-month per-src) === realSources.leads
    let inv2Pass = true;
    for (const src of SOURCES) {
      let sumMonths = 0;
      for (let m = 0; m < 12; m++) {
        for (const sid of Object.keys(staffSrcMonth)) {
          sumMonths += staffSrcMonth[sid][src]?.[m] ?? 0;
        }
      }
      if (sumMonths !== bySrcLeads[src]) {
        console.log(`  ❌ [${branchId}] ${src}: ∑month=${sumMonths} ≠ year=${bySrcLeads[src]}`);
        inv2Pass = false;
        totalFailures++;
      }
    }

    // INVARIANT 3: sum byMonthLeads === branchTotalLeads
    const sumByMonth = byMonthLeads.reduce((a, n) => a + n, 0);
    if (sumByMonth !== branchTotalLeads) {
      console.log(`  ❌ [${branchId}] ∑byMonth(leads)=${sumByMonth} ≠ totalLeads=${branchTotalLeads}`);
      totalFailures++;
    }

    // PackageSales aggregation (dedup periodType)
    const pkgDayMonths = new Set<number>();
    for (const d of pkgSnap.docs) if (d.data().periodType === 'day') pkgDayMonths.add(d.data().month);
    let branchRevenue = 0;
    const staffRevenueByMonth: Record<string, number[]> = {};
    const byMonthRevenue = Array(12).fill(0);
    for (const d of pkgSnap.docs) {
      const x = d.data();
      const m = x.month;
      if (x.periodType === 'month' && pkgDayMonths.has(m)) continue;
      const sid = x.saleId ?? '__aggregate';
      if (!activeSet.has(sid)) continue;
      const rev = Number(x.revenue ?? 0);
      staffRevenueByMonth[sid] ??= Array(12).fill(0);
      staffRevenueByMonth[sid][m - 1] += rev;
      branchRevenue += rev;
      byMonthRevenue[m - 1] += rev;
    }

    // INVARIANT 4: sum staff[].revenueByMonth[m] === byMonthRevenue[m]
    let inv4Pass = true;
    for (let m = 0; m < 12; m++) {
      let s = 0;
      for (const sid of Object.keys(staffRevenueByMonth)) s += staffRevenueByMonth[sid][m] ?? 0;
      if (s !== byMonthRevenue[m]) {
        console.log(`  ❌ [${branchId}] T${m + 1} REV: ∑staff=${s} ≠ byMonth=${byMonthRevenue[m]}`);
        inv4Pass = false;
        totalFailures++;
      }
    }

    // INVARIANT 5: sum byMonthRevenue === branchRevenue
    const sumRev = byMonthRevenue.reduce((a, n) => a + n, 0);
    if (sumRev !== branchRevenue) {
      console.log(`  ❌ [${branchId}] ∑byMonth(rev)=${sumRev} ≠ totalRev=${branchRevenue}`);
      totalFailures++;
    }

    // Package qty + revenue (Section 1C + 3)
    const pkgRevByPkg: Record<string, number[]> = {};
    let pkgTotalYearRev = 0;
    for (const d of qtySnap.docs) {
      const x = d.data();
      const m = Number(x.month);
      const pid = x.packageId;
      if (!pid || !(m >= 1 && m <= 12)) continue;
      const rev = Number(x.revenue ?? 0);
      pkgRevByPkg[pid] ??= Array(12).fill(0);
      pkgRevByPkg[pid][m - 1] += rev;
      pkgTotalYearRev += rev;
    }
    let sumPkgYearRev = 0;
    for (const pid of Object.keys(pkgRevByPkg)) {
      sumPkgYearRev += pkgRevByPkg[pid].reduce((a, n) => a + n, 0);
    }
    let inv6Pass = sumPkgYearRev === pkgTotalYearRev;
    if (!inv6Pass) {
      console.log(`  ❌ [${branchId}] Section 1C: ∑pkg×month=${sumPkgYearRev} ≠ totalYearRev=${pkgTotalYearRev}`);
      totalFailures++;
    }

    // Summary per branch
    const closeRate = branchTotalLeads > 0 ? (branchTotalClosed / branchTotalLeads * 100).toFixed(1) : '—';
    console.log(
      `  ${inv1Pass && inv2Pass && inv4Pass && inv6Pass ? '✅' : '❌'} ${branchId.padEnd(4)} ` +
      `Lead=${branchTotalLeads.toString().padStart(5)} Close=${branchTotalClosed.toString().padStart(5)} (${closeRate}%)  ` +
      `Rev=${branchRevenue.toLocaleString('vi-VN').padStart(15)}  ` +
      `PkgRev=${pkgTotalYearRev.toLocaleString('vi-VN').padStart(15)}`,
    );
  }

  console.log('\n──────────────────────────────────────────────');
  if (totalFailures === 0) {
    console.log('✅ ALL INVARIANTS PASS — số liệu hệ thống consistent, không sai sót.');
  } else {
    console.log(`❌ ${totalFailures} invariant violations — cần fix trước khi tiếp tục.`);
  }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
