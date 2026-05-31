// Audit FCM token coverage cho tất cả user trọng yếu (cấp duyệt + QLCS + TP).
// Phát hiện ai chưa register token → cần được nhắc bật notification trên PWA.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();

// Roles trọng yếu — nếu chưa có FCM token thì sẽ MISS noti
const CRITICAL_ROLES = ['ADMIN', 'CEO', 'GD_KD', 'GD_VP', 'TP_KE', 'TP_NS', 'TP_KT', 'TP_DT', 'TP_MKT', 'TP_GS',
  'QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT'];

async function main() {
  console.log('━━━ AUDIT FCM TOKEN COVERAGE (roles trọng yếu) ━━━\n');

  const snap = await db.collection('users')
    .where('status', '==', 'active')
    .where('roleId', 'in', CRITICAL_ROLES.slice(0, 10))   // Firestore in limit 10
    .get();
  // Lấy nốt 5 role còn lại (CRITICAL_ROLES có 15)
  const snap2 = await db.collection('users')
    .where('status', '==', 'active')
    .where('roleId', 'in', CRITICAL_ROLES.slice(10))
    .get();
  const all = [...snap.docs, ...snap2.docs];

  const hasToken: { email: string; role: string; n: number }[] = [];
  const noToken: { email: string; role: string }[] = [];
  for (const d of all) {
    const x = d.data();
    const tk = Array.isArray(x.fcmTokens) ? x.fcmTokens.filter((t: any) => typeof t === 'string' && t.length > 20) : [];
    if (tk.length > 0) hasToken.push({ email: x.email, role: x.roleId, n: tk.length });
    else noToken.push({ email: x.email, role: x.roleId });
  }

  console.log(`✅ ĐÃ CÓ TOKEN (${hasToken.length} users):`);
  hasToken.sort((a, b) => a.role.localeCompare(b.role)).forEach((u) => {
    console.log(`  • [${u.role.padEnd(11)}] ${u.email}  →  ${u.n} device(s)`);
  });

  console.log(`\n⚠ CHƯA CÓ TOKEN — sẽ MISS noti (${noToken.length} users):`);
  noToken.sort((a, b) => a.role.localeCompare(b.role)).forEach((u) => {
    console.log(`  • [${u.role.padEnd(11)}] ${u.email}`);
  });

  console.log('\n→ Yêu cầu các user trên đăng nhập PWA + bật notification.');
  console.log('  Hướng dẫn: vào /cong-viec-ca-nhan → card "Bật thông báo" → Allow');
}
main().catch((e) => { console.error(e); process.exit(1); });
