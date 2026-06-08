// Check 3 TP khối Văn phòng: Kế toán, Nhân sự, Giám sát.

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

  // 1. Find by name candidates
  const candidates = ['Nguyễn Thị Hương', 'Hà Như Quỳnh', 'Đào Thị Phượng'];
  console.log('=== Tìm theo displayName ===');
  for (const name of candidates) {
    const all = await db.collection('users').get();
    const matches = all.docs.filter((d) => {
      const dn = (d.data().displayName || '') as string;
      return dn.toLowerCase().includes(name.toLowerCase())
        || dn.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
           .includes(name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
    });
    console.log(`\n"${name}" → ${matches.length} match`);
    matches.forEach((d) => {
      const x = d.data();
      console.log(`  ${d.id} | ${x.email} | ${x.displayName} | roleId=${x.roleId} | status=${x.status}`);
    });
  }

  // 2. Find all TP_* roles (any)
  console.log('\n=== Tất cả TP_* roles có trong system ===');
  const allUsers = await db.collection('users').get();
  const tpUsers = allUsers.docs.filter((d) => {
    const r = (d.data().roleId || '') as string;
    return r.startsWith('TP_') || r === 'TIBAN_TT';
  });
  tpUsers.forEach((d) => {
    const x = d.data();
    console.log(`  ${x.roleId} | ${x.email} | ${x.displayName} | status=${x.status}`);
  });

  // 3. Check roles registry
  console.log('\n=== Distinct roleId all users ===');
  const roles = new Set<string>();
  allUsers.forEach((d) => {
    const r = d.data().roleId;
    if (r) roles.add(String(r));
  });
  console.log(`Found: ${[...roles].sort().join(', ')}`);
  console.log(`\nTP_KE present: ${roles.has('TP_KE')}`);
  console.log(`TP_NS present: ${roles.has('TP_NS')}`);
  console.log(`TP_GS present: ${roles.has('TP_GS')}`);

  // 4. Check roles collection (registry doc)
  console.log('\n=== Roles registry collection ===');
  const rolesCol = await db.collection('roles').get();
  rolesCol.forEach((d) => {
    const x = d.data();
    console.log(`  ${d.id} | name=${x.name} | block=${x.block || x.blockId} | level=${x.level || x.roleLevel}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
