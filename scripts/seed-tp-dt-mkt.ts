// Seed 2 Trưởng phòng (Đào tạo + Marketing) — user chốt 2026-05-30.
// Pattern theo scripts/seed-tech-users.ts (idempotent, có DRY-RUN).
//
// DRY-RUN:  GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/seed-tp-dt-mkt.ts
// APPLY:    GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/seed-tp-dt-mkt.ts --apply

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

interface SeedUser { name: string; roleId: string; }
const USERS: SeedUser[] = [
  { name: 'Nguyễn Văn Sang', roleId: 'TP_DT' },   // TP Đào tạo
  { name: 'Vũ Hải Hà',       roleId: 'TP_MKT' },  // TP Marketing
];

function slugify(name: string): string {
  return name
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
}
function buildEmail(name: string, roleId: string): string {
  return `${slugify(name)}.${roleId.toLowerCase().replace(/_/g, '')}@${EMAIL_DOMAIN}`;
}

async function loadRoleData(roleId: string) {
  const s = await db.collection('roles').doc(roleId).get();
  if (!s.exists) throw new Error(`Role không tồn tại: ${roleId}`);
  const d = s.data()!;
  return { tier: d.tier ?? 6, block_id: d.block_id ?? 'KD', dept_id: d.dept_id ?? null };
}

async function loadDeptName(deptId: string | null): Promise<string | null> {
  if (!deptId) return null;
  const s = await db.collection('departments').doc(deptId).get();
  return s.exists ? (s.data()?.name ?? deptId) : deptId;
}

async function main() {
  console.log(`Seed TP_DT + TP_MKT — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
  for (const u of USERS) {
    const email = buildEmail(u.name, u.roleId);
    const roleData = await loadRoleData(u.roleId);
    const deptName = await loadDeptName(roleData.dept_id);
    console.log(`  • ${u.name} | ${u.roleId} | dept=${roleData.dept_id ?? '—'} (${deptName ?? '—'}) | email=${email}`);
  }
  if (!APPLY) {
    console.log(`\nDRY-RUN — chạy lại với --apply để tạo thật.`);
    console.log(`Password mặc định: ${DEFAULT_PASSWORD}`);
    return;
  }

  console.log('\nAPPLY — tạo Firebase Auth + Firestore docs…\n');
  let created = 0, skipped = 0, failed = 0;
  for (const u of USERS) {
    try {
      const email = buildEmail(u.name, u.roleId);
      const roleData = await loadRoleData(u.roleId);
      const deptName = await loadDeptName(roleData.dept_id);

      let uid: string;
      let isNew = false;
      try {
        const existing = await auth.getUserByEmail(email);
        uid = existing.uid;
        await auth.updateUser(uid, { displayName: u.name });
        skipped++;
        console.log(`  ⊝ ${u.name} — đã tồn tại (uid=${uid.slice(0, 8)}…)`);
      } catch {
        const c = await auth.createUser({
          email, password: DEFAULT_PASSWORD, displayName: u.name, emailVerified: true,
        });
        uid = c.uid;
        isNew = true;
        created++;
        console.log(`  ✓ ${u.name} — TẠO MỚI (uid=${uid.slice(0, 8)}…) password=${DEFAULT_PASSWORD}`);
      }
      await auth.setCustomUserClaims(uid, {
        role: u.roleId,
        branchId: null,
        departmentId: roleData.dept_id ?? null,
      });

      const now = new Date();
      const userDoc: Record<string, unknown> = {
        email,
        displayName: u.name,
        roleId: u.roleId,
        branchId: null,
        branchName: null,
        departmentId: roleData.dept_id ?? null,
        departmentName: deptName,
        phone: null,
        status: 'active',
        isProbation: false,
        blockId: roleData.block_id ?? 'KD',
        roleLevel: roleData.tier ?? 6,
        subAreas: [],
        updatedAt: now,
        updatedBy: 'seed-tp-dt-mkt',
      };
      const ref = db.collection('users').doc(uid);
      const snap = await ref.get();
      if (!snap.exists) {
        userDoc.createdAt = now;
        userDoc.createdBy = 'seed-tp-dt-mkt';
      }
      await ref.set(userDoc, { merge: true });
      if (isNew) {
        console.log(`     → Firestore users/${uid.slice(0, 8)}… đã tạo (dept=${deptName})`);
      }
    } catch (e: any) {
      failed++;
      console.error(`  ✗ ${u.name} — ${e?.message}`);
    }
  }
  console.log(`\nKết quả: ${created} tạo mới · ${skipped} đã tồn tại · ${failed} fail`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
