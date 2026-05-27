// Migration: đồng nhất đơn vị máy lọc/nhiệt = 'kW' (× h = kWh).
// Tất cả `machines.capacityUnit` 'm³/h' / 'm3/h' → 'kW'.
// Tất cả `machineRuns.capacityUnit` (denorm) tương tự.
//
// DRY-RUN:  npx --yes tsx scripts/migrate-loc-unit-to-kw.ts
// APPLY:    npx --yes tsx scripts/migrate-loc-unit-to-kw.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Missing GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) initializeApp({
  credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
});
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

function shouldMigrate(unit: unknown): boolean {
  if (typeof unit !== 'string') return false;
  const lc = unit.toLowerCase().trim();
  // Migrate khỏi: m³/h (lưu lượng cũ), kw/h (sai notation — kW đã là công suất), kw, KW, KW/h, kw·h …
  if (lc === 'm³/h' || lc === 'm3/h' || lc === 'm³' || lc === 'm3') return true;
  // Chuẩn hoá mọi biến thể về 'kW' khi cần
  if (lc === 'kw' || lc === 'kw/h' || lc === 'kw·h' || lc === 'kwh') return unit !== 'kW';
  return false;
}

async function main() {
  console.log(`Migrate capacityUnit → 'kW' — mode: ${APPLY ? '🚀 APPLY' : '🧪 DRY-RUN'}\n`);

  // 1. machines
  const machinesSnap = await db.collection('machines').get();
  let machinesNeedUpdate = 0;
  const machineUpdates: { id: string; before: string; after: string }[] = [];
  for (const d of machinesSnap.docs) {
    const x = d.data();
    if (shouldMigrate(x.capacityUnit)) {
      machinesNeedUpdate++;
      machineUpdates.push({ id: d.id, before: String(x.capacityUnit), after: 'kW' });
    }
  }
  console.log(`machines: ${machinesNeedUpdate}/${machinesSnap.size} cần migrate`);
  machineUpdates.slice(0, 10).forEach((u) => console.log(`  • ${u.id.slice(0, 12)}…  ${u.before} → ${u.after}`));
  if (machineUpdates.length > 10) console.log(`  …và ${machineUpdates.length - 10} máy khác`);

  // 2. machineRuns
  const runsSnap = await db.collection('machineRuns').get();
  let runsNeedUpdate = 0;
  for (const d of runsSnap.docs) {
    const x = d.data();
    if (shouldMigrate(x.capacityUnit)) runsNeedUpdate++;
  }
  console.log(`machineRuns: ${runsNeedUpdate}/${runsSnap.size} cần migrate`);

  if (!APPLY) {
    console.log('\n⚠ DRY-RUN — chạy lại với --apply để ghi Firestore.');
    return;
  }

  // APPLY in batches (Firestore max 500 ops/batch)
  console.log('\n🚀 APPLY — bắt đầu migrate…');
  let batch = db.batch();
  let opsInBatch = 0;
  let totalOps = 0;
  async function flush() {
    if (opsInBatch === 0) return;
    await batch.commit();
    totalOps += opsInBatch;
    batch = db.batch();
    opsInBatch = 0;
  }

  for (const d of machinesSnap.docs) {
    if (shouldMigrate(d.data().capacityUnit)) {
      batch.update(d.ref, { capacityUnit: 'kW' });
      opsInBatch++;
      if (opsInBatch >= 400) await flush();
    }
  }
  await flush();
  console.log(`  ✓ machines: updated ${machinesNeedUpdate} docs`);

  for (const d of runsSnap.docs) {
    if (shouldMigrate(d.data().capacityUnit)) {
      batch.update(d.ref, { capacityUnit: 'kW' });
      opsInBatch++;
      if (opsInBatch >= 400) await flush();
    }
  }
  await flush();
  console.log(`  ✓ machineRuns: updated ${runsNeedUpdate} docs`);
  console.log(`\n✓ Hoàn thành: ${totalOps} ops`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
