// Read-only: tìm account admin trong Firebase Auth + Firestore.
// Search theo email pattern "huong" hoặc "gd"/"gđ".

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) { console.error('Missing GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1); }
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();
const auth = getAuth();

(async () => {
  console.log('\n🔍 FIREBASE AUTH — all users matching "huong" / "gd"\n');
  const pageResult = await auth.listUsers(1000);
  const matches = pageResult.users.filter((u) =>
    (u.email ?? '').toLowerCase().includes('huong') ||
    (u.email ?? '').toLowerCase().includes('.gd@') ||
    (u.email ?? '').toLowerCase().includes('greenpool.vn')
  );
  console.log('Email'.padEnd(45), 'UID'.padEnd(30), 'Display Name', 'Disabled');
  console.log('─'.repeat(110));
  for (const u of matches) {
    console.log(
      (u.email ?? '(no email)').padEnd(45),
      (u.uid ?? '').slice(0, 28).padEnd(30),
      (u.displayName ?? '(no name)').padEnd(20),
      u.disabled ? 'YES' : 'no',
    );
  }

  console.log(`\nTotal matched: ${matches.length}\n`);

  console.log('\n🔍 FIRESTORE users — all matching "huong" trong displayName/email:\n');
  const snap = await db.collection('users').get();
  const fsMatches = snap.docs.filter((d) => {
    const x = d.data();
    return (x.email ?? '').toLowerCase().includes('huong') ||
           (x.displayName ?? '').toLowerCase().includes('hướng') ||
           (x.displayName ?? '').toLowerCase().includes('huong');
  });
  console.log('Email'.padEnd(45), 'Role'.padEnd(10), 'Display Name'.padEnd(25), 'BranchId', 'Status');
  console.log('─'.repeat(110));
  for (const d of fsMatches) {
    const x = d.data();
    console.log(
      (x.email ?? '(no email)').padEnd(45),
      (x.roleId ?? '').padEnd(10),
      (x.displayName ?? '(no name)').padEnd(25),
      (x.branchId ?? '-').padEnd(8),
      x.status ?? 'active',
    );
  }
  console.log(`\nTotal Firestore matched: ${fsMatches.length}\n`);
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
