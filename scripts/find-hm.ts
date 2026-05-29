import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // List all HM sales
  const s = await db.collection('users').where('roleId', '==', 'NV_SALE').where('branchId', '==', 'HM').get();
  console.log(`HM sales: ${s.size}`);
  for (const d of s.docs) {
    const x = d.data();
    console.log(`  uid=${d.id}  "${x.displayName}"  status=${x.status}`);
  }
  // Existing data
  const e = await db.collection('packageSales').where('branchId','==','HM').where('year','==',2026).where('packageId','==','__total').get();
  console.log(`\nExisting __total HM 2026: ${e.size}`);
}
main().catch(console.error);
