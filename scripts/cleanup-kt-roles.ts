// Cleanup:
// 1. Xoá NV_KT_HT, NV_KT_XLN (thừa — đã có KT_HT_* + KT_XLN_* per branch)
// 2. Set parent_role cho GV_CB, GV_NC, GV_TG → TT_DT (rõ ràng, không phụ thuộc fallback)
// Run:
//   npx --yes tsx scripts/cleanup-kt-roles.ts           # dry run
//   npx --yes tsx scripts/cleanup-kt-roles.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const DELETE_ROLES = ['NV_KT_HT', 'NV_KT_XLN'];
const SET_PARENT: { code: string; parent: string }[] = [
  { code: 'GV_CB', parent: 'TT_DT' },
  { code: 'GV_NC', parent: 'TT_DT' },
  { code: 'GV_TG', parent: 'TT_DT' },
];

async function main() {
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY RUN');

  // Verify 0 users for deletions
  for (const code of DELETE_ROLES) {
    const ref = db.collection('roles').doc(code);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  ✓ ${code}: not found`); continue; }
    const uCount = (await db.collection('users').where('roleId', '==', code).count().get()).data().count;
    if (uCount > 0) { console.error(`  ❌ ${code}: ${uCount} user(s) — không xoá được`); continue; }
    console.log(`  ${APPLY ? '🗑️' : '👀'} DELETE ${code} (0 users)`);
    if (APPLY) await ref.delete();
  }

  // Set parent_role
  for (const { code, parent } of SET_PARENT) {
    const ref = db.collection('roles').doc(code);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  ✓ ${code}: not found, skip`); continue; }
    const cur = snap.data()?.parent_role ?? null;
    if (cur === parent) { console.log(`  ✓ ${code}: parent_role đã là ${parent}`); continue; }
    console.log(`  ${APPLY ? '✏️' : '👀'} SET parent_role ${code}: ${cur} → ${parent}`);
    if (APPLY) await ref.update({ parent_role: parent });
  }
  if (!APPLY) console.log('\n(use --apply để thực thi)');
}
main().catch(console.error);
