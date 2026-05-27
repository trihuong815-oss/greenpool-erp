// Backfill field thiếu cho task cũ (Phase 7 migration):
//   - kind: 'general' (cho task pre-categorization)
//   - attachments: []
// Idempotent: chỉ update doc thực sự thiếu field, không touch doc đầy đủ.
//
// Chạy DRY-RUN trước:
//   npx --yes tsx scripts/backfill-tasks-fields.ts
// Chạy thật:
//   npx --yes tsx scripts/backfill-tasks-fields.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
}
const db = getFirestore();

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 400;  // Firestore batch limit = 500, để buffer

async function main() {
  console.log(`Backfill tasks fields  —  mode: ${APPLY ? '🚀 APPLY' : '🧪 DRY-RUN'}\n`);

  const snap = await db.collection('tasks').get();
  console.log(`Total tasks: ${snap.size}`);

  let scanned = 0;
  let needPatch = 0;
  let patched = 0;
  let batch = db.batch();
  let inBatch = 0;
  const samples: string[] = [];

  for (const doc of snap.docs) {
    scanned++;
    const data = doc.data();
    const patch: Record<string, any> = {};

    // kind: nếu undefined hoặc null → set 'general'
    if (data.kind === undefined || data.kind === null) {
      patch.kind = 'general';
    }
    // attachments: nếu không phải array → reset []
    if (!Array.isArray(data.attachments)) {
      patch.attachments = [];
    }

    if (Object.keys(patch).length === 0) continue;

    needPatch++;
    if (samples.length < 5) samples.push(`${doc.id} → ${Object.keys(patch).join(', ')}`);

    if (APPLY) {
      // Cũng update audit fields để biết backfill động vào
      patch.backfilledAt = new Date();
      batch.update(doc.ref, patch);
      inBatch++;
      patched++;
      if (inBatch >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
  }

  if (APPLY && inBatch > 0) await batch.commit();

  console.log();
  console.log(`Scanned: ${scanned}`);
  console.log(`Need patch: ${needPatch}`);
  console.log(`Patched: ${patched}`);
  console.log();
  if (samples.length > 0) {
    console.log('Sample (first 5):');
    samples.forEach((s) => console.log(`  - ${s}`));
  }
  if (!APPLY && needPatch > 0) {
    console.log();
    console.log('⚠ DRY-RUN. Chạy lại với --apply để patch thật.');
  } else if (APPLY) {
    console.log();
    console.log('✓ Backfill xong. Chạy verify để xác nhận:');
    console.log('   npx --yes tsx scripts/verify-tasks-api.ts');
  } else {
    console.log('✓ Mọi task đều đầy đủ field — không cần patch.');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
