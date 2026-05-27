// Back-fill migrationVersion/migratedAt/migratedBy/sourceCollection cho
// các doc đã copy ở Phase 1.5.A (trước khi script thêm metadata).
// Idempotent: skip doc đã có `migrationVersion`.
// Mặc định DRY-RUN. Truyền --apply để ghi thật.
//
// Chạy:
//   npx --yes tsx scripts/retrofit-migration-metadata.ts           (dry-run)
//   npx --yes tsx scripts/retrofit-migration-metadata.ts --apply   (ghi thật)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const APPLY = process.argv.includes('--apply');
const MIGRATION_VERSION = '1.5.0';
const MIGRATED_AT = new Date();
const MIGRATED_BY = 'system';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

interface Mapping {
  newCol: string;
  oldCol: string;
  subs?: { name: string; oldSourceName: string }[];
}

const MAPPINGS: Mapping[] = [
  { newCol: 'branches',  oldCol: 'facilities' },
  { newCol: 'templates', oldCol: 'checklistTemplates', subs: [{ name: 'items', oldSourceName: 'checklistTemplates/items' }] },
  { newCol: 'checklists',oldCol: 'checklistInstances', subs: [
    { name: 'items',          oldSourceName: 'checklistInstances/items' },
    { name: 'evidenceFiles',  oldSourceName: 'checklistInstances/evidenceFiles' },
  ] },
];

async function backfillDoc(ref: DocumentReference, oldCol: string): Promise<'skip' | 'patch'> {
  const snap = await ref.get();
  if (!snap.exists) return 'skip';
  const d = snap.data()!;
  if (d.migrationVersion) return 'skip'; // đã có metadata
  if (APPLY) {
    await ref.update({
      migrationVersion: MIGRATION_VERSION,
      migratedAt: MIGRATED_AT,
      migratedBy: MIGRATED_BY,
      sourceCollection: oldCol,
    });
  }
  return 'patch';
}

async function backfillCollection(m: Mapping): Promise<{ patched: number; skipped: number; subs: Record<string, { patched: number; skipped: number }> }> {
  const stats = { patched: 0, skipped: 0, subs: {} as Record<string, { patched: number; skipped: number }> };
  for (const s of m.subs ?? []) stats.subs[s.name] = { patched: 0, skipped: 0 };

  const snap = await db.collection(m.newCol).get();
  for (const d of snap.docs) {
    const r = await backfillDoc(d.ref, m.oldCol);
    if (r === 'patch') stats.patched++; else stats.skipped++;

    for (const s of m.subs ?? []) {
      const subSnap = await d.ref.collection(s.name).get();
      for (const subDoc of subSnap.docs) {
        const sr = await backfillDoc(subDoc.ref, s.oldSourceName);
        if (sr === 'patch') stats.subs[s.name].patched++;
        else stats.subs[s.name].skipped++;
      }
    }
  }
  return stats;
}

// auditLogs migrated docs có ID prefix `legacy_` — backfill riêng
async function backfillAuditLogs(): Promise<{ patched: number; skipped: number }> {
  const stats = { patched: 0, skipped: 0 };
  // Query toàn bộ collection (count nhỏ); filter ID prefix client-side
  const snap = await db.collection('auditLogs').get();
  for (const d of snap.docs) {
    if (!d.id.startsWith('legacy_')) continue;
    const r = await backfillDoc(d.ref, 'checklistAuditLogs');
    if (r === 'patch') stats.patched++; else stats.skipped++;
  }
  return stats;
}

async function main() {
  console.log(`=== Retrofit migration metadata ===`);
  console.log(`Mode: ${APPLY ? 'APPLY (sẽ ghi thật)' : 'DRY-RUN (chỉ đếm, --apply để ghi)'}\n`);

  for (const m of MAPPINGS) {
    const r = await backfillCollection(m);
    const subStr = Object.entries(r.subs)
      .map(([k, v]) => ` | ${k} patched=${v.patched} skipped=${v.skipped}`).join('');
    console.log(`${m.newCol.padEnd(12)} patched=${r.patched} skipped=${r.skipped}${subStr}`);
  }

  const a = await backfillAuditLogs();
  console.log(`auditLogs    patched=${a.patched} skipped=${a.skipped} (chỉ docs id prefix 'legacy_')`);

  if (!APPLY) {
    console.log(`\n→ Dry-run xong. Re-run với --apply để ghi thật.`);
  } else {
    console.log(`\n→ Done.`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('LỖI:', e); process.exit(1); });
