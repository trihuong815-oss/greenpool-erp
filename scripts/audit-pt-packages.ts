// Quick audit: list tất cả packages có name chứa "PT" để xem có đúng được mark
// isCustomQuantity=true trong Firestore hay không (debug user can't input qty/up).

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();

async function main() {
  console.log('━━━ AUDIT PT PACKAGES ━━━\n');
  const snap = await db.collection('packages').get();
  console.log(`Total packages: ${snap.size}\n`);

  const ptCandidates: Array<{ id: string; data: Record<string, any> }> = [];
  const customQty: Array<{ id: string; data: Record<string, any> }> = [];

  snap.forEach((d) => {
    const data = d.data();
    const name = String(data.name ?? '');
    const isPT = /\bPT\b|pt\b|gym\s*pt|bơi\s*pt/i.test(name);
    if (isPT) ptCandidates.push({ id: d.id, data });
    if (data.isCustomQuantity === true) customQty.push({ id: d.id, data });
  });

  console.log(`Có ${ptCandidates.length} gói tên chứa "PT/GYM/bơi":\n`);
  ptCandidates.forEach(({ id, data }) => {
    console.log(`  [${id}] "${data.name}"`);
    console.log(`     branchId=${data.branchId} active=${data.active}`);
    console.log(`     isCustomQuantity=${data.isCustomQuantity} (type=${typeof data.isCustomQuantity})`);
    console.log(`     unitName=${JSON.stringify(data.unitName)}`);
    console.log(`     defaultUnitPrice=${data.defaultUnitPrice}`);
    console.log(`     defaultPrice=${data.defaultPrice}`);
    console.log();
  });

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Có ${customQty.length} gói có isCustomQuantity=true:\n`);
  customQty.forEach(({ id, data }) => {
    console.log(`  [${id}] "${data.name}" — branch=${data.branchId} active=${data.active}`);
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
