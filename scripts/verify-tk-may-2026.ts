// Verify liên thông sau khi import TK T5/2026.
// Đọc cùng query mà UI dùng → đảm bảo dashboard sẽ render đúng số.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

const BRANCH = 'TK';
const YEAR = 2026;
const MONTH = 5;
const EXPECTED_TOTAL = 2_141_696_000;

async function main() {
  initAdmin();
  const db = getFirestore();
  let allOk = true;

  // 1. Sales collection — TK T5/2026 (filter trong memory)
  console.log('=== 1. sales collection (TK 2026-05) ===');
  const allTkSales = await db.collection('sales').where('branchId', '==', BRANCH).get();
  const may = allTkSales.docs.filter((d) => {
    const x = d.data() as any;
    const ts: Date | null = x.createdAt?.toDate?.() ?? (typeof x.createdAt === 'string' ? new Date(x.createdAt) : null);
    if (!ts) return false;
    return ts.getUTCFullYear() === YEAR && ts.getUTCMonth() + 1 === MONTH;
  });
  let sumSales = 0;
  const bySale: Record<string, number> = {};
  may.forEach((d) => {
    const x = d.data() as any;
    if (x.status === 'confirmed') {
      sumSales += x.amount || 0;
      bySale[x.saleByName || x.saleBy] = (bySale[x.saleByName || x.saleBy] || 0) + x.amount;
    }
  });
  console.log(`  Docs: ${may.length}`);
  console.log(`  Sum amount (confirmed): ${sumSales.toLocaleString('vi-VN')} đ`);
  console.log(`  Phân theo Sale:`);
  Object.entries(bySale).forEach(([name, amt]) => {
    console.log(`    - ${name}: ${amt.toLocaleString('vi-VN')} đ`);
  });

  // 2. packageQuantities collection
  console.log('\n=== 2. packageQuantities collection (TK 2026-05) ===');
  const pkgs = await db.collection('packageQuantities')
    .where('year', '==', YEAR).where('month', '==', MONTH).where('branchId', '==', BRANCH)
    .get();
  let sumPkgRev = 0;
  let sumPkgQty = 0;
  console.log(`  Docs: ${pkgs.size}`);
  pkgs.docs.forEach((d) => {
    const x = d.data() as any;
    sumPkgRev += x.revenue || 0;
    sumPkgQty += x.quantity || 0;
    console.log(`    - ${(x.packageName || '?').padEnd(32)} qty=${String(x.quantity).padStart(3)} rev=${(x.revenue || 0).toLocaleString('vi-VN').padStart(15)} đ`);
  });
  console.log(`  Tổng quantity: ${sumPkgQty}`);
  console.log(`  Tổng revenue : ${sumPkgRev.toLocaleString('vi-VN')} đ`);

  // 3. Invariant check
  console.log('\n=== 3. INVARIANT CHECK ===');
  const checks = [
    { name: 'Sum sales (confirmed)            === Expected', actual: sumSales, expected: EXPECTED_TOTAL },
    { name: 'Sum packageQuantities revenue    === Expected', actual: sumPkgRev, expected: EXPECTED_TOTAL },
    { name: 'Sum sales                        === Sum packageQuantities', actual: sumSales, expected: sumPkgRev },
  ];
  checks.forEach((c) => {
    const ok = c.actual === c.expected;
    if (!ok) allOk = false;
    console.log(`  ${ok ? '✓' : '❌'} ${c.name}`);
    console.log(`     actual=${c.actual.toLocaleString('vi-VN')} expected=${c.expected.toLocaleString('vi-VN')}`);
  });

  // 4. Simulate UI query — /api/sales/reports/branch?year=2026&month=5
  console.log('\n=== 4. Simulate API /sales/reports/branch year=2026 month=5 ===');
  let totalAmount = 0, totalLeads = 0, totalClosed = 0;
  const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: 0, closed: 0 }));
  may.forEach((d) => {
    const x = d.data() as any;
    const ts: Date = x.createdAt?.toDate?.() ?? new Date(x.createdAt);
    if (ts.getUTCFullYear() !== YEAR) return;
    totalLeads += 1;
    if (x.status === 'confirmed') {
      totalClosed += 1;
      totalAmount += x.amount || 0;
      const m = ts.getUTCMonth();
      byMonth[m].closed += 1;
      byMonth[m].amount += x.amount || 0;
    }
  });
  console.log(`  totalAmount: ${totalAmount.toLocaleString('vi-VN')} đ`);
  console.log(`  totalLeads : ${totalLeads}`);
  console.log(`  totalClosed: ${totalClosed}`);
  console.log(`  byMonth[5] : amount=${byMonth[4].amount.toLocaleString('vi-VN')} closed=${byMonth[4].closed}`);

  console.log(`\n${'='.repeat(60)}`);
  if (allOk) console.log(`✓ ALL INVARIANTS PASS — UI dashboard sẽ hiện đúng ${EXPECTED_TOTAL.toLocaleString('vi-VN')} đ cho TK T5/2026`);
  else console.log(`❌ CÓ INVARIANT FAIL — kiểm tra log phía trên`);
}

main().catch((e) => { console.error(e); process.exit(1); });
