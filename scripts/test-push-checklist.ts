// Test push giả lập "QLCS submit checklist" tới ADMIN + GD_VP + ai có scope.
// Verify FCM token còn hoạt động + payload không bị block.

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

const SUPERVISOR_ROLES = ['ADMIN', 'CEO', 'GD_KD', 'GD_VP']; // QLCS submit → push these

function getTokens(x: any): string[] {
  const devices: any[] = Array.isArray(x.fcmDevices) ? x.fcmDevices : [];
  const enabled = devices
    .filter((d) => d && d.enabled !== false && typeof d.token === 'string' && d.token.length >= 20)
    .map((d) => d.token as string);
  const legacy: string[] = Array.isArray(x.fcmTokens)
    ? x.fcmTokens.filter((t: any) => typeof t === 'string' && t.length >= 20)
    : [];
  return Array.from(new Set([...enabled, ...legacy]));
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const messaging = getMessaging();

  // Simulate pushToRoles — query users có roleId IN SUPERVISOR_ROLES
  const snap = await db.collection('users')
    .where('status', '==', 'active')
    .where('roleId', 'in', SUPERVISOR_ROLES)
    .get();

  console.log(`Found ${snap.size} supervisor users (active)`);
  // GD_KD fallback: nếu không có GD_KD → đã có ADMIN (cùng list) — không cần fallback bổ sung.

  let totalSent = 0;
  let totalSkipped = 0;
  for (const d of snap.docs) {
    const x = d.data() as any;
    const tokens = getTokens(x);
    console.log(`\n${x.roleId} | ${x.email} | ${x.displayName} | tokens=${tokens.length}`);
    if (tokens.length === 0) {
      totalSkipped++;
      console.log(`  ⚠ chưa bật noti — skip`);
      continue;
    }
    const message = {
      notification: {
        title: `📋 Checklist mới: Hà Quốc Cường`,
        body: `QLCS @24NCT · ca chiều · 2026-06-09`,
      },
      webpush: {
        fcmOptions: { link: '/checklist-v2' },
        notification: {
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `checklist-test-${Date.now()}`,
          requireInteraction: false,
        },
      },
      data: { kind: 'checklist_submit', runId: 'test', role: 'QLCS' },
      tokens,
    };
    const res = await messaging.sendEachForMulticast(message);
    totalSent += res.successCount;
    console.log(`  Sent ${res.successCount}/${res.failureCount + res.successCount}`);
    res.responses.forEach((r, i) => {
      if (!r.success) console.log(`    Token #${i} FAIL: ${r.error?.code}`);
      else console.log(`    Token #${i} OK: ${r.messageId?.slice(-12)}`);
    });
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total sent: ${totalSent} | Skipped (no token): ${totalSkipped}`);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
