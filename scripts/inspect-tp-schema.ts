import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

async function main() {
  initAdmin();
  const db = getFirestore();

  // Inspect TP_KT schema (closest analog)
  const snap = await db.collection('users').where('roleId', '==', 'TP_KT').limit(1).get();
  console.log('=== TP_KT user schema (raw) ===');
  snap.forEach((d) => {
    console.log(`UID: ${d.id}`);
    console.log(JSON.stringify(d.data(), null, 2));
  });

  // Inspect TP_DT, TP_MKT để compare
  const tpdt = await db.collection('users').where('roleId', '==', 'TP_DT').limit(1).get();
  console.log('\n=== TP_DT user (compare) ===');
  tpdt.forEach((d) => {
    const x = d.data();
    console.log(`  branchId=${x.branchId} departmentId=${x.departmentId} blockId=${x.blockId} departmentName=${x.departmentName} branchName=${x.branchName}`);
  });

  const tpmkt = await db.collection('users').where('roleId', '==', 'TP_MKT').limit(1).get();
  console.log('\n=== TP_MKT user (compare) ===');
  tpmkt.forEach((d) => {
    const x = d.data();
    console.log(`  branchId=${x.branchId} departmentId=${x.departmentId} blockId=${x.blockId} departmentName=${x.departmentName} branchName=${x.branchName}`);
  });

  // List all departments
  console.log('\n=== /departments collection ===');
  const depts = await db.collection('departments').get();
  depts.forEach((d) => {
    const x = d.data();
    console.log(`  ${d.id} | name=${x.name} | block=${x.blockId || x.block}`);
  });

  // List blocks (if collection exists)
  console.log('\n=== Block info từ /blocks (nếu có) ===');
  const blocks = await db.collection('blocks').get();
  blocks.forEach((d) => {
    console.log(`  ${d.id} | ${JSON.stringify(d.data())}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
