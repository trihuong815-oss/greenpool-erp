// Test gửi push tới 3 QLCS: TK, 24NCT, HM với message anh yêu cầu.

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

const TARGET_ROLES = ['QLCS_TK', 'QLCS_24NCT', 'QLCS_HM'];

async function main() {
  initAdmin();
  const db = getFirestore();
  const messaging = getMessaging();

  for (const role of TARGET_ROLES) {
    const snap = await db.collection('users')
      .where('status', '==', 'active')
      .where('roleId', '==', role)
      .get();

    console.log(`\n=== ${role} — Found ${snap.size} user(s) ===`);
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

      console.log(`  ${x.email} | ${x.displayName} | tokens=${tokens.length}`);
      if (tokens.length === 0) {
        console.log(`    ⚠ Không có FCM token — user chưa bật noti trên thiết bị`);
        continue;
      }

      const message = {
        notification: {
          title: '🔔 Green Pool',
          body: 'Nhận được thông báo không?',
        },
        webpush: {
          fcmOptions: { link: '/dashboard' },
          notification: {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `qlcs-test-${role}`,
            requireInteraction: false,
          },
        },
        data: { kind: 'test_qlcs_push', timestamp: String(Date.now()) },
        tokens,
      };
      const res = await messaging.sendEachForMulticast(message);
      console.log(`    Sent: ${res.successCount} | Failed: ${res.failureCount}`);
      res.responses.forEach((r, i) => {
        if (!r.success) {
          console.log(`      Token #${i} FAIL: ${r.error?.code} - ${r.error?.message}`);
        } else {
          console.log(`      Token #${i} OK: ${r.messageId?.slice(-12)}`);
        }
      });
    }
  }
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
