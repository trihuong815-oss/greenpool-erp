// Verify lệch per-package vs per-sale của 24 NCT T1-T4/2026.
// In ra:
//   - Per-package (packageQuantities): tổng theo tháng
//   - Per-sale Member (16 docs ngày a38eb31 - không có saleRoleId)
//   - Per-sale PT (17 docs ngày 2c39b42 - có saleRoleId='NV_SALE_PT')
//   - Lệch từng tháng

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const fmt = (n: number) => n.toLocaleString('vi-VN');

async function main() {
  console.log('━━━ packageQuantities (24, 2026) ━━━');
  const pqSnap = await db.collection('packageQuantities').where('branchId', '==', '24').where('year', '==', 2026).get();
  const pqByMonth: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const d of pqSnap.docs) {
    const x = d.data();
    const m = Number(x.month);
    if (m >= 1 && m <= 4) pqByMonth[m] += Number(x.revenue ?? 0);
  }
  for (const m of [1, 2, 3, 4]) console.log(`  T${m}: ${fmt(pqByMonth[m]).padStart(16)}đ`);
  const pqTotal = Object.values(pqByMonth).reduce((s, n) => s + n, 0);
  console.log(`  TỔNG: ${fmt(pqTotal)}đ (docs=${pqSnap.size})\n`);

  console.log('━━━ packageSales __total per-sale (24, 2026, T1-T4) ━━━');
  const psSnap = await db.collection('packageSales')
    .where('branchId', '==', '24').where('year', '==', 2026).where('packageId', '==', '__total').get();
  const psMember: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const psPT: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const d of psSnap.docs) {
    const x = d.data();
    const m = Number(x.month);
    if (m < 1 || m > 4) continue;
    const isPT = x.saleRoleId === 'NV_SALE_PT';
    if (isPT) psPT[m] += Number(x.revenue ?? 0);
    else psMember[m] += Number(x.revenue ?? 0);
  }
  console.log('  Tháng |   Member       |    PT          |   Member+PT');
  console.log('  ──────┼────────────────┼────────────────┼───────────────');
  for (const m of [1, 2, 3, 4]) {
    const sum = psMember[m] + psPT[m];
    console.log(`  T${m}    | ${fmt(psMember[m]).padStart(14)} | ${fmt(psPT[m]).padStart(14)} | ${fmt(sum).padStart(14)}`);
  }
  const psMemTotal = Object.values(psMember).reduce((s, n) => s + n, 0);
  const psPtTotal  = Object.values(psPT).reduce((s, n) => s + n, 0);
  console.log(`  TỔNG  | ${fmt(psMemTotal).padStart(14)} | ${fmt(psPtTotal).padStart(14)} | ${fmt(psMemTotal + psPtTotal).padStart(14)}\n`);

  console.log('━━━ LỆCH per-package vs per-sale ━━━');
  console.log('  Tháng | Package        | Sale (Mem+PT)  | Lệch (pkg−sale)');
  console.log('  ──────┼────────────────┼────────────────┼─────────────────');
  for (const m of [1, 2, 3, 4]) {
    const saleSum = psMember[m] + psPT[m];
    const diff = pqByMonth[m] - saleSum;
    const tag = diff === 0 ? '✓ khớp' : diff > 0 ? `+${fmt(diff)}` : fmt(diff);
    console.log(`  T${m}    | ${fmt(pqByMonth[m]).padStart(14)} | ${fmt(saleSum).padStart(14)} | ${tag}`);
  }
  const diffTotal = pqTotal - (psMemTotal + psPtTotal);
  console.log(`  TỔNG  | ${fmt(pqTotal).padStart(14)} | ${fmt(psMemTotal + psPtTotal).padStart(14)} | ${diffTotal === 0 ? '✓ khớp' : (diffTotal > 0 ? '+' + fmt(diffTotal) : fmt(diffTotal))}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
