// Tạo admin account mới: nguyenvanhuong.gdkd@greenpool.vn / Huong@greenpool2026
// Role: CEO (full quyền). Idempotent: skip nếu email đã tồn tại.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const EMAIL = 'nguyenvanhuong.gdkd@greenpool.vn';
const PASSWORD = 'Huong@greenpool2026';
const DISPLAY_NAME = 'Nguyễn Văn Hướng';
const ROLE = 'CEO';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) { console.error('Missing GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1); }
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();
const auth = getAuth();

(async () => {
  console.log(`\n📝 Tạo admin account: ${EMAIL}\n`);

  // Check existing
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(EMAIL);
    uid = existing.uid;
    console.log(`  ⚠ Email đã tồn tại (uid=${uid.slice(0,8)}…) — cập nhật mật khẩu + role thay vì tạo mới`);
    await auth.updateUser(uid, {
      password: PASSWORD,
      displayName: DISPLAY_NAME,
      emailVerified: true,
      disabled: false,
    });
  } catch (e: any) {
    if (e?.code !== 'auth/user-not-found') throw e;
    // Create new
    const created = await auth.createUser({
      email: EMAIL,
      password: PASSWORD,
      displayName: DISPLAY_NAME,
      emailVerified: true,
    });
    uid = created.uid;
    console.log(`  ✓ Created Firebase Auth user (uid=${uid.slice(0,8)}…)`);
  }

  // Set custom claims
  await auth.setCustomUserClaims(uid, {
    role: ROLE,
    branchId: null,
    departmentId: null,
  });
  console.log(`  ✓ Custom claims: role=${ROLE}`);

  // Upsert Firestore users/{uid}
  const now = new Date();
  await db.collection('users').doc(uid).set({
    email: EMAIL,
    displayName: DISPLAY_NAME,
    roleId: ROLE,
    roleLevel: 1,           // CEO = top
    blockId: null,          // CEO không thuộc khối nào
    branchId: null,         // CEO ở toàn hệ thống, không gắn cơ sở
    branchName: null,
    departmentId: null,
    departmentName: null,
    phone: null,
    status: 'active',
    isProbation: false,
    createdAt: now,
    createdBy: 'create-admin-gdkd-script',
    updatedAt: now,
    updatedBy: 'create-admin-gdkd-script',
  }, { merge: true });
  console.log(`  ✓ Firestore users/${uid.slice(0,8)}… upserted`);

  console.log(`\n=========================================`);
  console.log(`✅ ADMIN ACCOUNT SẴN SÀNG`);
  console.log(`=========================================`);
  console.log(`Email:    ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Role:     ${ROLE} (full quyền 5 cơ sở)`);
  console.log(`UID:      ${uid}`);
  console.log(`\n💡 Đổi mật khẩu sau khi login lần đầu.`);
})().then(() => process.exit(0)).catch((e) => { console.error('LỖI:', e); process.exit(1); });
