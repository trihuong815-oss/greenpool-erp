// Audit toàn bộ dữ liệu 24 NCT 2026 (mọi collection liên quan, mọi tháng).
// Trả lời: tháng nào có/thiếu data, Member vs PT phân biệt, cells nào missing.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const fmt = (n: number) => n.toLocaleString('vi-VN');

async function main() {
  // ─── packageQuantities (per-package) ───
  console.log('━━━ 1. packageQuantities (per-gói × tháng) ━━━');
  const pq = await db.collection('packageQuantities').where('branchId', '==', '24').where('year', '==', 2026).get();
  const pqByMonth: Record<number, { count: number; rev: number; updatedBy: Set<string> }> = {};
  for (const d of pq.docs) {
    const x = d.data();
    const m = Number(x.month);
    if (!pqByMonth[m]) pqByMonth[m] = { count: 0, rev: 0, updatedBy: new Set() };
    pqByMonth[m].count++;
    pqByMonth[m].rev += Number(x.revenue ?? 0);
    if (x.updatedBy) pqByMonth[m].updatedBy.add(String(x.updatedBy));
  }
  for (const m of Object.keys(pqByMonth).map(Number).sort()) {
    const v = pqByMonth[m];
    console.log(`  T${m}: ${v.count} docs · ${fmt(v.rev).padStart(16)}đ · updatedBy={${[...v.updatedBy].join(', ')}}`);
  }
  if (Object.keys(pqByMonth).length === 0) console.log('  (không có doc nào)');

  // ─── packageSales __total (per-sale) ───
  console.log('\n━━━ 2. packageSales __total (per-sale × tháng) ━━━');
  const ps = await db.collection('packageSales')
    .where('branchId', '==', '24').where('year', '==', 2026).where('packageId', '==', '__total').get();
  const psByMonth: Record<number, { mem: number; pt: number; memCount: number; ptCount: number }> = {};
  for (const d of ps.docs) {
    const x = d.data();
    const m = Number(x.month);
    if (!psByMonth[m]) psByMonth[m] = { mem: 0, pt: 0, memCount: 0, ptCount: 0 };
    const isPT = x.saleRoleId === 'NV_SALE_PT';
    if (isPT) { psByMonth[m].pt += Number(x.revenue ?? 0); psByMonth[m].ptCount++; }
    else      { psByMonth[m].mem += Number(x.revenue ?? 0); psByMonth[m].memCount++; }
  }
  console.log('  Tháng | Mem (docs/rev)         | PT (docs/rev)          | Tổng rev');
  console.log('  ──────┼────────────────────────┼────────────────────────┼──────────────');
  for (const m of Object.keys(psByMonth).map(Number).sort()) {
    const v = psByMonth[m];
    console.log(`  T${m}    | ${v.memCount} | ${fmt(v.mem).padStart(15)}đ | ${v.ptCount} | ${fmt(v.pt).padStart(15)}đ | ${fmt(v.mem + v.pt).padStart(15)}`);
  }

  // ─── packageSales per-gói thật (KHÔNG __total — UI form nhập) ───
  console.log('\n━━━ 3. packageSales per-gói thật (KHÔNG __total) — data nhập qua UI ━━━');
  const psPkg = await db.collection('packageSales')
    .where('branchId', '==', '24').where('year', '==', 2026).get();
  const psPkgFilt = psPkg.docs.filter((d) => d.data().packageId !== '__total');
  const psPkgByMonth: Record<number, { count: number; rev: number }> = {};
  for (const d of psPkgFilt) {
    const x = d.data();
    const m = Number(x.month);
    if (!psPkgByMonth[m]) psPkgByMonth[m] = { count: 0, rev: 0 };
    psPkgByMonth[m].count++;
    psPkgByMonth[m].rev += Number(x.revenue ?? 0);
  }
  if (psPkgFilt.length === 0) {
    console.log('  (không có doc nào — Sale chưa nhập per-gói qua UI)');
  } else {
    for (const m of Object.keys(psPkgByMonth).map(Number).sort()) {
      const v = psPkgByMonth[m];
      console.log(`  T${m}: ${v.count} docs · ${fmt(v.rev)}đ`);
    }
  }

  // ─── salesEntries (lead) ───
  console.log('\n━━━ 4. salesEntries (lead per-sale × source × tháng) ━━━');
  const se = await db.collection('salesEntries').where('branchId', '==', '24').where('year', '==', 2026).get();
  const seByMonth: Record<number, number> = {};
  for (const d of se.docs) {
    const x = d.data();
    const m = Number(x.month);
    seByMonth[m] = (seByMonth[m] ?? 0) + 1;
  }
  for (const m of Object.keys(seByMonth).map(Number).sort()) {
    console.log(`  T${m}: ${seByMonth[m]} docs`);
  }
  if (Object.keys(seByMonth).length === 0) console.log('  (không có doc nào)');

  // ─── salesTargets ───
  console.log('\n━━━ 5. salesTargets (mục tiêu năm/tháng) ━━━');
  const st = await db.collection('salesTargets').where('branchId', '==', '24').where('year', '==', 2026).get();
  console.log(`  ${st.size} docs cho branch 24 năm 2026`);

  console.log('\n══ Tóm tắt ══');
  console.log(`  packageQuantities: ${pq.size} docs (tháng có data: ${Object.keys(pqByMonth).sort().join(', ') || '—'})`);
  console.log(`  packageSales __total: ${ps.size} docs (Member + PT)`);
  console.log(`  packageSales per-gói thật: ${psPkgFilt.length} docs`);
  console.log(`  salesEntries: ${se.size} docs`);
  console.log(`  salesTargets: ${st.size} docs`);
}
main().catch((e) => { console.error(e); process.exit(1); });
