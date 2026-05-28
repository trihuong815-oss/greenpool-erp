// Xoá role NV_AS — không tồn tại theo spec (tổ An sinh chỉ có cứu hộ + tạp vụ).
// Verify 0 user trước khi xoá.
// Run:
//   npx --yes tsx scripts/delete-nv-as-role.ts           # dry run
//   npx --yes tsx scripts/delete-nv-as-role.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath!), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
}
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

async function main() {
  const ref = db.collection('roles').doc('NV_AS');
  const snap = await ref.get();
  if (!snap.exists) { console.log('✓ NV_AS không tồn tại — nothing to do'); return; }

  // Verify không có user nào
  const usersSnap = await db.collection('users').where('roleId', '==', 'NV_AS').count().get();
  const userCount = usersSnap.data().count;
  console.log(`Users with roleId='NV_AS': ${userCount}`);
  if (userCount > 0) {
    console.error('❌ STOP — có user đang dùng role này. Chuyển role user trước rồi xoá.');
    process.exit(1);
  }
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY RUN (use --apply)');
  console.log(`Would delete roles/NV_AS: ${JSON.stringify(snap.data())}`);
  if (APPLY) {
    await ref.delete();
    console.log('✅ Deleted');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
