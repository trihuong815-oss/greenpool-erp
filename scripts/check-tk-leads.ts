// Read-only: verify lead data của TK T1-T4/2026
// So sánh: raw DB → mergeRegistry filter → output cuối.

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

const BRANCH = 'TK';
const YEAR = 2026;
const MONTHS = [1, 2, 3, 4];

(async () => {
  console.log(`\n🔍 LEAD DATA — Branch=${BRANCH} Year=${YEAR} T1-T4\n`);

  // 1. Raw salesEntries
  const snap = await db.collection('salesEntries')
    .where('branchId', '==', BRANCH)
    .where('year', '==', YEAR)
    .get();
  console.log(`Total docs in salesEntries (TK, ${YEAR}): ${snap.size}\n`);

  // Filter to T1-T4
  const docs = snap.docs.filter((d) => MONTHS.includes(d.data().month));
  console.log(`Docs in T1-T4: ${docs.length}\n`);

  // Distinct sales referenced
  const saleIds = new Set<string>();
  docs.forEach((d) => saleIds.add(d.data().saleId ?? '__aggregate'));
  console.log(`Distinct saleIds: ${saleIds.size}`);
  console.log([...saleIds].join(', '));

  // 2. Check which saleIds are in active NV_SALE registry
  const usersSnap = await db.collection('users')
    .where('status', '==', 'active')
    .where('roleId', '==', 'NV_SALE')
    .where('branchId', '==', BRANCH)
    .get();
  const activeIds = new Set<string>(['__aggregate']);
  usersSnap.docs.forEach((d) => activeIds.add(d.id));
  console.log(`\nActive NV_SALE of ${BRANCH}: ${usersSnap.size}`);
  for (const d of usersSnap.docs) {
    console.log(`  ✓ ${d.id.slice(0, 8)} · ${d.data().displayName}`);
  }

  // 3. Check which saleIds are NOT in active registry → these get DROPPED
  const droppedSaleIds = [...saleIds].filter((id) => !activeIds.has(id));
  if (droppedSaleIds.length > 0) {
    console.log(`\n⚠ saleIds NOT in active registry (data sẽ KHÔNG hiện ở dashboard):`);
    for (const id of droppedSaleIds) {
      // Look up user
      const u = await db.collection('users').doc(id).get();
      const x = u.exists ? u.data()! : null;
      const docsOfThisSale = docs.filter((d) => (d.data().saleId ?? '__aggregate') === id);
      const totalLeads = docsOfThisSale.reduce((s, d) => s + Number(d.data().leads ?? 0), 0);
      console.log(`  ✗ ${id.slice(0, 8)} · ${x?.displayName ?? '(không tồn tại)'} · role=${x?.roleId ?? '?'} · status=${x?.status ?? '?'} · ${docsOfThisSale.length} docs · ${totalLeads} leads`);
    }
  } else {
    console.log(`\n✓ Tất cả saleIds đều thuộc registry active.`);
  }

  // 4. Per-month summary RAW (chưa filter)
  console.log(`\n📊 PER-MONTH RAW (chưa filter registry):`);
  console.log('Month'.padEnd(8), 'Docs'.padEnd(6), 'Sum leads'.padEnd(12), 'Sum closed', 'Sum notClosed');
  for (const m of MONTHS) {
    const monthDocs = docs.filter((d) => d.data().month === m);
    const sumL = monthDocs.reduce((s, d) => s + Number(d.data().leads ?? 0), 0);
    const sumC = monthDocs.reduce((s, d) => s + Number(d.data().closed ?? 0), 0);
    const sumN = monthDocs.reduce((s, d) => s + Number(d.data().notClosed ?? 0), 0);
    console.log(`T${m}`.padEnd(8), String(monthDocs.length).padEnd(6), String(sumL).padEnd(12), String(sumC).padEnd(12), sumN);
  }

  // 5. Per-month summary AFTER filter (giả lập mergeRegistry)
  console.log(`\n📊 PER-MONTH AFTER FILTER (hiển thị thực tế trên dashboard):`);
  console.log('Month'.padEnd(8), 'Docs'.padEnd(6), 'Sum leads'.padEnd(12), 'Sum closed', 'Sum notClosed');
  for (const m of MONTHS) {
    const monthDocs = docs.filter((d) => d.data().month === m && activeIds.has(d.data().saleId ?? '__aggregate'));
    const sumL = monthDocs.reduce((s, d) => s + Number(d.data().leads ?? 0), 0);
    const sumC = monthDocs.reduce((s, d) => s + Number(d.data().closed ?? 0), 0);
    const sumN = monthDocs.reduce((s, d) => s + Number(d.data().notClosed ?? 0), 0);
    console.log(`T${m}`.padEnd(8), String(monthDocs.length).padEnd(6), String(sumL).padEnd(12), String(sumC).padEnd(12), sumN);
  }

  // 6. Check periodType dedup
  const periodTypes = new Set<string>();
  docs.forEach((d) => periodTypes.add(d.data().periodType));
  console.log(`\n🔄 PeriodType distinct: ${[...periodTypes].join(', ')}`);

  // Check (branch, month) có cả day + month không (→ month docs bị skip)
  console.log(`\n📅 Per-month periodType breakdown:`);
  for (const m of MONTHS) {
    const monthDocs = docs.filter((d) => d.data().month === m);
    const types = new Set(monthDocs.map((d) => d.data().periodType));
    const hasDay = types.has('day');
    const hasMonth = types.has('month');
    console.log(`  T${m}: ${[...types].join('+')} ${hasDay && hasMonth ? '⚠ DEDUP — month docs sẽ bị skip' : ''}`);
  }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
