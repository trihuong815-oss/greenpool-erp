// Cập nhật vị trí org: TIBAN_TT thuộc phòng Nhân sự (TP_NS) — khối VP.
// Run:
//   npx --yes tsx scripts/move-tiban-to-ns.ts           # dry run
//   npx --yes tsx scripts/move-tiban-to-ns.ts --apply   # apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
}
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const UPDATES = [
  { code: 'TIBAN_TT', patch: { block_id: 'VP', parent_role: 'TP_NS' } },
  { code: 'NV_TTNB',  patch: { block_id: 'VP', parent_role: 'TIBAN_TT' } },
];

async function main() {
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY RUN (use --apply để thực thi)');
  for (const { code, patch } of UPDATES) {
    const ref = db.collection('roles').doc(code);
    const snap = await ref.get();
    if (!snap.exists) { console.warn(`  ⚠ ${code}: không tồn tại`); continue; }
    const cur = snap.data() ?? {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) {
      before[k] = cur[k] ?? null;
      after[k] = (patch as Record<string, unknown>)[k];
    }
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    console.log(`  ${changed ? '✏️' : '✓ '} ${code}`);
    console.log(`     before: ${JSON.stringify(before)}`);
    console.log(`     after : ${JSON.stringify(after)}`);
    if (APPLY && changed) {
      await ref.update(patch);
      console.log('     ✅ updated');
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
