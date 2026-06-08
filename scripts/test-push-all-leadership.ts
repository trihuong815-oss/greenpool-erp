// Test gửi push tới TẤT CẢ user level lãnh đạo: ADMIN, CEO, GD_*, TP_*, QLCS_*.
// Báo cáo: ai đã bật noti, ai chưa. Gửi 1 push test cho user đã bật.

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

const LEADERSHIP_ROLES = [
  'ADMIN', 'CEO',
  'GD_KD', 'GD_VP',
  'TP_KT', 'TP_DT', 'TP_MKT', 'TP_KE', 'TP_NS', 'TP_GS',
  'PP_HT', 'PP_XLN',
  'QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT',
];

async function main() {
  initAdmin();
  const db = getFirestore();
  const messaging = getMessaging();
  const DRY = !process.argv.includes('--apply');

  const summary: Array<{ role: string; email: string; name: string; tokens: number; sent: number; failed: number }> = [];

  for (const role of LEADERSHIP_ROLES) {
    const snap = await db.collection('users')
      .where('status', '==', 'active')
      .where('roleId', '==', role)
      .get();

    if (snap.empty) {
      summary.push({ role, email: '(no user)', name: '', tokens: 0, sent: 0, failed: 0 });
      continue;
    }

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

      if (tokens.length === 0) {
        summary.push({ role, email: x.email, name: x.displayName, tokens: 0, sent: 0, failed: 0 });
        continue;
      }

      if (DRY) {
        summary.push({ role, email: x.email, name: x.displayName, tokens: tokens.length, sent: 0, failed: 0 });
        continue;
      }

      const message = {
        notification: {
          title: '🔔 Green Pool — Test ' + role,
          body: 'Anh/chị có nhận được thông báo này không? (test luồng đề xuất + giao việc)',
        },
        webpush: {
          fcmOptions: { link: '/dashboard' },
          notification: {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `leadership-test-${role}-${d.id}`,
            requireInteraction: false,
          },
        },
        data: { kind: 'leadership_test', role, timestamp: String(Date.now()) },
        tokens,
      };
      const res = await messaging.sendEachForMulticast(message);
      summary.push({ role, email: x.email, name: x.displayName, tokens: tokens.length, sent: res.successCount, failed: res.failureCount });
    }
  }

  // Print summary table
  console.log(`\n${'='.repeat(95)}`);
  console.log(`MODE: ${DRY ? 'DRY RUN — Không gửi push, chỉ kiểm tra token' : 'APPLY — Đã gửi push'}`);
  console.log(`${'='.repeat(95)}`);
  console.log(`Role         | Email                                            | Tên                  | Tok | Sent | Fail`);
  console.log(`-`.repeat(95));
  let totalUsers = 0, totalWithTokens = 0, totalSent = 0;
  for (const s of summary) {
    totalUsers++;
    if (s.tokens > 0) totalWithTokens++;
    totalSent += s.sent;
    const flag = s.tokens === 0 ? '⚠' : s.failed > 0 ? '❗' : '✓';
    console.log(`${flag} ${s.role.padEnd(11)} | ${s.email.padEnd(48)} | ${s.name.padEnd(20)} | ${String(s.tokens).padStart(3)} | ${String(s.sent).padStart(4)} | ${String(s.failed).padStart(4)}`);
  }
  console.log(`-`.repeat(95));
  console.log(`Total: ${totalUsers} | Có token: ${totalWithTokens} | Đã gửi: ${totalSent}`);
  if (DRY) {
    console.log(`\nChạy lại với --apply để gửi push thật.`);
  }
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
