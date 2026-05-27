// Seed role 'ADMIN' (super-admin, tier 0) — vai trò quản trị viên hệ thống.
// Idempotent: set({merge:true}).
//
// DRY-RUN:  npx --yes tsx scripts/seed-admin-role.ts
// APPLY:    npx --yes tsx scripts/seed-admin-role.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Missing GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) initializeApp({
  credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
});
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const ADMIN_ROLE = {
  code: 'ADMIN',
  name: 'Quản trị viên hệ thống',
  tier: 0,                   // Trên CEO (tier 1) — super-admin IT
  block_id: 'all',
  dept_id: null,
  facility_id: null,
  is_qlcs: false,
  is_tp: false,
  parent_role: null,
  description: 'Vai trò quản trị hệ thống — toàn quyền bypass mọi scope check. Dùng cho IT/admin.',
};

async function main() {
  console.log(`Seed role ADMIN — mode: ${APPLY ? '🚀 APPLY' : '🧪 DRY-RUN'}`);
  const existing = await db.collection('roles').doc('ADMIN').get();
  console.log(`Current: ${existing.exists ? '⊝ EXISTS (will merge)' : '✓ NEW'}`);
  console.log('Schema:', JSON.stringify(ADMIN_ROLE, null, 2));

  if (!APPLY) {
    console.log('\n⚠ DRY-RUN — chạy lại với --apply để ghi Firestore.');
    return;
  }

  await db.collection('roles').doc('ADMIN').set(ADMIN_ROLE, { merge: true });
  console.log('\n✓ Role ADMIN đã ghi vào Firestore.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
