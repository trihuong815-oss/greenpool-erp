// Tạo nhóm gói "Gói PT Gym" cho cơ sở 24 NCT + 1 package mặc định.
// Anh chốt 2026-05-30: Sale PT bán gói tập PT, số buổi linh động → tên gói tùy chỉnh.
// Admin sau có thể thêm package cụ thể (PT 10 buổi, PT 20 buổi, ...) qua UI /doanh-so/packages.
//
// DRY-RUN:  GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/seed-pt-gym-group.ts
// APPLY:    GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/seed-pt-gym-group.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const BRANCH = '24';
const GROUP = { name: 'Gói PT Gym', sortOrder: 90, active: true };
const DEFAULT_PKG = { name: 'PT Gym (gói tùy chỉnh)', sortOrder: 0, active: true };

async function main() {
  console.log(APPLY ? '🚀 APPLY' : '👀 DRY-RUN — dùng --apply');

  // Check group đã có chưa
  const gSnap = await db.collection('packageGroups')
    .where('branchId', '==', BRANCH).where('name', '==', GROUP.name).limit(1).get();
  let groupId: string;
  if (!gSnap.empty) {
    groupId = gSnap.docs[0].id;
    console.log(`  ⊝ Group "${GROUP.name}" đã tồn tại — id=${groupId}`);
  } else {
    const ref = db.collection('packageGroups').doc();
    groupId = ref.id;
    console.log(`  + Group "${GROUP.name}" sẽ tạo — id=${groupId}`);
    if (APPLY) {
      await ref.set({
        ...GROUP,
        branchId: BRANCH,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: 'seed-pt-gym-group',
      });
    }
  }

  // Check default package
  const pSnap = await db.collection('packages')
    .where('branchId', '==', BRANCH).where('groupId', '==', groupId).where('name', '==', DEFAULT_PKG.name).limit(1).get();
  if (!pSnap.empty) {
    console.log(`  ⊝ Package "${DEFAULT_PKG.name}" đã tồn tại — id=${pSnap.docs[0].id}`);
  } else {
    const ref = db.collection('packages').doc();
    console.log(`  + Package "${DEFAULT_PKG.name}" sẽ tạo — id=${ref.id}`);
    if (APPLY) {
      await ref.set({
        ...DEFAULT_PKG,
        branchId: BRANCH,
        groupId,
        groupName: GROUP.name,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: 'seed-pt-gym-group',
      });
    }
  }

  if (APPLY) {
    console.log('\n✅ Done. Admin có thể thêm package cụ thể (PT 10 buổi, PT 1 tháng,...) qua UI /doanh-so/packages.');
  } else {
    console.log('\n(dry-run)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
