// Xoá 150 sales sample cũ (Phase 2) để chuẩn bị seed schema mới Phase 6.
// CHỈ XÓA docs có `external_id` prefix `seed_` (sample do tôi seed) — bỏ qua data thật nếu có.
// Idempotent: chạy lại sau khi đã xóa → 0 docs ảnh hưởng.
// Mặc định DRY-RUN. --apply để xóa thật.
//
// Chạy:
//   npx --yes tsx scripts/cleanup-old-sales.ts          (dry-run)
//   npx --yes tsx scripts/cleanup-old-sales.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const APPLY = process.argv.includes('--apply');

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

async function main() {
  console.log(`=== Cleanup old sample sales ===`);
  console.log(`Mode: ${APPLY ? 'APPLY (xóa thật)' : 'DRY-RUN (chỉ đếm)'}\n`);

  const snap = await db.collection('sales').get();
  console.log(`Tổng sales hiện có: ${snap.size}`);

  let withSeed = 0, withoutSeed = 0;
  const toDelete: string[] = [];
  const realData: { id: string; branchId?: string; amount?: number }[] = [];

  for (const d of snap.docs) {
    const x = d.data();
    if (typeof x.external_id === 'string' && x.external_id.startsWith('seed_')) {
      withSeed++;
      toDelete.push(d.id);
    } else {
      withoutSeed++;
      realData.push({ id: d.id, branchId: x.branchId, amount: x.amount });
    }
  }

  console.log(`\n  Sample (external_id seed_*): ${withSeed}  ← sẽ xóa`);
  console.log(`  Khác (không seed prefix):    ${withoutSeed}  ← giữ`);

  if (withoutSeed > 0) {
    console.log(`\n⚠ ${withoutSeed} doc không có prefix seed_ — preview:`);
    realData.slice(0, 5).forEach((r) => {
      console.log(`  - ${r.id.slice(0, 8)} branch=${r.branchId} amount=${r.amount}`);
    });
    if (withoutSeed > 5) console.log(`  ...và ${withoutSeed - 5} doc khác`);
  }

  if (!APPLY) {
    console.log(`\n→ Dry-run xong. Re-run với --apply để xóa ${withSeed} sample.`);
    return;
  }

  // Apply: batch delete (Firestore batch max 500 per commit)
  console.log(`\nĐang xóa ${withSeed} sample...`);
  const chunkSize = 400;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += chunkSize) {
    const batch = db.batch();
    const slice = toDelete.slice(i, i + chunkSize);
    slice.forEach((id) => batch.delete(db.collection('sales').doc(id)));
    await batch.commit();
    deleted += slice.length;
    console.log(`  Đã xóa: ${deleted}/${withSeed}`);
  }
  console.log(`✓ Done.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('LỖI:', e); process.exit(1); });
