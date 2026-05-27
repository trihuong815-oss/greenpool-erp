// Phase 4.B — Migrate `profiles` → `users` với schema chuẩn:
//   users/{uid} {
//     email, displayName, roleId, departmentId, branchId, status,
//     phone, shiftAssignment, isSharedShiftAccount,
//     createdAt, updatedAt, createdBy, updatedBy,
//     migrationVersion, migratedAt, migratedBy, sourceCollection
//   }
//
// Doc ID = uid (đã match Firebase Auth do Phase 4.A giữ nguyên).
// Field rename map:
//   role_code     → roleId
//   facility_id   → branchId
//   department_id → departmentId
//   full_name     → displayName
//   active=true   → status='active', false → status='inactive'
//   shift_assignment + is_shared_shift_account → giữ camelCase
//
// Idempotent: skip nếu users/{uid} đã tồn tại.
// Mặc định DRY-RUN. --apply để ghi thật.
//
// KHÔNG XÓA `profiles` collection — Phase 5 mới drop.
//
// Chạy:
//   npx --yes tsx scripts/migrate-profiles-to-users.ts
//   npx --yes tsx scripts/migrate-profiles-to-users.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const APPLY = process.argv.includes('--apply');
const MIGRATION_VERSION = '4.0.0';
const MIGRATED_AT = new Date();
const MIGRATED_BY = 'system';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

async function main() {
  console.log(`=== Phase 4.B — Migrate profiles → users ===`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const profSnap = await db.collection('profiles').get();
  console.log(`Có ${profSnap.size} profile.\n`);

  let copied = 0, exists = 0, skipped = 0;
  for (const d of profSnap.docs) {
    const p = d.data();
    const uid = d.id;
    const usersRef = db.collection('users').doc(uid);

    const existingSnap = await usersRef.get();
    if (existingSnap.exists) {
      exists++;
      console.log(`  ~ skip ${uid.slice(0,8)} ${p.email ?? '(no email)'} — users/${uid} đã tồn tại`);
      continue;
    }

    if (!p.email) {
      skipped++;
      console.log(`  ✗ skip ${uid.slice(0,8)} — không có email`);
      continue;
    }

    const status: string = p.active === false ? 'inactive' : (p.status ?? 'active');

    const userDoc = {
      email: p.email,
      displayName: p.full_name ?? '',
      roleId: p.role_code ?? null,
      branchId: p.facility_id ?? null,
      departmentId: p.department_id ?? null,
      status,
      phone: p.phone ?? null,
      shiftAssignment: p.shift_assignment ?? null,
      isSharedShiftAccount: !!p.is_shared_shift_account,
      // Cosmetic denorm (read-only convenience):
      branchName: p.facility_name ?? null,
      departmentName: p.department_name ?? null,
      blockId: p.block_id ?? null,
      blockName: p.block_name ?? null,
      avatarUrl: p.avatar_url ?? null,
      isProbation: !!p.is_probation,
      roleLevel: p.role_level ?? null,
      // Audit metadata:
      createdAt: MIGRATED_AT,
      updatedAt: MIGRATED_AT,
      createdBy: MIGRATED_BY,
      updatedBy: MIGRATED_BY,
      // Migration metadata theo spec:
      migrationVersion: MIGRATION_VERSION,
      migratedAt: MIGRATED_AT,
      migratedBy: MIGRATED_BY,
      sourceCollection: 'profiles',
    };

    console.log(`  + ${uid.slice(0,8)} ${p.email.padEnd(40)} role=${userDoc.roleId} branch=${userDoc.branchId} status=${status}`);
    if (APPLY) await usersRef.set(userDoc);
    copied++;
  }

  console.log(`\nKết quả: copied=${copied}  exists=${exists}  skipped=${skipped}`);
  if (!APPLY) console.log(`→ Dry-run xong. Re-run với --apply để ghi thật.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('LỖI:', e); process.exit(1); });
