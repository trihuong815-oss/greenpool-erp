// Seed 12 nhân sự phòng Kỹ thuật (Phase 5).
// Idempotent: skip user đã tồn tại theo email (chỉ update displayName + custom claims).
//
// DRY-RUN:  npx --yes tsx scripts/seed-tech-users.ts
// APPLY:    npx --yes tsx scripts/seed-tech-users.ts --apply
//
// Output: /tmp/seed-tech-users.csv (email + password tạm cho user MỚI)
// Email convention: {slugname}.{roleSuffix}@greenpool.vn
// Mật khẩu mặc định cho user mới: Greenpool@2026

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { existsSync, readFileSync, writeFileSync } from 'fs';
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

const BRANCH_NAME: Record<string, string> = {
  HM:  'Cơ sở Hoàng Mai',
  TK:  'Cơ sở 20 Thuỵ Khuê',
  CTT: 'Cơ sở Green Pool CTT Mỹ Đình',
  '24':'Cơ sở 24 Nguyễn Cơ Thạch',
  TT:  'Cơ sở Green Pool Thanh Trì',
};

interface SeedUser {
  name: string;
  roleId: string;       // role code trong Firestore
  branchId: string | null;
  /** Chỉ KT_XLN_CTT — bể phụ trách (Thân=['indoor'], Quân=['outdoor','kid']). */
  subAreas?: string[];
  note?: string;
}

// 12 user — phòng KT (theo list HR confirm 2026-05-27)
const USERS: SeedUser[] = [
  // Quản lý phòng (không gắn cơ sở)
  { name: 'Phạm Thanh Tùng',     roleId: 'TP_KT',  branchId: null, note: 'Trưởng phòng KT' },
  { name: 'Phan Văn Quyền',      roleId: 'PP_HT',  branchId: null, note: 'Phó phòng Hệ thống' },
  { name: 'Nguyễn Mạnh Phương',  roleId: 'PP_XLN', branchId: null, note: 'Phó phòng Xử lý nước' },

  // KTV cơ sở
  { name: 'Phạm Văn Nam',        roleId: 'KT_XLN_24NCT', branchId: '24' },
  { name: 'Nguyễn Đức Thân',     roleId: 'KT_XLN_CTT',   branchId: 'CTT', subAreas: ['indoor'], note: 'Phụ trách bể trong nhà' },
  { name: 'Lương Quốc Quân',     roleId: 'KT_XLN_CTT',   branchId: 'CTT', subAreas: ['outdoor', 'kid'], note: 'Phụ trách bể ngoài trời + bể vầy' },
  { name: 'Bùi Đình Lộc',        roleId: 'KT_HT_CTT',    branchId: 'CTT' },
  { name: 'Hoàng Mạnh Toàn',     roleId: 'KT_XLN_HM',    branchId: 'HM' },
  { name: 'Hoàng Đức Sơn',       roleId: 'KT_XLN_HM',    branchId: 'HM' },
  { name: 'Hoàng Văn Điệp',      roleId: 'KT_HT_HM',     branchId: 'HM' },
  { name: 'Ma Đình Tuất',        roleId: 'KT_HT_TT',     branchId: 'TT' },
  { name: 'Phạm Đình Công',      roleId: 'KT_HT_TT',     branchId: 'TT' },
];

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function buildEmail(name: string, roleId: string): string {
  // Suffix lấy phần cuối roleId để phân biệt user cùng tên: TP_KT/PP_HT/KT_XLN_HM/...
  const suffix = roleId.toLowerCase().replace(/_/g, '');
  return `${slugify(name)}.${suffix}@${EMAIL_DOMAIN}`;
}

interface Resolved extends SeedUser {
  email: string;
  password: string;
  branchName: string | null;
  roleData?: {
    tier: number;
    block_id: string;
    dept_id: string | null;
  };
}

async function loadRoleData(roleId: string): Promise<Resolved['roleData']> {
  const s = await db.collection('roles').doc(roleId).get();
  if (!s.exists) throw new Error(`Role không tồn tại: ${roleId}`);
  const d = s.data()!;
  return { tier: d.tier ?? 99, block_id: d.block_id ?? 'KD', dept_id: d.dept_id ?? null };
}

