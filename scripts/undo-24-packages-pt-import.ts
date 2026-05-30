// UNDO 44 docs em import sai semantic ở scripts/import-24-packages-2026-pt.ts
// Lý do: em hiểu nhầm bảng anh gửi — bảng BƠI/FITNESS/FULL đã gộp cả
// Thẻ học bơi + Thẻ tích lượt + ... vào dịch vụ tổng, không phải chỉ "Thẻ member bơi".
//
// Doc IDs cần xóa: 2026_${month:02}_24_${packageId} với packageId là 1 trong các ID của:
// Thẻ member bơi (7 packages), Thẻ member Fitness (6 packages — skip 2T), Full dịch vụ (7 packages)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// 20 package IDs em đã ghi (3 nhóm × các duration)
const PACKAGE_IDS = [
  // Thẻ member bơi
  'RlpcrLNIKnn4TBtUAmV7', 'ZeBzQiz8lRhIqifdGPaj', 'lmiWUA77jWKnOCzgVkKl',
  'RV2f7TZY9gXtgOyeNf3H', 'BlUIBomRO0FieIGMc6Zm', 'e1iCHcjavCu0t9103ytc', 'MrwAqJWXYS1qO5LHjmt3',
  // Thẻ member Fitness (skip 2T vì DB chưa có)
  'm9IxcW2rRdPMrPatbPko', 'xTGM3illhwWpdy6mJ97l', 'QR7c5hqMvaArD6VDCz7l',
  '5pLWO0H0m7Kg0RhSy0zm', 'jBienA9u8CvNq081pBmZ', 'WTBxnAvCyqTfTVXdBLXl',
  // Full dịch vụ
  'q3BM6I5AeFa8Ur3pjhSB', 'qxZAS7c9wjRGF2e65jJF', 'Xh4JMu6z7T5OnuAXbAYl',
  'WlXELVueRpI26fk3rDYt', 'RIyTiSwgeyTKYxPomJaf', 'l0gSaNzZEPNeALXcfJkM', 'VVstnNwmszn2gBMjGLvr',
];

async function main() {
  console.log(APPLY ? '🚀 APPLY DELETE' : '👀 DRY-RUN — dùng --apply');
  const toDel: string[] = [];
  for (const m of [1, 2, 3, 4]) {
    for (const pid of PACKAGE_IDS) {
      const docId = `2026_${String(m).padStart(2, '0')}_24_${pid}`;
      const snap = await db.collection('packageQuantities').doc(docId).get();
      if (snap.exists) {
        toDel.push(docId);
        console.log(`  ✗ ${docId}`);
      }
    }
  }
  console.log(`\nTổng docs cần xóa: ${toDel.length}`);

  if (APPLY) {
    const batch = db.batch();
    for (const id of toDel) batch.delete(db.collection('packageQuantities').doc(id));
    await batch.commit();
    console.log(`✅ Đã xóa ${toDel.length} docs`);
  } else {
    console.log('(dry-run — chạy lại với --apply)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
