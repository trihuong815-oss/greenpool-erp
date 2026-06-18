// Inspect 1 vài user docs để xem field names thực tế trong Firestore.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();

async function main() {
  console.log('━━━ INSPECT USERS SCHEMA ━━━\n');

  // Get first 5 users để xem field names
  const snap = await db.collection('users').limit(5).get();
  console.log(`Sample ${snap.size} users:\n`);
  snap.forEach((d) => {
    const data = d.data();
    console.log(`  [${d.id}] keys: ${Object.keys(data).sort().join(', ')}`);
    console.log(`     possible role fields: role_code=${data.role_code} | roleCode=${data.roleCode} | role=${data.role}`);
    console.log(`     active fields: is_active=${data.is_active} | isActive=${data.isActive} | status=${data.status}`);
    console.log();
  });

  // Tìm bằng nhiều variant role field name
  console.log('━━━ Search by role variants ━━━');
  for (const fieldName of ['roleId', 'role_code', 'roleCode', 'role']) {
    for (const value of ['GD_KD', 'GD_VP']) {
      try {
        const s = await db.collection('users').where(fieldName, '==', value).limit(5).get();
        if (s.size > 0) {
          console.log(`  WHERE ${fieldName} == '${value}' → ${s.size} matches`);
          s.forEach((d) => {
            const data = d.data();
            console.log(`     - id=${d.id} email=${data.email} status=${data.status} displayName=${data.displayName}`);
          });
        }
      } catch (e: any) {
        console.log(`  WHERE ${fieldName} == '${value}' → ERROR: ${e.message}`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
