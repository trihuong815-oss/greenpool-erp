// Audit data coverage 5 cơ sở GreenPool (HM/TK/CTT/24/TT) năm 2026 T1-T12.
// Mỗi cơ sở: số docs từng collection + tổng tiền/quantity + cross-check lệch.
//
// Run: GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/audit-all-branches-2026.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const auth = getAuth();

const BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;
const BRANCH_NAME: Record<string, string> = {
  HM: 'Hoàng Mai', TK: '20 Thuỵ Khuê', CTT: 'CTT Mỹ Đình', '24': '24 Nguyễn Cơ Thạch', TT: 'Thanh Trì',
};
const fmt = (n: number) => n.toLocaleString('vi-VN');

interface BranchData {
  branch: string;
  users: { member: number; pt: number; inactive: number };
  salesEntries: { docs: number; leads: number; closed: number; byMonth: Record<number, { leads: number; closed: number }> };
  packageQuantities: { docs: number; rev: number; byMonth: Record<number, number> };
  packageSales: {
    perSaleMember: { docs: number; rev: number; byMonth: Record<number, number> };
    perSalePT: { docs: number; rev: number; byMonth: Record<number, number> };
    perPackage: { docs: number; rev: number };
  };
  salesTargets: { docs: number; hasYear: boolean };
}

