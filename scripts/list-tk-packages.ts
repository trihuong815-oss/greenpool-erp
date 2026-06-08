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

  // Packages của TK
  console.log('=== Packages TK ===');
  const pkgs = await db.collection('packages').where('branchId', '==', 'TK').get();
  const list = pkgs.docs.map((d) => ({ id: d.id, ...d.data() } as any));
  list.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  list.forEach((p) => {
    console.log(`  ${p.id} | groupId=${p.groupId} | name="${p.name}" | price=${p.defaultPrice} | active=${p.active} | sort=${p.sortOrder}`);
  });

  // Package groups
  console.log('\n=== Package groups (catalog) ===');
  const groups = await db.collection('packageGroups').get();
  groups.forEach((g) => {
    const x = g.data() as any;
    console.log(`  ${g.id} | name="${x.name}" | sort=${x.sortOrder}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
