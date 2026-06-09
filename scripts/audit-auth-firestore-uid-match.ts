// Audit triệt để: kiểm tra mọi user Firestore có Firebase Auth tương ứng không.
// Nếu KHÔNG khớp → user-key approval flow sẽ fail vì auth.uid ≠ Firestore docId.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
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
  const auth = getAuth();

  // 1. Lấy mọi Firebase Auth users
  console.log('=== Firebase Auth users ===');
  const authMap: Record<string, { email: string; displayName: string }> = {};
  let token: string | undefined;
  let authCount = 0;
  do {
    const page = await auth.listUsers(1000, token);
    page.users.forEach((u) => {
      authMap[u.uid] = { email: u.email ?? '?', displayName: u.displayName ?? '?' };
      authCount++;
    });
    token = page.pageToken;
  } while (token);
  console.log(`Total Firebase Auth users: ${authCount}`);

  // 2. Lấy mọi Firestore users
  console.log('\n=== Firestore users ===');
  const fsSnap = await db.collection('users').get();
  console.log(`Total Firestore users: ${fsSnap.size}`);

  // 3. Match
  console.log('\n=== Mismatch / orphan checks ===');
  let okCount = 0;
  let orphanFs = 0;  // Firestore có nhưng Auth không có
  let mismatchEmail = 0;
  let unverifiedRecent = 0;

  for (const doc of fsSnap.docs) {
    const x = doc.data() as any;
    const fsUid = doc.id;
    const fsEmail = x.email;
    const fsName = x.displayName;
    const status = x.status;
    const role = x.roleId;

    const authUser = authMap[fsUid];
    if (!authUser) {
      orphanFs++;
      console.log(`❌ ORPHAN Firestore (auth NOT found): uid=${fsUid} | ${fsEmail} | ${fsName} | ${role} | status=${status}`);
      // Try find Auth by email instead
      try {
        const altAuth = await auth.getUserByEmail(fsEmail);
        console.log(`    → Auth user TỒN TẠI với email này nhưng UID khác: ${altAuth.uid}`);
        mismatchEmail++;
      } catch {
        console.log(`    → Auth user KHÔNG TỒN TẠI với email này — chưa tạo Auth account`);
      }
      continue;
    }
    if (authUser.email && fsEmail && authUser.email.toLowerCase() !== fsEmail.toLowerCase()) {
      console.log(`⚠ EMAIL MISMATCH: uid=${fsUid} | Firestore=${fsEmail} | Auth=${authUser.email}`);
    }
    okCount++;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY:`);
  console.log(`  ✓ Matched (FS uid = Auth uid): ${okCount}`);
  console.log(`  ❌ Orphan Firestore (no Auth user): ${orphanFs}`);
  console.log(`  ⚠ Email mismatch but UID found: ${mismatchEmail}`);

  // 4. List of leadership/approver users with status
  console.log(`\n=== Leadership users critical check ===`);
  const CRITICAL_ROLES = ['ADMIN', 'CEO', 'GD_KD', 'GD_VP', 'TP_KT', 'TP_DT', 'TP_MKT', 'TP_KE', 'TP_NS', 'TP_GS', 'PP_HT', 'PP_XLN', 'QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT'];
  for (const r of CRITICAL_ROLES) {
    const matched = fsSnap.docs.filter((d) => d.data().roleId === r && d.data().status === 'active');
    if (matched.length === 0) {
      console.log(`  ${r}: 0 active user`);
      continue;
    }
    for (const d of matched) {
      const x = d.data() as any;
      const hasAuth = !!authMap[d.id];
      console.log(`  ${r}: ${x.displayName} | ${x.email} | Auth=${hasAuth ? '✓' : '❌'}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
