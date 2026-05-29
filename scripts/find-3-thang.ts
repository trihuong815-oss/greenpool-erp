import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // Tìm tất cả gói tên có "tháng" của TK
  const snap = await db.collection('packages').where('branchId', '==', 'TK').get();
  console.log(`Tất cả gói TK (${snap.size}):`);
  for (const d of snap.docs) {
    const x = d.data();
    const n = (x.name ?? '').trim();
    if (n.toLowerCase().includes('tháng') || n.toLowerCase().includes('năm')) {
      console.log(`  ${d.id.padEnd(28)} "${n}"`);
    }
  }
  // Verify JVo7ec8UQdOhY3fdmGxf (T4 doc có qty=40)
  console.log('\n--- Verify package JVo7ec8UQdOhY3fdmGxf ---');
  const d = await db.collection('packages').doc('JVo7ec8UQdOhY3fdmGxf').get();
  console.log(JSON.stringify(d.data(), null, 2));
}
main().catch(console.error);
