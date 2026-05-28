import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();

async function main() {
  // Find user "Hướng" / "trihuong815"
  const snap = await db.collection('users').get();
  let user: any = null;
  for (const d of snap.docs) {
    const x = d.data();
    if (x.email?.includes('trihuong815') || x.displayName?.includes('Hướng')) {
      user = { uid: d.id, ...x };
      break;
    }
  }
  if (!user) { console.error('User not found'); return; }
  console.log(`Sending test push to: ${user.displayName} (${user.uid})`);
  console.log(`Tokens: ${user.fcmTokens?.length ?? 0}`);
  if (!user.fcmTokens || user.fcmTokens.length === 0) { console.error('No tokens'); return; }

  const messaging = getMessaging();
  const res = await messaging.sendEachForMulticast({
    notification: {
      title: '🧪 Test push từ Green Pool',
      body: 'Nếu anh thấy tin này → push notification hoạt động!',
    },
    webpush: {
      fcmOptions: { link: '/cong-viec-ca-nhan' },
      notification: { icon: '/logo.png', tag: 'test-' + Date.now() },
    },
    tokens: user.fcmTokens,
  });
  console.log(`\n✓ Sent: ${res.successCount}/${res.responses.length}`);
  res.responses.forEach((r, i) => {
    if (r.success) console.log(`  [${i}] ✓ messageId=${r.messageId}`);
    else console.log(`  [${i}] ✗ ${r.error?.code} — ${r.error?.message}`);
  });
}
main().catch(console.error);
