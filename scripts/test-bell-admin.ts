// Test ghi inAppNoti cho ADMIN — verify bell badge xuất hiện realtime.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

async function main() {
  initAdmin();
  const db = getFirestore();

  const adminSnap = await db.collection('users')
    .where('status', '==', 'active')
    .where('roleId', '==', 'ADMIN')
    .limit(1).get();
  if (adminSnap.empty) {
    console.log('No active ADMIN');
    return;
  }
  const uid = adminSnap.docs[0].id;
  const x = adminSnap.docs[0].data() as any;
  console.log(`Writing test inAppNoti for ${x.email} (uid=${uid})`);

  const ref = db.collection('inAppNotifications').doc(uid).collection('items');
  const newDoc = await ref.add({
    title: '🧪 Test Bell — In-app realtime',
    body: 'Nếu anh thấy bell badge đỏ trên topbar + dropdown này, dual-channel hoạt động OK. Lúc test: ' + new Date().toISOString(),
    link: '/dashboard',
    kind: 'test_bell',
    data: { source: 'script' },
    createdAt: FieldValue.serverTimestamp(),
    seenAt: null,
  });
  console.log(`✓ Wrote inAppNoti doc: ${newDoc.id}`);
  console.log(`Path: inAppNotifications/${uid}/items/${newDoc.id}`);
  console.log(`\nAnh check ngay topbar (sau khi reload app):`);
  console.log(`  - Bell icon 🔔 góc phải trên → badge đỏ "1"`);
  console.log(`  - Click bell → dropdown hiện noti "🧪 Test Bell — In-app realtime"`);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
