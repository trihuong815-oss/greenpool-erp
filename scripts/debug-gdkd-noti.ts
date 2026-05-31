// Debug nguyên nhân tài khoản GD_KD không nhận push noti khi QLCS tạo đề xuất.
// Check từng layer:
//   1. User GD_KD doc tồn tại? Schema có 'roleId' đúng?
//   2. fcmTokens array có gì không?
//   3. FCM credentials/messaging có hoạt động? → thử send test push
//   4. pushToRoles query có match đúng GD_KD không?

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const messaging = getMessaging();

async function main() {
  console.log('═══ DEBUG GD_KD PUSH NOTI ═══\n');

  // ── Step 1: Find GD_KD users via roleId ──
  console.log('Step 1: Query users WHERE roleId == "GD_KD"');
  const byRoleId = await db.collection('users').where('roleId', '==', 'GD_KD').get();
  console.log(`  → ${byRoleId.size} docs`);
  for (const d of byRoleId.docs) {
    const x = d.data();
    console.log(`    • uid=${d.id.slice(0, 8)}… email=${x.email} status=${x.status ?? 'active'} fcmTokens=${Array.isArray(x.fcmTokens) ? x.fcmTokens.length : '(không có field)'}`);
  }

  // ── Step 2: Check schema field alternative (role_code legacy) ──
  console.log('\nStep 2: Query users WHERE role_code == "GD_KD" (legacy snake_case)');
  const byRoleCode = await db.collection('users').where('role_code', '==', 'GD_KD').get();
  console.log(`  → ${byRoleCode.size} docs`);
  for (const d of byRoleCode.docs) {
    const x = d.data();
    console.log(`    • uid=${d.id.slice(0, 8)}… email=${x.email} fields=${Object.keys(x).join(',')}`);
  }

  // ── Step 3: List all fields của 1 GD_KD doc đầu tiên ──
  if (byRoleId.size > 0) {
    console.log('\nStep 3: Schema của doc đầu tiên');
    const x = byRoleId.docs[0].data();
    console.log('  Keys:', Object.keys(x).sort().join(', '));
    console.log('  fcmTokens:', JSON.stringify(x.fcmTokens ?? null));
  }

  // ── Step 4: Test query pushToRoles ──
  console.log('\nStep 4: Query pushToRoles - WHERE status=="active" AND roleId in ["GD_KD"]');
  const pushTest = await db.collection('users')
    .where('status', '==', 'active')
    .where('roleId', 'in', ['GD_KD'])
    .get();
  console.log(`  → ${pushTest.size} active GD_KD docs sẽ được push`);
  for (const d of pushTest.docs) {
    const x = d.data();
    const tokens = Array.isArray(x.fcmTokens) ? x.fcmTokens.filter((t: any) => typeof t === 'string' && t.length > 20) : [];
    console.log(`    • ${x.email} → ${tokens.length} valid token(s)${tokens.length > 0 ? ` (first: ${tokens[0].slice(0, 20)}…)` : ''}`);
  }

  // ── Step 5: Tìm task pending_approval gần đây (QLCS_HM tạo) ──
  console.log('\nStep 5: Tasks gần đây với status=pending_approval');
  const recent = await db.collection('tasks')
    .where('status', '==', 'pending_approval')
    .orderBy('createdAt', 'desc')
    .limit(5).get();
  console.log(`  → ${recent.size} task pending_approval`);
  for (const d of recent.docs) {
    const x = d.data();
    const createdAt = x.createdAt?.toDate?.()?.toISOString?.() ?? 'unknown';
    console.log(`    • ${d.id.slice(0, 8)}… "${(x.title ?? '').slice(0, 40)}" by ${x.createdByName ?? '?'} (${x.createdByRole}) → approvalRequiredFrom=${x.approvalRequiredFrom} · chain=${JSON.stringify(x.approvalChain ?? null)} · currentApprover=${x.currentApprover ?? null} · createdAt=${createdAt}`);
  }

  // ── Step 6: Test gửi push thật tới GD_KD đầu tiên ──
  const targetUid = pushTest.docs[0]?.id;
  if (targetUid) {
    const targetData = pushTest.docs[0].data();
    const tokens = Array.isArray(targetData.fcmTokens) ? targetData.fcmTokens.filter((t: any) => typeof t === 'string' && t.length > 20) : [];
    console.log(`\nStep 6: Test send push tới ${targetData.email} (${tokens.length} token)`);
    if (tokens.length === 0) {
      console.log('  ⚠ KHÔNG CÓ FCM TOKEN — đây là nguyên nhân không nhận noti!');
      console.log('  → User chưa grant notification permission trên PWA / chưa register token');
    } else {
      try {
        const res = await messaging.sendEachForMulticast({
          notification: { title: '🧪 Test noti từ debug script', body: 'Nếu thấy noti này → FCM hoạt động' },
          webpush: {
            fcmOptions: { link: '/dashboard' },
            notification: { icon: '/icon-192.png', badge: '/icon-192.png', tag: 'debug-test' },
          },
          data: { kind: 'debug_test' },
          tokens,
        });
        console.log(`  ✓ Send result: success=${res.successCount} fail=${res.failureCount}`);
        if (res.failureCount > 0) {
          res.responses.forEach((r, i) => {
            if (!r.success) console.log(`    ✗ Token[${i}]: ${r.error?.code ?? 'unknown'} — ${r.error?.message ?? ''}`);
          });
        }
      } catch (e: any) {
        console.error('  ✗ FCM send failed:', e?.code, e?.message);
      }
    }
  }
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
