import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  const s = await db.collection('users').where('roleId', '==', 'NV_SALE').where('branchId', '==', 'TK').get();
  console.log(`TK sales: ${s.size}`);
  for (const d of s.docs) {
    const x = d.data();
    console.log(`  uid=${d.id}  name="${x.displayName}"  status=${x.status}`);
  }
  // Check existing
  const e = await db.collection('packageSales')
    .where('branchId', '==', 'TK')
    .where('year', '==', 2026)
    .where('packageId', '==', '__total')
    .get();
  console.log(`\nExisting __total docs TK 2026: ${e.size}`);
  for (const d of e.docs) {
    const x = d.data();
    console.log(`  M${x.month}  ${x.saleName}  ${(x.revenue ?? 0).toLocaleString('vi-VN')}đ`);
  }
}
main().catch(console.error);