async function auditBranch(branch: string): Promise<BranchData> {
  const out: BranchData = {
    branch,
    users: { member: 0, pt: 0, inactive: 0 },
    salesEntries: { docs: 0, leads: 0, closed: 0, byMonth: {} },
    packageQuantities: { docs: 0, rev: 0, byMonth: {} },
    packageSales: { perSaleMember: { docs: 0, rev: 0, byMonth: {} }, perSalePT: { docs: 0, rev: 0, byMonth: {} }, perPackage: { docs: 0, rev: 0 } },
    salesTargets: { docs: 0, hasYear: false },
  };

  // Users (sale roles)
  const us = await db.collection('users').where('branchId', '==', branch).get();
  for (const d of us.docs) {
    const x = d.data();
    if (x.roleId === 'NV_SALE') {
      if ((x.status ?? 'active') === 'active') out.users.member++;
      else out.users.inactive++;
    } else if (x.roleId === 'NV_SALE_PT') {
      if ((x.status ?? 'active') === 'active') out.users.pt++;
      else out.users.inactive++;
    }
  }

  // salesEntries
  const se = await db.collection('salesEntries').where('branchId', '==', branch).where('year', '==', 2026).get();
  out.salesEntries.docs = se.size;
  for (const d of se.docs) {
    const x = d.data();
    const m = Number(x.month);
    out.salesEntries.leads += Number(x.leads ?? 0);
    out.salesEntries.closed += Number(x.closed ?? 0);
    out.salesEntries.byMonth[m] ??= { leads: 0, closed: 0 };
    out.salesEntries.byMonth[m].leads += Number(x.leads ?? 0);
    out.salesEntries.byMonth[m].closed += Number(x.closed ?? 0);
  }

  // packageQuantities (per-package)
  const pq = await db.collection('packageQuantities').where('branchId', '==', branch).where('year', '==', 2026).get();
  out.packageQuantities.docs = pq.size;
  for (const d of pq.docs) {
    const x = d.data();
    const m = Number(x.month);
    out.packageQuantities.rev += Number(x.revenue ?? 0);
    out.packageQuantities.byMonth[m] = (out.packageQuantities.byMonth[m] ?? 0) + Number(x.revenue ?? 0);
  }

  // packageSales (per-sale __total + per-package thật)
  const ps = await db.collection('packageSales').where('branchId', '==', branch).where('year', '==', 2026).get();
  for (const d of ps.docs) {
    const x = d.data();
    const m = Number(x.month);
    const rev = Number(x.revenue ?? 0);
    if (x.packageId === '__total') {
      const isPT = x.saleRoleId === 'NV_SALE_PT';
      const target = isPT ? out.packageSales.perSalePT : out.packageSales.perSaleMember;
      target.docs++;
      target.rev += rev;
      target.byMonth[m] = (target.byMonth[m] ?? 0) + rev;
    } else {
      out.packageSales.perPackage.docs++;
      out.packageSales.perPackage.rev += rev;
    }
  }

  // salesTargets
  const st = await db.collection('salesTargets').where('branchId', '==', branch).where('year', '==', 2026).get();
  out.salesTargets.docs = st.size;
  out.salesTargets.hasYear = st.size > 0;

  return out;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('AUDIT 5 CƠ SỞ GREENPOOL — Năm 2026');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const all: BranchData[] = [];
  for (const b of BRANCHES) {
    console.log(`\n━━━ ${b} · ${BRANCH_NAME[b]} ━━━`);
    const d = await auditBranch(b);
    all.push(d);

    // Users
    console.log(`  👥 Users: ${d.users.member} NV_SALE active · ${d.users.pt} NV_SALE_PT active · ${d.users.inactive} inactive`);
    // salesEntries
    console.log(`  📋 salesEntries: ${d.salesEntries.docs} docs · ${d.salesEntries.leads} leads · ${d.salesEntries.closed} closed (rate=${d.salesEntries.leads > 0 ? Math.round(d.salesEntries.closed / d.salesEntries.leads * 100) : 0}%)`);
    if (d.salesEntries.docs > 0) {
      const months = Object.keys(d.salesEntries.byMonth).map(Number).sort();
      console.log(`     Tháng có data: [${months.join(',')}]`);
    }
    // packageQuantities
    console.log(`  📦 packageQuantities: ${d.packageQuantities.docs} docs · rev=${fmt(d.packageQuantities.rev)}đ`);
    if (d.packageQuantities.docs > 0) {
      const months = Object.keys(d.packageQuantities.byMonth).map(Number).sort();
      console.log(`     Tháng có data: [${months.join(',')}] (${months.map(m => 'T'+m+'='+fmt(d.packageQuantities.byMonth[m])).join(' · ')})`);
    }
    // packageSales
    const mem = d.packageSales.perSaleMember;
    const pt = d.packageSales.perSalePT;
    console.log(`  💰 packageSales __total per-sale Member: ${mem.docs} docs · ${fmt(mem.rev)}đ`);
    if (pt.docs > 0) console.log(`     packageSales __total per-sale PT: ${pt.docs} docs · ${fmt(pt.rev)}đ`);
    if (d.packageSales.perPackage.docs > 0) console.log(`     packageSales per-package thật: ${d.packageSales.perPackage.docs} docs · ${fmt(d.packageSales.perPackage.rev)}đ`);
    // salesTargets
    console.log(`  🎯 salesTargets: ${d.salesTargets.hasYear ? '✓ có mục tiêu' : '✗ CHƯA SET MỤC TIÊU'} (${d.salesTargets.docs} docs)`);

    // Cross-check lệch per-package vs per-sale
    const saleTotal = mem.rev + pt.rev;
    if (d.packageQuantities.rev > 0 && saleTotal > 0) {
      const diff = d.packageQuantities.rev - saleTotal;
      const pct = saleTotal > 0 ? (diff / saleTotal * 100).toFixed(2) : '0';
      const status = Math.abs(diff) < 1_000_000 ? '✓ khớp' : `⚠ lệch ${pct}%`;
      console.log(`  ⚖ Lệch per-pkg (${fmt(d.packageQuantities.rev)}) vs per-sale (${fmt(saleTotal)}): ${diff >= 0 ? '+' : ''}${fmt(diff)}đ [${status}]`);
    }
  }

  console.log('\n\n═══════════════════════════════════════════════════════════════════');
  console.log('TÓM TẮT TỔNG QUAN');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  console.log('Cơ sở | Sale Mem | Sale PT | salesEntries | packageQty | per-sale __total | salesTargets');
  console.log('──────┼──────────┼─────────┼──────────────┼────────────┼──────────────────┼─────────────');
  for (const d of all) {
    const mem = d.packageSales.perSaleMember.rev;
    const pt = d.packageSales.perSalePT.rev;
    const pq = d.packageQuantities.rev;
    console.log(
      `  ${d.branch.padEnd(3)} | ${String(d.users.member).padStart(3)}/${String(d.users.member + d.users.inactive).padStart(3)} ` +
      `| ${String(d.users.pt).padStart(3)} ` +
      `| ${String(d.salesEntries.docs).padStart(4)} docs ${String(d.salesEntries.leads).padStart(5)}L/${String(d.salesEntries.closed).padStart(5)}C ` +
      `| ${String(d.packageQuantities.docs).padStart(3)} docs ${fmt(pq).padStart(15)}đ ` +
      `| Mem=${fmt(mem).padStart(13)}đ${pt > 0 ? ' · PT=' + fmt(pt) + 'đ' : ''} ` +
      `| ${d.salesTargets.hasYear ? '✓' : '✗ THIẾU'}`
    );
  }

  console.log('\n\n⚠ CẢNH BÁO');
  for (const d of all) {
    if (!d.salesTargets.hasYear) console.log(`  • ${d.branch}: chưa set salesTargets 2026 — KPI conversion rate sẽ thiếu mục tiêu`);
    if (d.salesEntries.docs === 0) console.log(`  • ${d.branch}: salesEntries TRỐNG — không có data lead/closed năm 2026`);
    if (d.packageQuantities.docs === 0) console.log(`  • ${d.branch}: packageQuantities TRỐNG — không có data per-package`);
    if (d.packageSales.perSaleMember.docs === 0) console.log(`  • ${d.branch}: per-sale __total Member TRỐNG`);
    if (d.users.member === 0) console.log(`  • ${d.branch}: KHÔNG có sale Member active`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
