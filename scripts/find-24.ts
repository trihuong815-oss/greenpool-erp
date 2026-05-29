import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  const s = await db.collection('users').where('roleId','==','NV_SALE').where('branchId','==','24').get();
  console.log(`24 NCT sales: ${s.size}`);
  for (const d of s.docs) {
    const x = d.data();
    console.log(`  uid=${d.id}  "${x.displayName}"  status=${x.status}`);
  }
  // Existing data 2026
  const e = await db.collection('packageSales').where('branchId','==','24').where('year','==',2026).where('packageId','==','__total').get();
  console.log(`\nExisting __total docs 24 2026: ${e.size}`);
  for (const d of e.docs) {
    const x = d.data();
    console.log(`  T${x.month} ${x.saleName} ${x.revenue?.toLocaleString('vi-VN')}đ`);
  }
}
main().catch(console.error);
