import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  const snap = await db.collection('users').get();
  for (const d of snap.docs) {
    const x = d.data();
    const n = (x.displayName ?? '').toLowerCase();
    if (n.includes('tuất') || n.includes('tuat')) {
      console.log(`uid=${d.id}`);
      console.log(`  name="${x.displayName}" status=${x.status}`);
      console.log(`  roleId=${x.roleId} branchId=${x.branchId} departmentId=${x.departmentId}`);
      console.log(`  subAreas=${JSON.stringify(x.subAreas)}`);
    }
  }
}
main().catch(console.error);
