import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  console.log('--- packageGroups TT ---');
  const g = await db.collection('packageGroups').where('branchId', '==', 'TT').get();
  for (const d of g.docs) {
    const x = d.data();
    console.log(`  ${d.id.padEnd(30)} name="${x.name}" type=${x.kind ?? x.type ?? '?'}`);
  }
  console.log('\n--- packages TT ---');
  const p = await db.collection('packages').where('branchId', '==', 'TT').get();
  for (const d of p.docs) {
    const x = d.data();
    console.log(`  ${d.id.padEnd(40)} name="${(x.name ?? '').padEnd(25)}" group=${x.groupId ?? '?'} price=${x.price ?? 0}`);
  }
  console.log('\n--- packageQuantities TT 2026 m1 (month 1 đã nhập) ---');
  const q = await db.collection('packageQuantities')
    .where('branchId', '==', 'TT')
    .where('year', '==', 2026)
    .where('month', '==', 1)
    .get();
  console.log(`Found ${q.size} docs`);
  for (const d of q.docs) {
    const x = d.data();
    console.log(`  pkg=${(x.packageId ?? '?').padEnd(40)} qty=${x.quantity ?? 0} revenue=${x.revenue ?? 0}`);
  }
  console.log('\n--- packageSales TT 2026 m1 sample ---');
  const s = await db.collection('packageSales')
    .where('branchId', '==', 'TT')
    .where('year', '==', 2026)
    .where('month', '==', 1)
    .limit(5)
    .get();
  console.log(`Found ${s.size} (limited 5)`);
  for (const d of s.docs) {
    const x = d.data();
    console.log(`  ${d.id}  data=${JSON.stringify(x)}`);
  }
}
main().catch(console.error);
