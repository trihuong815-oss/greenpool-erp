import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  const u = await db.collection('users').doc('51cd3c82-cce3-4ce1-a34d-0ee71e65d949').get();
  const tokens = u.data()?.fcmTokens ?? [];
  if (tokens.length === 0) { console.log('No tokens'); return; }
  const res = await getMessaging().sendEachForMulticast({
    notification: {
      title: '📋 Checklist mới: Hà Văn Chiến',
      body: 'QLCS @CTT · ca sáng · 2026-05-29 (replay vì code có bug void)',
    },
    webpush: { fcmOptions: { link: '/checklist-v2' }, notification: { icon: '/icon-192.png', tag: 'replay' } },
    tokens,
  });
  console.log(`Sent: ${res.successCount}/${res.responses.length}`);
}
main().catch(console.error);
