// Seed danh sách Sale + QLCS từ file Excel HR (May 2026).
// Idempotent: skip user đã tồn tại theo email.
//
// Chạy DRY-RUN (xem trước, không ghi):
//   npx --yes tsx scripts/seed-sales-users.ts
// Chạy APPLY (tạo thật):
//   npx --yes tsx scripts/seed-sales-users.ts --apply
//
// Output: /tmp/seed-sales-users.csv (chứa email + mật khẩu tạm)
// Email convention: {slugname}.{branchId}@greenpool.local
// Mật khẩu mặc định: Greenpool@2026 (user đổi sau khi đăng nhập lần đầu)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
}
const db = getFirestore();
const auth = getAuth();

const APPLY = process.argv.includes('--apply');
const DEFAULT_PASSWORD = 'Greenpool@2026';
const EMAIL_DOMAIN = 'greenpool.vn';

// Branch label → branchId mapping
const BRANCH_MAP: Record<string, { id: string; name: string }> = {
  'Thuy Khuê':                      { id: 'TK',  name: 'Cơ sở 20 Thụy Khuê' },
  'Thụy Khuê':                      { id: 'TK',  name: 'Cơ sở 20 Thụy Khuê' },
  'Hoàng Mai':                      { id: 'HM',  name: 'Cơ sở Hoàng Mai' },
  '24 NCT':                         { id: '24',  name: 'Cơ sở 24 Nguyễn Cơ Thạch' },
  'Cung Thể Thao Dưới nước':        { id: 'CTT', name: 'Cơ sở Green Pool CTT Mỹ Đình' },
  'Cung Thể thao dưới nước':        { id: 'CTT', name: 'Cơ sở Green Pool CTT Mỹ Đình' },
  'Thanh Trì':                      { id: 'TT',  name: 'Cơ sở Green Pool Thanh Trì' },
};

// Role → role code mapping (Firestore roles collection)
const ROLE_MAP_BY_BRANCH: Record<string, string> = {
  HM: 'QLCS_HM', TK: 'QLCS_TK', CTT: 'QLCS_CTT', '24': 'QLCS_24NCT', TT: 'QLCS_TT',
};

interface SourceUser {
  name: string;          // Họ và tên đầy đủ
  branchLabel: string;   // Cơ sở (raw từ excel)
  position: 'sale' | 'qlcs';
}

// ============================================================================
// DANH SÁCH USER (parsed từ ảnh HR cung cấp)
// ============================================================================
const USERS: SourceUser[] = [
  // 22 Sales
  { name: 'Đồng Thị Lan Hương',  branchLabel: 'Thuy Khuê',                position: 'sale' },
  { name: 'Nguyễn Thị Dung',     branchLabel: 'Thuy Khuê',                position: 'sale' },
  { name: 'Ngọc Thị Linh',       branchLabel: 'Hoàng Mai',                position: 'sale' },
  { name: 'Ngô Thị Hoa',         branchLabel: 'Hoàng Mai',                position: 'sale' },
  { name: 'Nguyễn Thị Thanh Huyền', branchLabel: '24 NCT',                position: 'sale' },
  { name: 'Nguyễn Thị Thúy',     branchLabel: 'Hoàng Mai',                position: 'sale' },
  { name: 'Nguyễn Thị Nhi',      branchLabel: 'Cung Thể Thao Dưới nước', position: 'sale' },
  { name: 'Phạm Quốc Anh',       branchLabel: 'Cung Thể Thao Dưới nước', position: 'sale' },
  { name: 'Nguyễn Thị Dung',     branchLabel: 'Cung Thể Thao Dưới nước', position: 'sale' },
  { name: 'Quán Thị Hồng',       branchLabel: 'Cung Thể Thao Dưới nước', position: 'sale' },
  { name: 'Đoàn Trung Kiên',     branchLabel: '24 NCT',                  position: 'sale' },
  { name: 'Nguyễn Thị Ngọc Thơm', branchLabel: 'Cung Thể Thao Dưới nước', position: 'sale' },
  { name: 'Đoàn Công Duy',       branchLabel: 'Hoàng Mai',                position: 'sale' },
  { name: 'Nông Thị Thanh Hương', branchLabel: '24 NCT',                  position: 'sale' },
  { name: 'Nguyễn Phương Nam',   branchLabel: 'Hoàng Mai',                position: 'sale' },
  { name: 'Nguyễn Thị Mai Anh',  branchLabel: 'Thanh Trì',                position: 'sale' },
  { name: 'Lê Nhật Linh',        branchLabel: 'Thanh Trì',                position: 'sale' },
  { name: 'Nguyễn Văn Quân',     branchLabel: 'Thuy Khuê',                position: 'sale' },
  { name: 'Đới Nhật Lương',      branchLabel: '24 NCT',                   position: 'sale' },
  { name: 'Nguyễn Hữu Quân',     branchLabel: 'Thanh Trì',                position: 'sale' },
  { name: 'Nguyễn Quỳnh Chi',    branchLabel: 'Thanh Trì',                position: 'sale' },
  { name: 'Vũ Thị Hương Giang',  branchLabel: 'Thanh Trì',                position: 'sale' },
  // 5 QLCS
  { name: 'Nguyễn Văn Núi',      branchLabel: 'Thanh Trì',                position: 'qlcs' },
  { name: 'Hà Văn Chiến',        branchLabel: 'Cung Thể Thao Dưới nước', position: 'qlcs' },
  { name: 'Hoàng Thị Bích Liên', branchLabel: 'Thuy Khuê',                position: 'qlcs' },
  { name: 'Nguyễn Xuân Trường',  branchLabel: 'Hoàng Mai',                position: 'qlcs' },
  { name: 'Hà Quốc Cường',       branchLabel: '24 NCT',                   position: 'qlcs' },
];

