// Tạo 3 TP khối Văn phòng: Kế toán, Nhân sự, Giám sát.
// Schema khớp TP_KT/TP_DT/TP_MKT đang có (blockId='KD' theo data legacy hiện tại).
// Password tạm: Greenpool@2026 — 3 TP sau đăng nhập sẽ tự đổi password.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

const INITIAL_PASSWORD = 'Greenpool@2026';

const USERS = [
  {
    email: 'nguyenthihuong.tpke@greenpool.vn',
    displayName: 'Nguyễn Thị Hương',
    roleId: 'TP_KE',
    departmentId: 'KE',
    departmentName: 'Phòng Kế toán',
  },
  {
    email: 'hanhuquynh.tpns@greenpool.vn',
    displayName: 'Hà Như Quỳnh',
    roleId: 'TP_NS',
    departmentId: 'NS',
    departmentName: 'Phòng Nhân sự',
  },
  {
    email: 'daothiphuong.tpgs@greenpool.vn',
    displayName: 'Đào Thị Phượng',
    roleId: 'TP_GS',
    departmentId: 'GS',
    departmentName: 'Phòng Giám sát',
  },
];

async function main() {
  initAdmin();
  const db = getFirestore();
  const auth = getAuth();
  const now = Timestamp.now();
  const dryRun = !process.argv.includes('--apply');

  console.log(`Mode: ${dryRun ? 'DRY RUN (no write)' : 'APPLY (will create)'}\n`);

  for (const u of USERS) {
    console.log(`\n── ${u.roleId} : ${u.displayName} ──`);
    // 1. Check email tồn tại trong Auth
    let existing: any = null;
    try {
      existing = await auth.getUserByEmail(u.email);
      console.log(`  ⚠ Email ${u.email} ĐÃ TỒN TẠI trong Auth (uid=${existing.uid}). Skip create, sẽ chỉ update Firestore doc.`);
    } catch (e: any) {
      if (e?.code !== 'auth/user-not-found') {
        console.error(`  ❌ Auth check error: ${e?.message}`);
        continue;
      }
    }

    if (dryRun) {
      console.log(`  [DRY] Sẽ tạo Auth user + Firestore doc với:`);
      console.log(`        email=${u.email} displayName=${u.displayName}`);
      console.log(`        roleId=${u.roleId} departmentId=${u.departmentId} blockId=KD branchId=null`);
      console.log(`        password tạm=${INITIAL_PASSWORD}`);
      continue;
    }

    // 2. Tạo Auth user
    let uid: string;
    if (existing) {
      uid = existing.uid;
    } else {
      const newUser = await auth.createUser({
        email: u.email,
        password: INITIAL_PASSWORD,
        displayName: u.displayName,
        emailVerified: false,
      });
      uid = newUser.uid;
      console.log(`  ✓ Auth created: uid=${uid}`);
    }

    // 3. Tạo Firestore doc (set merge để KHÔNG xoá field nếu có sẵn)
    const docData = {
      email: u.email,
      displayName: u.displayName,
      roleId: u.roleId,
      departmentId: u.departmentId,
      departmentName: u.departmentName,
      blockId: 'KD',  // theo pattern TP_KT/DT/MKT hiện có
      branchId: null,
      branchName: null,
      subAreas: [],
      phone: null,
      isProbation: false,
      roleLevel: 3,
      status: 'active',
      createdAt: now,
      createdBy: 'script-create-tp-vp',
      updatedAt: now,
      updatedBy: 'script-create-tp-vp',
    };
    await db.collection('users').doc(uid).set(docData, { merge: true });
    console.log(`  ✓ Firestore doc set/merge: users/${uid}`);
  }

  if (dryRun) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`DRY RUN — chưa thực sự tạo gì. Chạy lại với --apply để commit.`);
    console.log(`Command: npx tsx scripts/create-tp-vp-users.ts --apply`);
  } else {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`✓ HOÀN TẤT — 3 user TP VP đã được tạo.`);
    console.log(`Password tạm cho cả 3: ${INITIAL_PASSWORD}`);
    console.log(`Yêu cầu 3 TP đăng nhập rồi vào /doi-mat-khau đổi mật khẩu ngay.`);
  }
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
