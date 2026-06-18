// Quick audit: find users with role GD_KD / GD_VP — debug buildApproverChain failure.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();

async function main() {
  console.log('━━━ AUDIT GD_KD / GD_VP USERS ━━━\n');

  const snap = await db.collection('users')
    .where('role_code', 'in', ['GD_KD', 'GD_VP'])
    .get();

  console.log(`Tìm thấy ${snap.size} user với role_code in [GD_KD, GD_VP]:\n`);

  snap.forEach((d) => {
    const data = d.data();
    console.log(`  [${d.id}]`);
    console.log(`     role_code = ${data.role_code}`);
    console.log(`     is_active = ${data.is_active} (type=${typeof data.is_active})`);
    console.log(`     status = ${data.status} (type=${typeof data.status})`);
    console.log(`     excludeFromBusinessNoti = ${data.excludeFromBusinessNoti}`);
    console.log(`     uid = ${data.uid ?? '(missing)'}`);
    console.log(`     display_name = ${JSON.stringify(data.display_name)}`);
    console.log(`     full_name = ${JSON.stringify(data.full_name)}`);
    console.log(`     displayName = ${JSON.stringify(data.displayName)}`);
    console.log(`     email = ${JSON.stringify(data.email)}`);
    console.log(`     facility_id = ${data.facility_id}`);
    console.log();
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Áp dụng filter HIỆN TẠI của buildApproverChain:');
  console.log('  - is_active === false → reject');
  console.log('  - excludeFromBusinessNoti === true → reject');
  let pass = 0;
  snap.forEach((d) => {
    const data = d.data();
    if (data.is_active === false) return;
    if (data.excludeFromBusinessNoti === true) return;
    pass++;
  });
  console.log(`→ ${pass}/${snap.size} pass filter`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
