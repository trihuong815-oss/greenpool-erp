// One-off: list packages + packageGroups của cơ sở 24 để xác định IDs cần dùng.
// Run: GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/find-24-packages.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();

async function main() {
  console.log('━━━ Package Groups (branch=24) ━━━');
  const gSnap = await db.collection('packageGroups').where('branchId', '==', '24').get();
  for (const d of gSnap.docs) {
    const x = d.data();
    console.log(`  ${d.id} | name="${x.name}" | active=${x.active ?? true}`);
  }
  console.log(`Tổng: ${gSnap.size} groups\n`);

  console.log('━━━ Packages (branch=24) ━━━');
  const pSnap = await db.collection('packages').where('branchId', '==', '24').get();
  for (const d of pSnap.docs) {
    const x = d.data();
    console.log(`  ${d.id} | group=${x.groupId} | "${x.name}" | active=${x.active ?? true}`);
  }
  console.log(`Tổng: ${pSnap.size} packages`);
}
main().catch(console.error);
