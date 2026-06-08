// Test E2E luồng đề xuất + giao việc — 4 case:
// A. Đề xuất SAME-BLOCK: TP_KT → ADMIN (senior, GD_KD slot trống fallback ADMIN)
// B. Đề xuất CROSS-BLOCK: TP_KT (KD) → TP_KE (VP)
//    Chain: [ADMIN (GĐ_KD fallback)] → [GD_VP Huệ] → [TP_KE Hương]
// C. Giao việc SAME-BLOCK: ADMIN → TP_KT (cùng KD) → instant pending, push assignee
// D. Giao việc CROSS-BLOCK: GD_VP → assignee block KD → currentApprover='role:GD_KD'
//    → fallback ADMIN nhận duyệt
//
// Mỗi case: resolve approver/assignee tokens → gửi push test với title rõ.
// User xác nhận từng người có nhận push đúng.

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

async function getUserByRole(db: any, roleId: string) {
  const snap = await db.collection('users')
    .where('status', '==', 'active')
    .where('roleId', '==', roleId)
    .limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { uid: d.id, ...d.data() };
}

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

async function pushTest(messaging: any, user: any, title: string, body: string, tag: string) {
  const tokens = getTokens(user);
  if (tokens.length === 0) {
    return { user: user.email, status: '⚠ chưa bật noti', sent: 0, total: 0 };
  }
  const message = {
    notification: { title, body },
    webpush: {
      fcmOptions: { link: '/giao-viec' },
      notification: { icon: '/icon-192.png', badge: '/icon-192.png', tag, requireInteraction: false },
    },
    data: { kind: 'e2e_test', tag },
    tokens,
  };
  try {
    const res = await messaging.sendEachForMulticast(message);
    return { user: user.email, status: '✓', sent: res.successCount, total: tokens.length };
  } catch (e: any) {
    return { user: user.email, status: `❌ ${e?.message}`, sent: 0, total: tokens.length };
  }
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const messaging = getMessaging();

  // ── Resolve actors
  const admin = await getUserByRole(db, 'ADMIN');
  const ceo = await getUserByRole(db, 'CEO');
  const gdvp = await getUserByRole(db, 'GD_VP');
  const tpkt = await getUserByRole(db, 'TP_KT');
  const tpke = await getUserByRole(db, 'TP_KE');
  const tpns = await getUserByRole(db, 'TP_NS');

  console.log('\n=== ACTORS ===');
  console.log(`ADMIN     : ${admin?.email} (${admin?.displayName})`);
  console.log(`CEO       : ${ceo?.email} (${ceo?.displayName})`);
  console.log(`GD_VP     : ${gdvp?.email} (${gdvp?.displayName})`);
  console.log(`TP_KT     : ${tpkt?.email} (${tpkt?.displayName})`);
  console.log(`TP_KE     : ${tpke?.email} (${tpke?.displayName})`);
  console.log(`TP_NS     : ${tpns?.email} (${tpns?.displayName})`);

  // ════════════════════════════════════════════════════════
  // CASE A: Đề xuất SAME-BLOCK (TP_KT → ADMIN senior)
  // Logic: same-block (KD-KD vì ADMIN coi như GD_KD).
  //   Chain = [user:ADMIN_UID]. currentApprover = chain[0].
  //   Push: ADMIN nhận "📥 Đề xuất chờ duyệt".
  // ════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('CASE A: Đề xuất SAME-BLOCK (TP_KT Tùng → ADMIN Hướng)');
  console.log('══════════════════════════════════════════════════════════');
  console.log('Chain mong đợi: [ADMIN]');
  if (admin) {
    const r = await pushTest(messaging, admin,
      '📥 [Case A] Đề xuất chờ bạn duyệt',
      `"Test E2E same-block" — từ ${tpkt?.displayName ?? 'TP_KT'}. Đây là test chain 1 cấp.`,
      'e2e-case-a');
    console.log(`Push ADMIN: ${r.status} sent=${r.sent}/${r.total}`);
  }

  // ════════════════════════════════════════════════════════
  // CASE B: Đề xuất CROSS-BLOCK (TP_KT KD → TP_KE VP)
  // Chain expected (Phase 12.9.5):
  //   1. GĐ khối creator (KD) → ADMIN fallback vì GD_KD trống
  //   2. GĐ khối recipient (VP) → GD_VP Huệ
  //   3. Recipient → TP_KE Hương
  // currentApprover = chain[0] = user:ADMIN_UID
  // Push step 1: ADMIN nhận trước
  // ════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('CASE B: Đề xuất CROSS-BLOCK (TP_KT Tùng KD → TP_KE Hương VP)');
  console.log('══════════════════════════════════════════════════════════');
  console.log('Chain mong đợi: [ADMIN] → [GD_VP Huệ] → [TP_KE Hương]');
  if (admin) {
    const r = await pushTest(messaging, admin,
      '📥 [Case B-step1] Đề xuất liên khối chờ bạn duyệt',
      `"Test E2E cross-block" — từ ${tpkt?.displayName} (KD). Bạn là GĐ khối creator (fallback ADMIN).`,
      'e2e-case-b-1');
    console.log(`Push ADMIN (step 1): ${r.status} sent=${r.sent}/${r.total}`);
  }
  console.log('[Simulate ADMIN approve step 1 → chain advance to GD_VP]');
  if (gdvp) {
    const r = await pushTest(messaging, gdvp,
      '📥 [Case B-step2] Đề xuất liên khối chờ bạn duyệt',
      `"Test E2E cross-block" — ADMIN vừa duyệt, đến lượt bạn (GĐ khối nhận).`,
      'e2e-case-b-2');
    console.log(`Push GD_VP Huệ (step 2): ${r.status} sent=${r.sent}/${r.total}`);
  }
  console.log('[Simulate GD_VP approve step 2 → chain advance to TP_KE]');
  if (tpke) {
    const r = await pushTest(messaging, tpke,
      '📥 [Case B-step3] Đề xuất liên khối chờ bạn duyệt cuối',
      `"Test E2E cross-block" — GĐ_VP vừa duyệt, đến lượt bạn (recipient).`,
      'e2e-case-b-3');
    console.log(`Push TP_KE Hương (step 3): ${r.status} sent=${r.sent}/${r.total}`);
  }

  // ════════════════════════════════════════════════════════
  // CASE C: Giao việc SAME-BLOCK (ADMIN → TP_KT cùng KD)
  // Logic: CEO/ADMIN tạo → instant pending → push assignee
  // ════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('CASE C: Giao việc SAME-BLOCK (ADMIN → TP_KT Tùng)');
  console.log('══════════════════════════════════════════════════════════');
  console.log('Logic: ADMIN → instant pending → push assignee');
  if (tpkt) {
    const r = await pushTest(messaging, tpkt,
      '📌 [Case C] Giao việc mới cho bạn',
      `"Test E2E giao việc same-block" — giao bởi ${admin?.displayName}. Bạn nhận task ngay.`,
      'e2e-case-c');
    console.log(`Push TP_KT Tùng (assignee): ${r.status} sent=${r.sent}/${r.total}`);
  }

  // ════════════════════════════════════════════════════════
  // CASE D: Giao việc CROSS-BLOCK (GD_VP → assignee block KD)
  // Logic: GĐ tạo cross-block → cần GĐ khối assignee duyệt
  //   currentApprover = 'role:GD_KD' → resolve users with roleId='GD_KD'
  //   GD_KD slot trống → fallback ADMIN (Phase noti-audit hôm nay)
  //   Push: ADMIN nhận "📥 Giao việc chờ duyệt"
  // ════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('CASE D: Giao việc CROSS-BLOCK (GD_VP Huệ → assignee KD)');
  console.log('══════════════════════════════════════════════════════════');
  console.log('Logic: cross-block → currentApprover=role:GD_KD → fallback ADMIN');
  if (admin) {
    const r = await pushTest(messaging, admin,
      '📥 [Case D] Giao việc liên khối chờ bạn duyệt',
      `"Test E2E giao việc cross-block" — từ ${gdvp?.displayName} (GĐ VP). Bạn là GĐ KD (fallback ADMIN).`,
      'e2e-case-d');
    console.log(`Push ADMIN (fallback GD_KD): ${r.status} sent=${r.sent}/${r.total}`);
  }
  console.log('[Simulate ADMIN approve → status pending → push assignee TP_KT]');
  if (tpkt) {
    const r = await pushTest(messaging, tpkt,
      '📌 [Case D-end] Giao việc đã được duyệt — bạn nhận',
      `"Test E2E giao việc cross-block" — ADMIN vừa duyệt cho bạn thực hiện.`,
      'e2e-case-d-end');
    console.log(`Push TP_KT Tùng (assignee final): ${r.status} sent=${r.sent}/${r.total}`);
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('TỔNG KẾT — Anh kiểm tra từng push trên thiết bị các user:');
  console.log('  Case A: ADMIN (Hướng) nhận 1 noti');
  console.log('  Case B: ADMIN + GD_VP Huệ + TP_KE Hương — 3 noti');
  console.log('  Case C: TP_KT Tùng nhận 1 noti');
  console.log('  Case D: ADMIN + TP_KT Tùng — 2 noti');
  console.log('Tổng cộng anh sẽ nhận 1+1+1+1 = 4 noti (ADMIN xuất hiện 3 lần)');
  console.log('Người khác:');
  console.log('  TP_KT Tùng: 2 noti (Case C, D-end)');
  console.log('  GD_VP Huệ: 1 noti (Case B-step2) — chưa bật noti, sẽ KHÔNG nhận');
  console.log('  TP_KE Hương: 1 noti (Case B-step3) — chưa bật noti, sẽ KHÔNG nhận');
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
