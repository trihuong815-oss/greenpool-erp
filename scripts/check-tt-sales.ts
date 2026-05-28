import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  const snap = await db.collection('users')
    .where('roleId', '==', 'NV_SALE')
    .where('branchId', '==', 'TT')
    .get();
  console.log(`Thanh Trì sales: ${snap.size}`);
  for (const d of snap.docs) {
    const x = d.data();
    console.log(`  ${(x.displayName ?? d.id).padEnd(25)}  status=${x.status ?? '?'}  uid=${d.id}`);
  }
  // Check existing salesEntries Jan-Apr 2026 TT
  console.log('\n--- Existing salesEntries TT 2026 Jan-Apr ---');
  const e = await db.collection('salesEntries')
    .where('branchId', '==', 'TT')
    .where('year', '==', 2026)
    .get();
  for (const d of e.docs) {
    const x = d.data();
    if (x.month >= 1 && x.month <= 4) {
      console.log(`  ${x.month}/${x.year}  ${(x.saleName ?? '?').padEnd(20)}  src=${(x.source ?? '?').padEnd(10)}  leads=${x.leads ?? 0} closed=${x.closed ?? 0}`);
    }
  }
}
main().catch(console.error);