// ============================================================================
// HELPERS
// ============================================================================
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function resolveBranch(label: string): { id: string; name: string } {
  const b = BRANCH_MAP[label.trim()];
  if (!b) throw new Error(`Branch không xác định: "${label}"`);
  return b;
}

function buildEmail(name: string, branchId: string): string {
  return `${slugify(name)}.${branchId.toLowerCase()}@${EMAIL_DOMAIN}`;
}

interface ResolvedUser {
  fullName: string;
  email: string;
  password: string;
  branchId: string;
  branchName: string;
  roleId: string;
  position: 'sale' | 'qlcs';
}

function resolveUser(u: SourceUser): ResolvedUser {
  const branch = resolveBranch(u.branchLabel);
  const roleId = u.position === 'qlcs' ? ROLE_MAP_BY_BRANCH[branch.id] : 'NV_SALE';
  if (!roleId) throw new Error(`Không map được role cho ${u.name}`);
  return {
    fullName: u.name,
    email: buildEmail(u.name, branch.id),
    password: DEFAULT_PASSWORD,
    branchId: branch.id,
    branchName: branch.name,
    roleId,
    position: u.position,
  };
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log(`Seed Sales + QLCS users — mode: ${APPLY ? '🚀 APPLY' : '🧪 DRY-RUN'}`);
  console.log(`Tổng: ${USERS.length} users (${USERS.filter((u) => u.position === 'sale').length} sale + ${USERS.filter((u) => u.position === 'qlcs').length} QLCS)\n`);

  const resolved = USERS.map(resolveUser);

  // Check duplicate emails
  const emailCount: Record<string, number> = {};
  resolved.forEach((u) => { emailCount[u.email] = (emailCount[u.email] ?? 0) + 1; });
  const dups = Object.entries(emailCount).filter(([, n]) => n > 1);
  if (dups.length > 0) {
    console.error('⚠️ Email trùng (cần đổi name khác cách):');
    dups.forEach(([e, n]) => console.error(`  ${e} × ${n}`));
    process.exit(1);
  }

  // Print table
  console.log('STT | Họ tên                       | Cơ sở | Role        | Email');
  console.log('────┼───────────────────────────────┼───────┼─────────────┼─────────────────────────────────');
  resolved.forEach((u, i) => {
    console.log(`${String(i + 1).padStart(3)} | ${u.fullName.padEnd(29)} | ${u.branchId.padEnd(5)} | ${u.roleId.padEnd(11)} | ${u.email}`);
  });

  if (!APPLY) {
    console.log('\n⚠ DRY-RUN — chạy lại với --apply để tạo thật.');
    console.log(`   Mật khẩu mặc định: ${DEFAULT_PASSWORD}`);
    console.log(`   CSV sẽ ghi vào /tmp/seed-sales-users.csv khi apply.`);
    return;
  }

  console.log('\n🚀 APPLY — tạo Firebase Auth + Firestore docs…\n');
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const csvRows: string[] = ['fullName,email,password,branchId,roleId,status'];

  for (const u of resolved) {
    try {
      let uid: string;
      let isNew = false;
      try {
        const existing = await auth.getUserByEmail(u.email);
        uid = existing.uid;
        await auth.updateUser(uid, { displayName: u.fullName });
        skipped++;
        console.log(`  ⊝ ${u.fullName.padEnd(28)} — đã tồn tại (uid=${uid.slice(0, 8)}…)`);
      } catch {
        const c = await auth.createUser({
          email: u.email,
          password: u.password,
          displayName: u.fullName,
          emailVerified: true,
        });
        uid = c.uid;
        isNew = true;
        created++;
        console.log(`  ✓ ${u.fullName.padEnd(28)} — TẠO MỚI (uid=${uid.slice(0, 8)}…)`);
      }

      // Custom claims (để rules dùng nhanh)
      await auth.setCustomUserClaims(uid, {
        role: u.roleId,
        branchId: u.branchId,
        departmentId: null,
      });

      // Firestore users/{uid}
      const now = new Date();
      const userDoc: Record<string, unknown> = {
        email: u.email,
        displayName: u.fullName,
        roleId: u.roleId,
        branchId: u.branchId,
        branchName: u.branchName,
        departmentId: null,
        departmentName: null,
        phone: null,
        status: 'active',
        isProbation: false,
        blockId: 'KD',
        roleLevel: u.position === 'qlcs' ? 2 : 5,
        updatedAt: now,
        updatedBy: 'seed-script',
      };
      const ref = db.collection('users').doc(uid);
      const snap = await ref.get();
      if (!snap.exists) {
        userDoc.createdAt = now;
        userDoc.createdBy = 'seed-script';
      }
      await ref.set(userDoc, { merge: true });

      csvRows.push([u.fullName, u.email, isNew ? u.password : '(đã có)', u.branchId, u.roleId, isNew ? 'CREATED' : 'EXISTING'].join(','));
    } catch (e: any) {
      failed++;
      console.error(`  ✗ ${u.fullName} — ${e?.message}`);
      csvRows.push([u.fullName, u.email, '', u.branchId, u.roleId, 'FAILED: ' + e?.message].join(','));
    }
  }

  // Write CSV
  const csvPath = '/tmp/seed-sales-users.csv';
  writeFileSync(csvPath, '' + csvRows.join('\n'));

  console.log(`\n✓ Hoàn thành: ${created} tạo mới · ${skipped} đã tồn tại · ${failed} fail`);
  console.log(`📄 CSV: ${csvPath}`);
  if (created > 0) {
    console.log(`🔑 Mật khẩu mặc định cho user mới: ${DEFAULT_PASSWORD}`);
    console.log('   → Yêu cầu user đổi mật khẩu sau lần đăng nhập đầu.');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
