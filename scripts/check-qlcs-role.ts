import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // Tìm tất cả user có roleId chứa QLCS
  const u = await db.collection('users').get();
  console.log('═══ Users có roleId QLCS* ═══');
  for (const d of u.docs) {
    const x = d.data();
    const r = x.roleId ?? '';
    if (r.includes('QLCS')) {
      console.log(`  uid=${d.id}`);
      console.log(`    name="${x.displayName}"  email=${x.email}`);
      console.log(`    roleId="${r}"  status=${x.status}`);
      console.log(`    branchId=${x.branchId}  departmentId=${x.departmentId}`);
    }
  }
}
main().catch(console.error);
