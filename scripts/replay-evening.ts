import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // Lấy user Hướng + Chiến (2 user có tokens)
  const uids = ['51cd3c82-cce3-4ce1-a34d-0ee71e65d949', 'NHSAwZTts5YIUnsEusDqhjIemEp1'];
  const messaging = getMessaging();
  for (const uid of uids) {
    const d = await db.collection('users').doc(uid).get();
    const x = d.data();
    if (!x) continue;
    const tokens = x.fcmTokens ?? [];
    if (tokens.length === 0) continue;
    const firstName = x.displayName.split(' ').slice(-1)[0] || 'bạn';
    const res = await messaging.sendEachForMulticast({
      notification: {
        title: `🌙 Chào buổi tối, ${firstName}!`,
        body: `Ngày mai chưa có task lên lịch — hãy nghỉ ngơi thật khoẻ cho ngày mai tuyệt vời nhé! 💚`,
      },
      webpush: {
        fcmOptions: { link: '/cong-viec-ca-nhan' },
        notification: { icon: '/icon-192.png', tag: `evening-replay-${Date.now()}` },
      },
      tokens,
    });
    console.log(`${x.displayName}: sent ${res.successCount}/${res.responses.length}`);
  }
}
main().catch(console.error);
