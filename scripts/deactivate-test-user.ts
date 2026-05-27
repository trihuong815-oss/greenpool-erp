// Deactivate test user "Phạm Thanh Tùng" (uid=1aef6498-...)
// - Firestore users/{uid}: status='inactive', deactivatedAt, deactivatedBy
// - Firebase Auth: disable account (không xoá hẳn để giữ audit history)
//
// Chạy:  npx --yes tsx scripts/deactivate-test-user.ts
//        npx --yes tsx scripts/deactivate-test-user.ts --hard-delete  (xoá hẳn cả Firestore + Auth)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) { console.error('Missing GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1); }
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const auth = getAuth();

const HARD = process.argv.includes('--hard-delete');
const TARGET_EMAIL_REGEX = /tungtpck/i;
const TARGET_NAME_REGEX = /phạm thanh tùng/i;

(async () => {
  const snap = await db.collection('users').get();
  const matches = snap.docs.filter((d) => {
    const x = d.data();
    return TARGET_NAME_REGEX.test(x.displayName ?? '') || TARGET_EMAIL_REGEX.test(x.email ?? '');
  });
  if (matches.length === 0) { console.log('Không tìm thấy user nào khớp.'); return; }

  console.log(`Tìm thấy ${matches.length} user khớp:`);
  for (const d of matches) {
    const x = d.data();
    console.log(`  - uid=${d.id} email=${x.email} name=${x.displayName} role=${x.roleId} status=${x.status}`);
  }

  for (const d of matches) {
    const uid = d.id;
    const x = d.data();
    if (HARD) {
      try {
        await auth.deleteUser(uid);
        console.log(`  🗑  Auth deleted: ${uid}`);
      } catch (e: any) { console.warn(`  ⚠ Auth delete fail ${uid}: ${e?.message}`); }
      try {
        await db.collection('users').doc(uid).delete();
        console.log(`  🗑  Firestore deleted: ${uid}`);
      } catch (e: any) { console.warn(`  ⚠ Firestore delete fail ${uid}: ${e?.message}`); }
    } else {
      // Soft deactivate
      try {
        await auth.updateUser(uid, { disabled: true });
        console.log(`  ⏸  Auth disabled: ${uid}`);
      } catch (e: any) { console.warn(`  ⚠ Auth disable fail ${uid}: ${e?.message}`); }
      await db.collection('users').doc(uid).update({
        status: 'inactive',
        deactivatedAt: new Date(),
        deactivatedBy: 'deactivate-test-user-script',
        deactivateReason: 'Test user cleanup (Phạm Thanh Tùng)',
      });
      console.log(`  ⏸  Firestore status=inactive: ${uid} (name=${x.displayName})`);
    }
  }

  console.log(`\n${HARD ? '✓ Hard-deleted' : '✓ Deactivated'} ${matches.length} user.`);
  if (!HARD) console.log('   → Chạy với --hard-delete để xoá hẳn nếu cần.');
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
