// Read-only: list ALL docs có saleId=Quân TK trong cả 3 collection (salesEntries, packageSales, packageQuantities)
// Để xác định data nào còn sót sau khi user "xoá".

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

const QUAN_UID = 'JEJfVKddpyW6WYKwMgwVHl2q3pE3';
const BRANCH = 'TK';

(async () => {
  // 1. salesEntries (Lead)
  console.log('\n📋 salesEntries (Lead) — TK · Quân:');
  const leadSnap = await db.collection('salesEntries')
    .where('branchId', '==', BRANCH).where('saleId', '==', QUAN_UID).get();
  console.log(`  Total: ${leadSnap.size} doc`);
  for (const d of leadSnap.docs) {
    const x = d.data();
    console.log(`  - id=${d.id.slice(0,60)}\n    period=${x.period} type=${x.periodType} source=${x.source} leads=${x.leads} closed=${x.closed} notClosed=${x.notClosed}`);
  }

  // 2. packageSales (Doanh số)
  console.log('\n📋 packageSales (Doanh số) — TK · Quân:');
  const psSnap = await db.collection('packageSales')
    .where('branchId', '==', BRANCH).where('saleId', '==', QUAN_UID).get();
  console.log(`  Total: ${psSnap.size} doc`);
  for (const d of psSnap.docs) {
    const x = d.data();
    console.log(`  - id=${d.id.slice(0,60)}\n    period=${x.period} type=${x.periodType} packageId=${x.packageId} qty=${x.quantity} rev=${x.revenue}`);
  }

  // 3. Tổng all docs in TK packageSales (kể cả các sale khác) — để xem dashboard tổng hợp
  console.log('\n📊 packageSales — TỔNG TK 2026 (mọi sale):');
  const allPS = await db.collection('packageSales')
    .where('branchId', '==', BRANCH).where('year', '==', 2026).get();
  const bySale: Record<string, { leads?: number; rev: number; docs: number }> = {};
  for (const d of allPS.docs) {
    const x = d.data();
    const sid = x.saleId ?? '__aggregate';
    bySale[sid] ??= { rev: 0, docs: 0 };
    bySale[sid].rev += Number(x.revenue ?? 0);
    bySale[sid].docs++;
  }
  for (const [sid, v] of Object.entries(bySale)) {
    console.log(`  - saleId=${sid.slice(0, 28)}... docs=${v.docs} rev=${v.rev.toLocaleString('vi-VN')}`);
  }

  // 4. Sum from salesEntries for TK (lead totals)
  console.log('\n📊 salesEntries — TỔNG TK 2026 per sale:');
  const allSE = await db.collection('salesEntries')
    .where('branchId', '==', BRANCH).where('year', '==', 2026).get();
  const leadBySale: Record<string, { leads: number; docs: number }> = {};
  for (const d of allSE.docs) {
    const x = d.data();
    const sid = x.saleId ?? '__aggregate';
    leadBySale[sid] ??= { leads: 0, docs: 0 };
    leadBySale[sid].leads += Number(x.leads ?? 0);
    leadBySale[sid].docs++;
  }
  for (const [sid, v] of Object.entries(leadBySale)) {
    console.log(`  - saleId=${sid.slice(0, 28)}... docs=${v.docs} totalLeads=${v.leads}`);
  }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
