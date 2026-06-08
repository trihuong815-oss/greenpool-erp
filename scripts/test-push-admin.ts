// Test gửi push test message tới ADMIN active để verify FCM working.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
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

  // ADMIN active
  const snap = await db.collection('users')
    .where('status', '==', 'active')
    .where('roleId', '==', 'ADMIN')
    .get();

  console.log(`Found ${snap.size} active ADMIN`);
  for (const d of snap.docs) {
    const x = d.data() as any;
    const devices: any[] = Array.isArray(x.fcmDevices) ? x.fcmDevices : [];
    const enabledTokens = devices
      .filter((d) => d && d.enabled !== false && typeof d.token === 'string' && d.token.length >= 20)
      .map((d) => d.token as string);
    const legacyTokens: string[] = Array.isArray(x.fcmTokens)
      ? x.fcmTokens.filter((t: any) => typeof t === 'string' && t.length >= 20)
      : [];
    const tokens = Array.from(new Set([...enabledTokens, ...legacyTokens]));

    console.log(`\n=== ${x.email} (${x.displayName}) ===`);
    console.log(`  Tokens to send: ${tokens.length}`);
    if (tokens.length === 0) {
      console.log(`  (no token, skip)`);
      continue;
    }

    const messaging = getMessaging();
    const message = {
      notification: {
        title: '🧪 Test thông báo Phase Noti-Audit',
        body: 'Nếu anh thấy thông báo này, FCM hoạt động bình thường. Lúc test: ' + new Date().toISOString(),
      },
      webpush: {
        fcmOptions: { link: '/dashboard' },
        notification: {
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'noti-audit-test',
          requireInteraction: false,
        },
      },
      data: { kind: 'test_push', timestamp: String(Date.now()) },
      tokens,
    };
    const res = await messaging.sendEachForMulticast(message);
    console.log(`  Sent: ${res.successCount} | Failed: ${res.failureCount}`);
    res.responses.forEach((r, i) => {
      if (!r.success) {
        console.log(`    Token #${i} FAIL: ${r.error?.code} - ${r.error?.message}`);
      } else {
        console.log(`    Token #${i} OK: ${r.messageId}`);
      }
    });
  }
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
