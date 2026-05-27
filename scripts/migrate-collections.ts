// Phase 1.5 — Copy data từ collection cũ sang chuẩn mới.
// IDempotent: nếu doc đích đã tồn tại thì skip.
// IDs được preserve để các ref nội bộ (template_id, instance_id) vẫn match.
//
// Copy:
//   facilities         → branches
//   checklistTemplates → templates       (+ subcollection items)
//   checklistInstances → checklists      (+ subcollections items, evidenceFiles)
//   checklistAuditLogs → auditLogs       (format conversion + branchId lookup)
//
// Chạy:  npx --yes tsx scripts/migrate-collections.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

const MIGRATION_VERSION = '1.5.0';
const MIGRATED_AT = new Date();
const MIGRATED_BY = 'system';

async function copyDoc(
  fromPath: string, toPath: string,
  sourceCollection: string,
  transform?: (data: any) => any,
): Promise<'copied' | 'exists' | 'missing'> {
  const fromRef = db.doc(fromPath);
  const fromSnap = await fromRef.get();
  if (!fromSnap.exists) return 'missing';
  const toRef = db.doc(toPath);
  const toSnap = await toRef.get();
  if (toSnap.exists) return 'exists';
  const base = transform ? transform(fromSnap.data()) : fromSnap.data();
  await toRef.set({
    ...base,
    migrationVersion: MIGRATION_VERSION,
    migratedAt: MIGRATED_AT,
    migratedBy: MIGRATED_BY,
    sourceCollection,
  });
  return 'copied';
}

async function copyCollection(
  fromCol: string, toCol: string,
  subCollections: string[] = [],
  transform?: (data: any) => any,
): Promise<{ copied: number; exists: number; subs: Record<string, number> }> {
  const snap = await db.collection(fromCol).get();
  const stats = { copied: 0, exists: 0, subs: {} as Record<string, number> };
  for (const sub of subCollections) stats.subs[sub] = 0;

  for (const d of snap.docs) {
    const status = await copyDoc(`${fromCol}/${d.id}`, `${toCol}/${d.id}`, fromCol, transform);
    if (status === 'copied') stats.copied++;
    else if (status === 'exists') stats.exists++;

    // Copy subcollections (regardless of doc copy status — to fill gaps)
    for (const sub of subCollections) {
      const subSnap = await db.collection(`${fromCol}/${d.id}/${sub}`).get();
      for (const s of subSnap.docs) {
        const subStatus = await copyDoc(`${fromCol}/${d.id}/${sub}/${s.id}`, `${toCol}/${d.id}/${sub}/${s.id}`, `${fromCol}/${sub}`);
        if (subStatus === 'copied') stats.subs[sub]++;
      }
    }
  }
  return stats;
}

async function migrateAuditLogs(): Promise<{ copied: number; exists: number }> {
  // Convert format cũ → mới + lookup branchId từ checklists.
  const snap = await db.collection('checklistAuditLogs').get();
  let copied = 0, exists = 0;
  for (const d of snap.docs) {
    // Sử dụng cùng ID để tránh duplicate khi rerun
    const newRef = db.collection('auditLogs').doc(`legacy_${d.id}`);
    const newSnap = await newRef.get();
    if (newSnap.exists) { exists++; continue; }

    const x = d.data();
    // Lookup branchId từ checklist instance
    let branchId: string | null = null;
    if (x.instance_id) {
      // Đọc từ checklists (đã copy ở bước trên), fallback checklistInstances
      const inst = await db.collection('checklists').doc(x.instance_id).get();
      if (inst.exists) {
        branchId = inst.data()?.facility_id ?? null;
      } else {
        const oldInst = await db.collection('checklistInstances').doc(x.instance_id).get();
        if (oldInst.exists) branchId = oldInst.data()?.facility_id ?? null;
      }
    }

    await newRef.set({
      action: x.action,
      module: 'checklist',
      userId: x.actor_id,
      branchId,
      before: null,
      after: x.details ?? null,
      createdAt: x.created_at,
      source: 'migration',
      migrationVersion: MIGRATION_VERSION,
      migratedAt: MIGRATED_AT,
      migratedBy: MIGRATED_BY,
      sourceCollection: 'checklistAuditLogs',
      // Back-compat denormalized:
      instanceId: x.instance_id,
      actor_name: x.actor_name ?? '',
      actor_role: x.actor_role ?? '',
      details: x.details ?? null,
      legacy_id: d.id,
    });
    copied++;
  }
  return { copied, exists };
}

async function main() {
  console.log('=== Phase 1.5 — Migrate collections ===\n');

  console.log('1) facilities → branches');
  const r1 = await copyCollection('facilities', 'branches');
  console.log(`   copied=${r1.copied}  exists=${r1.exists}`);

  console.log('2) checklistTemplates → templates (+ items)');
  const r2 = await copyCollection('checklistTemplates', 'templates', ['items']);
  console.log(`   copied=${r2.copied}  exists=${r2.exists}  items.copied=${r2.subs.items}`);

  console.log('3) checklistInstances → checklists (+ items, + evidenceFiles)');
  const r3 = await copyCollection('checklistInstances', 'checklists', ['items', 'evidenceFiles']);
  console.log(`   copied=${r3.copied}  exists=${r3.exists}  items=${r3.subs.items}  evidence=${r3.subs.evidenceFiles}`);

  console.log('4) checklistAuditLogs → auditLogs (legacy_*, format converted)');
  const r4 = await migrateAuditLogs();
  console.log(`   copied=${r4.copied}  exists=${r4.exists}`);

  console.log('\n=== Done ===');
  console.log('Bước tiếp: cập nhật code đọc/ghi vào collection mới.');
  console.log('Old collections sẽ là backup. Sẽ xóa ở Phase 5.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('LỖI:', e); process.exit(1); });
