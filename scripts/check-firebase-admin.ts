// Smoke test: Firebase Admin có kết nối được Firestore không?
// Chạy:  npx --yes tsx scripts/check-firebase-admin.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}
const abs = resolve(process.cwd(), credPath);
if (!existsSync(abs)) {
  console.error(`Không thấy file: ${abs}`);
  process.exit(1);
}

const sa = JSON.parse(readFileSync(abs, 'utf8'));
console.log(`Project: ${sa.project_id}`);
console.log(`Client email: ${sa.client_email}`);

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
  });
}

const db = getFirestore();

async function main() {
  // Ghi 1 doc ping rồi đọc lại, không động vào collection thật
  const ref = db.collection('_smoke').doc('admin-ping');
  await ref.set({ at: new Date().toISOString(), source: 'check-firebase-admin' });
  const snap = await ref.get();
  console.log('Ghi + đọc OK →', snap.data());

  // Liệt kê các collection top-level đang tồn tại
  const cols = await db.listCollections();
  console.log(`Collections hiện có (${cols.length}):`, cols.map((c) => c.id));

  // Dọn doc ping
  await ref.delete();
  console.log('Đã dọn _smoke/admin-ping');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('LỖI:', e.message);
  process.exit(1);
});