async function main() {
  console.log(`Seed tech users — mode: ${APPLY ? '🚀 APPLY' : '🧪 DRY-RUN'}`);
  console.log(`Tổng: ${USERS.length} users\n`);

  // Resolve email + role data trước
  const resolved: Resolved[] = [];
  for (const u of USERS) {
    const branchName = u.branchId ? (BRANCH_NAME[u.branchId] ?? u.branchId) : null;
    const roleData = await loadRoleData(u.roleId);
    resolved.push({
      ...u,
      email: buildEmail(u.name, u.roleId),
      password: DEFAULT_PASSWORD,
      branchName,
      roleData,
    });
  }

  // Check duplicate emails
  const emailCount: Record<string, number> = {};
  resolved.forEach((u) => { emailCount[u.email] = (emailCount[u.email] ?? 0) + 1; });
  const dups = Object.entries(emailCount).filter(([, n]) => n > 1);
  if (dups.length > 0) {
    console.error('⚠️ Email trùng:');
    dups.forEach(([e, n]) => console.error(`  ${e} × ${n}`));
    process.exit(1);
  }

  // Print table
  console.log('STT | Họ tên                  | Role         | Cơ sở | Email');
  console.log('────┼─────────────────────────┼──────────────┼───────┼──────────────────────────────────');
  resolved.forEach((u, i) => {
    console.log(`${String(i + 1).padStart(3)} | ${u.name.padEnd(23)} | ${u.roleId.padEnd(12)} | ${(u.branchId ?? '—').padEnd(5)} | ${u.email}`);
  });

  if (!APPLY) {
    console.log('\n⚠ DRY-RUN — chạy lại với --apply để tạo Firebase Auth + Firestore docs.');
    console.log(`   Password mặc định cho user MỚI: ${DEFAULT_PASSWORD}`);
    return;
  }

  console.log('\n🚀 APPLY — tạo Firebase Auth + Firestore docs…\n');
  let created = 0, skipped = 0, failed = 0;
  const csvRows: string[] = ['fullName,email,password,roleId,branchId,status'];

  for (const u of resolved) {
    try {
      let uid: string;
      let isNew = false;

      try {
        const existing = await auth.getUserByEmail(u.email);
        uid = existing.uid;
        await auth.updateUser(uid, { displayName: u.name });
        skipped++;
        console.log(`  ⊝ ${u.name.padEnd(24)} — đã tồn tại (uid=${uid.slice(0, 8)}…)`);
      } catch {
        const c = await auth.createUser({
          email: u.email,
          password: u.password,
          displayName: u.name,
          emailVerified: true,
        });
        uid = c.uid;
        isNew = true;
        created++;
        console.log(`  ✓ ${u.name.padEnd(24)} — TẠO MỚI (uid=${uid.slice(0, 8)}…)`);
      }

      // Custom claims (Firestore rules dùng nhanh)
      await auth.setCustomUserClaims(uid, {
        role: u.roleId,
        branchId: u.branchId,
        departmentId: u.roleData?.dept_id ?? null,
      });

      // Firestore users/{uid}
      const now = new Date();
      const userDoc: Record<string, unknown> = {
        email: u.email,
        displayName: u.name,
        roleId: u.roleId,
        branchId: u.branchId,
        branchName: u.branchName,
        departmentId: u.roleData?.dept_id ?? null,
        departmentName: u.roleData?.dept_id === 'KT' ? 'Phòng Kỹ thuật' : null,
        phone: null,
        status: 'active',
        isProbation: false,
        blockId: u.roleData?.block_id ?? 'KD',
        roleLevel: u.roleData?.tier ?? 6,
        subAreas: Array.isArray(u.subAreas) ? u.subAreas : [],
        updatedAt: now,
        updatedBy: 'seed-tech-users',
      };
      const ref = db.collection('users').doc(uid);
      const snap = await ref.get();
      if (!snap.exists) {
        userDoc.createdAt = now;
        userDoc.createdBy = 'seed-tech-users';
      }
      await ref.set(userDoc, { merge: true });

      csvRows.push([u.name, u.email, isNew ? u.password : '(đã có)', u.roleId, u.branchId ?? '', isNew ? 'CREATED' : 'EXISTING'].join(','));
    } catch (e: any) {
      failed++;
      console.error(`  ✗ ${u.name} — ${e?.message}`);
      csvRows.push([u.name, u.email, '', u.roleId, u.branchId ?? '', 'FAILED: ' + e?.message].join(','));
    }
  }

  const csvPath = '/tmp/seed-tech-users.csv';
  writeFileSync(csvPath, '﻿' + csvRows.join('\n'));

  console.log(`\n✓ Hoàn thành: ${created} tạo mới · ${skipped} đã tồn tại · ${failed} fail`);
  console.log(`📄 CSV: ${csvPath}`);
  if (created > 0) {
    console.log(`🔑 Mật khẩu mặc định cho user mới: ${DEFAULT_PASSWORD}`);
    console.log('   → Yêu cầu user đổi mật khẩu sau lần đăng nhập đầu.');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
