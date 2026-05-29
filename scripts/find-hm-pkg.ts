import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  const g = await db.collection('packageGroups').where('branchId','==','HM').get();
  console.log(`--- HM groups (${g.size}) ---`);
  for (const d of g.docs) console.log(`  ${d.id.padEnd(28)} "${d.data().name}"`);
  const p = await db.collection('packages').where('branchId','==','HM').get();
  console.log(`\n--- HM packages (${p.size}) ---`);
  for (const d of p.docs) {
    const x = d.data();
    console.log(`  ${d.id.padEnd(28)} group=${(x.groupId ?? '').slice(0,12)}  name="${x.name?.trim()}"`);
  }
  // Existing data
  console.log(`\n--- Existing data HM 2026 ---`);
  const pq = await db.collection('packageQuantities').where('branchId','==','HM').where('year','==',2026).get();
  console.log(`packageQuantities: ${pq.size} docs`);
  const se = await db.collection('salesEntries').where('branchId','==','HM').where('year','==',2026).get();
  console.log(`salesEntries: ${se.size} docs`);
  const ps = await db.collection('packageSales').where('branchId','==','HM').where('year','==',2026).get();
  console.log(`packageSales: ${ps.size} docs`);
}
main().catch(console.error);
