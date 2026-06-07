// scripts/backfill-current-approver.ts
//
// Phase B.7 (2026-06-07): backfill currentApprover cho tasks cũ chưa có Phase 12.5+ field.
// Quét tasks status=pending_approval, không có currentApprover, có approvalRequiredFrom legacy.
// Set: currentApprover = 'role:' + approvalRequiredFrom; approvalChain = [currentApprover].
//
// Dry-run mặc định (chỉ in ra). Pass --apply để thực sự update.
//
// Usage:
//   tsx scripts/backfill-current-approver.ts          # dry-run
//   tsx scripts/backfill-current-approver.ts --apply  # commit
//
// Sau khi backfill xong + monitor 1-2 ngày, có thể:
// 1. Bỏ field approvalRequiredFrom khỏi POST tasks/route.ts
// 2. Bỏ Q3 legacy query trong tasks/route.ts
// 3. Bỏ fallback approvalRequiredFrom trong canApproveTask (tasks-scope.ts)
//
// KHÔNG xoá field khỏi docs cũ — chỉ stop ghi mới + ngừng đọc.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const snap = await db.collection('tasks')
    .where('status', '==', 'pending_approval')
    .get();

  let candidates = 0;
  let updated = 0;
  let skippedHasChain = 0;
  let skippedNoLegacy = 0;

  for (const doc of snap.docs) {
    const x = doc.data();
    if (x.currentApprover) { skippedHasChain++; continue; }
    if (!x.approvalRequiredFrom || typeof x.approvalRequiredFrom !== 'string') {
      skippedNoLegacy++;
      continue;
    }
    candidates++;
    const entry = `role:${x.approvalRequiredFrom}`;
    console.log(
      `${APPLY ? '[APPLY]' : '[DRY] '} task=${doc.id} ` +
      `legacy=${x.approvalRequiredFrom} → currentApprover=${entry}`
    );
    if (APPLY) {
      await doc.ref.update({
        currentApprover: entry,
        approvalChain: Array.isArray(x.approvalChain) && x.approvalChain.length > 0
          ? x.approvalChain
          : [entry],
      });
      updated++;
    }
  }

  console.log('\n── Summary ──');
  console.log(`Total pending_approval: ${snap.size}`);
  console.log(`Skipped (already has currentApprover): ${skippedHasChain}`);
  console.log(`Skipped (no legacy field):             ${skippedNoLegacy}`);
  console.log(`Candidates:                            ${candidates}`);
  console.log(`${APPLY ? 'Updated' : 'Would update'}:                 ${APPLY ? updated : candidates}`);
  console.log(APPLY ? '\n✓ Backfill applied.' : '\nDry-run only. Pass --apply để commit.');
}

main().catch((e) => {
  console.error('Backfill failed:', e);
  process.exit(1);
});
