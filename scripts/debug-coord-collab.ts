// Debug: kiểm tra task vừa tạo có lưu collaboratorDeptIds + collaboratorRoles không.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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
  // Lấy 5 task assignment mới nhất
  const snap = await db.collection('tasks')
    .orderBy('createdAt', 'desc')
    .limit(10).get();
  console.log(`Tổng ${snap.size} task assignment mới nhất:\n`);
  for (const d of snap.docs) {
    const t = d.data();
    console.log(`──── ${d.id} ────`);
    console.log(`Title: ${t.title}`);
    console.log(`createdAt: ${t.createdAt?.toDate?.()?.toISOString?.()}`);
    console.log(`createdByName: ${t.createdByName} (${t.createdByRole})`);
    console.log(`assigneeBlock: ${t.assigneeBlock}, assigneeDeptId: ${t.assigneeDeptId}, assigneeFacilityId: ${t.assigneeFacilityId}`);
    console.log(`assigneeUserIds: ${JSON.stringify(t.assigneeUserIds)}`);
    console.log(`ownerUid: ${t.ownerUid}, ownerName: ${t.ownerName}`);
    console.log(`collaboratorDeptIds: ${JSON.stringify(t.collaboratorDeptIds)}`);
    console.log(`collaboratorFacilityIds: ${JSON.stringify(t.collaboratorFacilityIds)}`);
    console.log(`collaboratorRoles: ${JSON.stringify(t.collaboratorRoles)}`);
    console.log(`dueDate: ${t.dueDate}`);
    console.log('');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
