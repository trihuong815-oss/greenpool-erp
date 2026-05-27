// Read-only: list tất cả admin account (CEO/GD_KD/GD_VP).
// Chạy: GOOGLE_APPLICATION_CREDENTIALS=... npx --yes tsx scripts/list-admins.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) { console.error('Missing GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1); }
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

const ADMIN_ROLES = ['CEO', 'GD_KD', 'GD_VP'];

(async () => {
  console.log('\n👑 ADMIN ACCOUNTS (CEO / GD_KD / GD_VP)\n');
  const snap = await db.collection('users').where('roleId', 'in', ADMIN_ROLES).get();
  if (snap.empty) { console.log('(không có admin nào)'); return; }
  console.log('Role'.padEnd(8), 'Tên'.padEnd(28), 'Email'.padEnd(40), 'Status');
  console.log('─'.repeat(95));
  for (const d of snap.docs) {
    const x = d.data();
    console.log(
      (x.roleId ?? '').padEnd(8),
      (x.displayName ?? '(no name)').padEnd(28),
      (x.email ?? '(no email)').padEnd(40),
      x.status ?? 'active',
    );
  }
  console.log();
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
