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

  // 1. Lấy 1 doc sales mẫu (bất kỳ branch nào) để xem schema
  console.log('=== Sample doc sales (1 doc bất kỳ) ===');
  const sample = await db.collection('sales').limit(1).get();
  sample.forEach((d) => {
    console.log(`Doc ID: ${d.id}`);
    console.log(JSON.stringify(d.data(), null, 2));
  });

  // 2. Tìm doc cho TK tháng 5/2026
  console.log('\n=== TK tháng 5/2026 (nếu có) ===');
  const tk5 = await db.collection('sales')
    .where('branchId', '==', 'TK')
    .where('year', '==', 2026)
    .where('month', '==', 5)
    .get();
  console.log(`Found ${tk5.size} docs`);
  tk5.forEach((d) => {
    console.log(`Doc ID: ${d.id}`);
    console.log(JSON.stringify(d.data(), null, 2));
  });

  // 3. List 3 sale TK
  console.log('\n=== TK sales users (NV_SALE + NV_SALE_PT) ===');
  const sales = await db.collection('users')
    .where('branchId', '==', 'TK')
    .where('status', '==', 'active')
    .get();
  sales.forEach((d) => {
    const x = d.data();
    if (x.roleId === 'NV_SALE' || x.roleId === 'NV_SALE_PT') {
      console.log(`  ${d.id} | ${x.displayName} | ${x.roleId} | ${x.email}`);
    }
  });

  // 4. List packages của TK (nếu có collection settingsPackages/branches)
  console.log('\n=== Packages config (any collection có) ===');
  const colls = ['salesPackages', 'packages', 'settingsPackages'];
  for (const c of colls) {
    try {
      const snap = await db.collection(c).limit(5).get();
      if (snap.size > 0) {
        console.log(`Collection ${c}: ${snap.size} docs`);
        snap.forEach((d) => console.log(`  ${d.id}: ${JSON.stringify(d.data())}`));
      }
    } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
