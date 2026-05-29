import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  const g = await db.collection('packageGroups').where('branchId', '==', 'TK').get();
  console.log('--- TK groups ---');
  for (const d of g.docs) console.log(`  ${d.id.padEnd(28)} ${d.data().name}`);

  const p = await db.collection('packages').where('branchId', '==', 'TK').get();
  console.log(`\n--- TK packages (${p.size}) ---`);
  for (const d of p.docs) {
    const x = d.data();
    console.log(`  ${d.id.padEnd(28)} group=${(x.groupId ?? '').slice(0,20).padEnd(22)} name="${x.name?.trim()}"`);
  }

  const q = await db.collection('packageQuantities').where('branchId', '==', 'TK').where('year', '==', 2026).get();
  console.log(`\n--- TK packageQuantities 2026: ${q.size} existing docs ---`);
  for (const d of q.docs) {
    const x = d.data();
    console.log(`  T${x.month} pkg=${x.packageId} qty=${x.quantity} rev=${x.revenue?.toLocaleString('vi-VN')}`);
  }
}
main().catch(console.error);
