// Seed role NV_SALE_PT + 6 nhân viên Sale PT (cơ sở 24 NCT) — user chốt 2026-05-30.
// Pattern theo scripts/seed-tech-users.ts. Idempotent.
//
// DRY-RUN:  GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/seed-sale-pt-24nct.ts
// APPLY:    GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/seed-sale-pt-24nct.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) initializeApp({
  credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
});
const db = getFirestore();
const auth = getAuth();

const APPLY = process.argv.includes('--apply');
const DEFAULT_PASSWORD = 'Greenpool@2026';
const EMAIL_DOMAIN = 'greenpool.vn';
const BRANCH_ID = '24';
const BRANCH_NAME = 'Cơ sở 24 Nguyễn Cơ Thạch';

// 6 Sale PT của cơ sở 24 (anh cung cấp 2026-05-30)
const PT_USERS = [
  'Lò Thị Thới',
  'Trần Thanh Tài',
  'Nguyễn Hồng Nhung',
  'Bùi Văn Hoạt',
  'Hoàng Hồng Phúc',
  'Nguyễn Hải Long',
];

function slugify(name: string): string {
  return name
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
}

// Email convention cho Sale PT: {slug}.24.pt@greenpool.vn (tránh trùng với NV_SALE thường)
function buildEmail(name: string): string {
  return `${slugify(name)}.24.pt@${EMAIL_DOMAIN}`;
}

async function ensureRoleDoc() {
  const ref = db.collection('roles').doc('NV_SALE_PT');
  const snap = await ref.get();
  if (snap.exists) {
    console.log(`  ⊝ role NV_SALE_PT đã tồn tại`);
    return;
  }
  if (!APPLY) {
    console.log(`  • role NV_SALE_PT SẼ TẠO`);
    return;
  }
  // Mirror schema của NV_SALE
  const nvSale = await db.collection('roles').doc('NV_SALE').get();
  const ns = nvSale.exists ? nvSale.data() ?? {} : {};
  await ref.set({
    code: 'NV_SALE_PT',
    name: 'Sale PT Gym',
    name_full: 'Nhân viên Sale gói dạy PT Gym (chỉ cơ sở 24 NCT)',
    tier: ns.tier ?? 8,
    block_id: 'KD',
    dept_id: null,
    parent_role: 'QLCS_24NCT',
    is_cross_branch: true,
    description: 'Sale gói dịch vụ dạy PT Gym. Chỉ áp dụng cho cơ sở 24 NCT.',
    createdAt: new Date(),
    createdBy: 'seed-sale-pt-24nct',
  });
  console.log(`  ✓ role NV_SALE_PT TẠO MỚI`);
}

async function main() {
  console.log(`Seed NV_SALE_PT + 6 user — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  console.log('Bước 1 — Role doc:');
  await ensureRoleDoc();

  console.log('\nBước 2 — Users:');
  for (const name of PT_USERS) {
    const email = buildEmail(name);
    console.log(`  • ${name.padEnd(22)} | NV_SALE_PT | ${email}`);
  }
  if (!APPLY) {
    console.log(`\nDRY-RUN — chạy lại với --apply để tạo thật.`);
    console.log(`Password mặc định: ${DEFAULT_PASSWORD}`);
    return;
  }

  console.log('\nAPPLY — tạo Firebase Auth + Firestore docs…\n');
  let created = 0, skipped = 0, failed = 0;
  for (const name of PT_USERS) {
    try {
      const email = buildEmail(name);
      let uid: string;
      let isNew = false;
      try {
        const existing = await auth.getUserByEmail(email);
        uid = existing.uid;
        await auth.updateUser(uid, { displayName: name });
        skipped++;
        console.log(`  ⊝ ${name.padEnd(22)} — đã tồn tại (uid=${uid.slice(0, 8)}…)`);
      } catch {
        const c = await auth.createUser({
          email, password: DEFAULT_PASSWORD, displayName: name, emailVerified: true,
        });
        uid = c.uid;
        isNew = true;
        created++;
        console.log(`  ✓ ${name.padEnd(22)} — TẠO MỚI (uid=${uid.slice(0, 8)}…) password=${DEFAULT_PASSWORD}`);
      }
      await auth.setCustomUserClaims(uid, {
        role: 'NV_SALE_PT',
        branchId: BRANCH_ID,
        departmentId: null,
      });

      const now = new Date();
      const userDoc: Record<string, unknown> = {
        email,
        displayName: name,
        roleId: 'NV_SALE_PT',
        branchId: BRANCH_ID,
        branchName: BRANCH_NAME,
        departmentId: null,
        departmentName: null,
        phone: null,
        status: 'active',
        isProbation: false,
        blockId: 'KD',
        roleLevel: 8,
        subAreas: [],
        updatedAt: now,
        updatedBy: 'seed-sale-pt-24nct',
      };
      const ref = db.collection('users').doc(uid);
      const snap = await ref.get();
      if (!snap.exists) {
        userDoc.createdAt = now;
        userDoc.createdBy = 'seed-sale-pt-24nct';
      }
      await ref.set(userDoc, { merge: true });
      if (isNew) console.log(`     → Firestore users/${uid.slice(0, 8)}… đã tạo`);
    } catch (e: any) {
      failed++;
      console.error(`  ✗ ${name} — ${e?.message}`);
    }
  }
  console.log(`\nKết quả users: ${created} tạo mới · ${skipped} đã tồn tại · ${failed} fail`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
