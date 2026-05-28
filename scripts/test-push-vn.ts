import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // Find Hướng
  const userSnap = await db.collection('users').get();
  let myUid = '', tokens: string[] = [];
  for (const d of userSnap.docs) {
    const x = d.data();
    if (x.email?.includes('trihuong815') || x.displayName?.includes('Hướng')) {
      myUid = d.id; tokens = x.fcmTokens ?? [];
      break;
    }
  }
  console.log(`User: ${myUid}, tokens: ${tokens.length}`);

  // Send manual push tới tokens kèm task info
  const messaging = getMessaging();
  const res = await messaging.sendEachForMulticast({
    notification: {
      title: '🔔 Họp test',
      body: 'Còn ~1 tiếng nữa lúc 06:40 (test giờ VN)',
    },
    webpush: {
      fcmOptions: { link: '/cong-viec-ca-nhan' },
      notification: { icon: '/logo.png', tag: 'test-vn-time' },
    },
    tokens,
  });
  console.log(`\nDirect FCM push: ${res.successCount}/${res.responses.length}`);
  res.responses.forEach((r, i) => {
    console.log(`  [${i}] ${r.success ? '✓ ' + r.messageId : '✗ ' + r.error?.code + ' ' + r.error?.message}`);
  });
}
main().catch(console.error);
