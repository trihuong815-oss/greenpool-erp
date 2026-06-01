// Import data cơ sở CTT (Cung Thể Thao Mỹ Đình) T1-T4/2026.
// 3 bảng anh gửi 2026-06-01:
//   1. Doanh số theo gói dịch vụ (HỌC BƠI / TRONG NHÀ / NGOÀI TRỜI / DOANH THU KHÁC)
//   2. Nguồn khách hàng T1-T5 (FACE/WALK-IN/HOTLINE/RENEW/REFER/ĐI THỊ TRƯỜNG)
//   3. Sale: 5 NV_SALE Member (Nhi/Hồng/Thơm/Dung/Quốc Anh)
//
// Quyết định mapping (anh chốt 2026-06-01):
//   - HBCLC = chất lượng cao Trẻ Em (TE)
//   - LẶN = tạo package mới "Lặn (tổng)" trong nhóm Thẻ học bơi (không chia Free/Mermaid)
//   - TRONG NHÀ / NGOÀI TRỜI = tạo 2 group mới + packages độc lập với "Thẻ member bơi" sẵn có
//   - DOANH THU KHÁC = tạo group mới riêng
//   - Chia đều 5 sale, dư ưu tiên Nhi → Hồng → Thơm → Dung → Quốc Anh
//   - 200 LƯỢT T1: 12.000.000 (typo trong bảng), qty=0
//
// DRY-RUN: GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-ctt-2026.ts
// APPLY:   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-ctt-2026.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const BRANCH = 'CTT';
const YEAR = 2026;

// 5 sale Member CTT — order = priority phân dư
const SALES = [
  { id: '',  name: 'Nguyễn Thị Nhi',         short: 'Nhi'    , email: 'nguyenthinhi.ctt@greenpool.vn' },
  { id: '',  name: 'Quán Thị Hồng',          short: 'Hồng'   , email: 'quanthihong.ctt@greenpool.vn'  },
  { id: '',  name: 'Nguyễn Thị Ngọc Thơm',   short: 'Thơm'   , email: 'nguyenthingocthom.ctt@greenpool.vn' },
  { id: '',  name: 'Nguyễn Thị Dung',        short: 'Dung'   , email: 'nguyenthidung.ctt@greenpool.vn' },
  { id: '',  name: 'Phạm Quốc Anh',          short: 'QAnh'   , email: 'phamquocanh.ctt@greenpool.vn'  },
];

// ───────── DATA bảng GÓI DỊCH VỤ (T1-T4) ─────────
// Format: { [groupKey]: { [packageKey]: { name, month1: [qty,rev], month2: [qty,rev], ... } } }
type Cell = [qty: number, rev: number];
type PackageRow = { name: string; cells: Record<number, Cell> };
type GroupBlock = { name: string; sortOrder: number; pkgs: Record<string, PackageRow> };

const PKG_DATA: Record<string, GroupBlock> = {
  HOCBOI: {
    name: 'Thẻ học bơi',
    sortOrder: 30,
    pkgs: {
      HBCBNL: { name: 'Học bơi cơ bản người lớn', cells: { 1: [70, 126_575_000], 2: [59, 103_650_000], 3: [84, 217_000_000], 4: [85, 229_500_000] } },
      HBCBTE: { name: 'Học bơi cơ bản trẻ em',    cells: { 1: [29,  45_250_000], 2: [21,  33_250_000], 3: [38,  75_600_000], 4: [99, 234_200_000] } },
      // HBCLC = trẻ em (anh chốt)
      HBCLC:  { name: 'Học bơi chất lượng cao TE', cells: { 3: [4, 19_000_000], 4: [10, 48_000_000] } },
      HBPT:   { name: 'Học bơi PT',                cells: { 3: [3, 20_400_000], 4: [6, 39_600_000] } },
      LAN:    { name: 'Lặn (tổng)',                cells: { 1: [6, 16_500_000], 2: [3, 12_000_000], 3: [3, 12_000_000], 4: [14, 70_100_000] } },
      TLKID:  { name: 'Học bơi Thang Long Kid',    cells: { 1: [25, 136_570_000], 2: [22, 137_510_000], 3: [74, 420_000_000], 4: [44, 223_500_000] } },
      TLAQUA: { name: 'Học bơi Thang Long Aqua',   cells: { 1: [17, 33_850_000], 2: [4, 17_180_000], 3: [10, 30_400_000], 4: [12, 32_500_000] } },
    },
  },
  TRONGNHA: {
    name: 'Bể trong nhà',
    sortOrder: 60,
    pkgs: {
      G1T:    { name: 'Gói 1 tháng',  cells: { 1: [7, 4_000_000], 2: [30, 18_781_000], 3: [66, 62_920_000], 4: [260, 250_237_000] } },
      G3T:    { name: 'Gói 3 tháng',  cells: { 1: [127, 191_925_000] } },
      G6T:    { name: 'Gói 6 tháng',  cells: { 3: [1, 5_500_000], 4: [1, 5_500_000] } },
      G1N:    { name: 'Gói 1 năm',    cells: { 1: [14, 99_300_000], 2: [53, 365_900_000], 3: [19, 137_910_000], 4: [30, 223_000_000] } },
      G2N:    { name: 'Gói 2 năm',    cells: { 4: [1, 14_250_000] } },
      G3N:    { name: 'Gói 3 năm',    cells: { 4: [1, 3_000_000] } },
      L200:   { name: '200 lượt',     cells: { 1: [0, 12_000_000], 3: [2, 24_000_000], 4: [1, 12_000_000] } }, // T1 typo 12.000.00 → 12tr
      L100:   { name: '100 lượt',     cells: { 1: [4, 23_125_000], 2: [38, 252_100_000], 3: [35, 221_450_000], 4: [81, 547_500_000] } },
      L50:    { name: '50 lượt',      cells: { 1: [3, 12_180_000], 2: [16, 59_500_000], 3: [27, 98_500_000], 4: [35, 134_500_000] } },
      L30:    { name: '30 lượt',      cells: { 2: [15, 33_000_000], 3: [47, 109_400_000], 4: [71, 173_525_000] } },
      L20:    { name: '20 lượt',      cells: { 1: [7, 12_600_000] } },
      L5:     { name: '5 lượt',       cells: { 4: [141, 56_401_000] } },
    },
  },
  NGOAITROI: {
    name: 'Bể ngoài trời',
    sortOrder: 70,
    pkgs: {
      OG3T:   { name: 'Gói 3 tháng', cells: { 4: [2, 5_000_000] } },
      OG1T:   { name: 'Gói 1 tháng', cells: { 4: [27, 18_987_000] } },
      OL10:   { name: 'Gói 10 lượt', cells: {} },
      OL30:   { name: 'Gói 30 lượt', cells: { 4: [13, 21_450_000] } },
      OL60:   { name: 'Gói 60 lượt', cells: { 4: [13, 50_900_000] } },
    },
  },
  KHAC: {
    name: 'Doanh thu khác',
    sortOrder: 80,
    pkgs: {
      DTK:    { name: 'Doanh thu khác', cells: { 1: [3, 17_200_000], 2: [2, 120_600_000], 3: [2, 33_150_000], 4: [1, 91_200_000] } },
    },
  },
};

// ───────── DATA bảng NGUỒN KHÁCH HÀNG (T1-T5) ─────────
type SourceCode = 'MKT' | 'Walk-in' | 'Renew' | 'Referral' | 'Sale';
type LeadCell = { leads: number; closed: number };

// FACE + HOTLINE gộp thành MKT (theo convention 24 NCT)
const LEADS_RAW: Record<number, {
  FACE: LeadCell; WALKIN: LeadCell; HOTLINE: LeadCell; RENEW: LeadCell; REFER: LeadCell; SALE: LeadCell;
}> = {
  1: {
    FACE:    { leads: 113, closed:  21 },
    WALKIN:  { leads:  35, closed:  27 },
    HOTLINE: { leads:  15, closed:   2 },
    RENEW:   { leads: 242, closed: 224 },
    REFER:   { leads:  71, closed:  66 },
    SALE:    { leads:   0, closed:   0 },
  },
  2: {
    FACE:    { leads:  45, closed:  21 },
    WALKIN:  { leads: 215, closed: 170 },
    HOTLINE: { leads:  48, closed:   1 },
    RENEW:   { leads: 191, closed: 170 },
    REFER:   { leads:  69, closed:  65 },
    SALE:    { leads:   0, closed:   0 },
  },
  3: {
    FACE:    { leads: 166, closed:  30 },
    WALKIN:  { leads: 285, closed: 252 },
    HOTLINE: { leads:  74, closed:   7 },
    RENEW:   { leads: 315, closed: 252 },
    REFER:   { leads: 132, closed: 111 },
    SALE:    { leads:  11, closed:   3 },
  },
  4: {
    FACE:    { leads: 483, closed:  51 },
    WALKIN:  { leads: 332, closed: 257 },
    HOTLINE: { leads: 167, closed:  17 },
    RENEW:   { leads: 450, closed: 415 },
    REFER:   { leads: 256, closed: 227 },
    SALE:    { leads:  17, closed:   2 },
  },
  5: {
    FACE:    { leads: 770, closed:  81 },
    WALKIN:  { leads: 478, closed: 212 },
    HOTLINE: { leads: 246, closed:  26 },
    RENEW:   { leads: 482, closed: 479 },
    REFER:   { leads: 301, closed: 289 },
    SALE:    { leads:  31, closed:  14 },
  },
};

// Checksum bảng nguồn — cột TỔNG anh ghi (FACE 1577/204, WALK-IN 1345/918, ...)
const LEADS_CHECKSUM_BY_SOURCE: Record<string, { leads: number; closed: number }> = {
  FACE:    { leads: 1577, closed: 204 },
  WALKIN:  { leads: 1345, closed: 918 },
  HOTLINE: { leads:  550, closed:  53 },
  RENEW:   { leads: 1680, closed: 1540 },
  REFER:   { leads:  829, closed: 758 },
  SALE:    { leads:   59, closed:  19 },
};

// ───────── HELPERS ─────────
function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }
function distribute(total: number): number[] {
  const n = SALES.length;
  const base = Math.floor(total / n);
  const rem = total % n;
  return SALES.map((_, i) => base + (i < rem ? 1 : 0));
}

// Build groupId/packageId map từ DB hiện tại (sau khi đã seed group/package mới)
type IdMap = {
  groupId: Record<string, string>;       // groupKey → groupId
  packageId: Record<string, Record<string, string>>;  // groupKey → packageKey → packageId
};

async function loadSaleUids() {
  const u = await db.collection('users').where('branchId','==',BRANCH).where('status','==','active').get();
  for (const d of u.docs) {
    const x = d.data();
    const s = SALES.find((s) => s.email === x.email);
    if (s) s.id = d.id;
  }
  const missing = SALES.filter((s) => !s.id);
  if (missing.length) throw new Error('Thiếu uid cho sale: ' + missing.map((s) => s.email).join(', '));
}

async function ensureGroupsAndPackages(): Promise<IdMap> {
  // Đọc group + package CTT hiện tại
  const groupSnap = await db.collection('packageGroups').where('branchId','==',BRANCH).get();
  const pkgSnap = await db.collection('packages').where('branchId','==',BRANCH).get();
  const existingGroups = new Map<string, { id: string; data: any }>();
  for (const d of groupSnap.docs) existingGroups.set(d.data().name, { id: d.id, data: d.data() });
  const existingPkgs = new Map<string, { id: string; groupId: string }>();
  for (const d of pkgSnap.docs) {
    const x = d.data();
    existingPkgs.set(`${x.groupId}::${x.name}`, { id: d.id, groupId: x.groupId });
  }

  const idMap: IdMap = { groupId: {}, packageId: {} };
  const ops: Array<{ type: 'group' | 'pkg'; ref: FirebaseFirestore.DocumentReference; data: any; label: string }> = [];

  for (const [gKey, gBlock] of Object.entries(PKG_DATA)) {
    // Find or create group
    let groupId: string;
    const exist = existingGroups.get(gBlock.name);
    if (exist) {
      groupId = exist.id;
      console.log(`  GROUP existing: ${gBlock.name} (${groupId})`);
    } else {
      const ref = db.collection('packageGroups').doc();
      groupId = ref.id;
      ops.push({
        type: 'group',
        ref,
        data: {
          branchId: BRANCH, name: gBlock.name, sortOrder: gBlock.sortOrder, active: true,
          createdBy: 'import-ctt-2026', updatedBy: 'import-ctt-2026',
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        },
        label: `NEW group "${gBlock.name}"`,
      });
      console.log(`  GROUP NEW: ${gBlock.name} (${groupId})`);
    }
    idMap.groupId[gKey] = groupId;
    idMap.packageId[gKey] = {};

    // Find or create packages
    for (const [pKey, pRow] of Object.entries(gBlock.pkgs)) {
      const key = `${groupId}::${pRow.name}`;
      const existPkg = existingPkgs.get(key);
      if (existPkg) {
        idMap.packageId[gKey][pKey] = existPkg.id;
        console.log(`    PKG existing: ${pRow.name} (${existPkg.id})`);
      } else {
        const ref = db.collection('packages').doc();
        idMap.packageId[gKey][pKey] = ref.id;
        ops.push({
          type: 'pkg',
          ref,
          data: {
            branchId: BRANCH, groupId, groupName: gBlock.name, name: pRow.name,
            sortOrder: 0, active: true, defaultPrice: 0,
            createdBy: 'import-ctt-2026', updatedBy: 'import-ctt-2026',
            createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          },
          label: `NEW pkg "${pRow.name}" trong "${gBlock.name}"`,
        });
        console.log(`    PKG NEW: ${pRow.name} (${ref.id})`);
      }
    }
  }

  console.log(`\n  → ${ops.filter((o) => o.type === 'group').length} group mới, ${ops.filter((o) => o.type === 'pkg').length} package mới`);
  if (APPLY && ops.length > 0) {
    const batch = db.batch();
    for (const op of ops) batch.set(op.ref, op.data);
    await batch.commit();
    console.log(`  ✅ Đã ghi ${ops.length} doc group/pkg`);
  }
  return idMap;
}

async function importPackageQuantities(idMap: IdMap) {
  console.log('\n━━━ PHASE 2: packageQuantities ━━━');
  const ops: Array<{ docId: string; data: any }> = [];
  const monthTotals: Record<number, { qty: number; rev: number }> = { 1: { qty: 0, rev: 0 }, 2: { qty: 0, rev: 0 }, 3: { qty: 0, rev: 0 }, 4: { qty: 0, rev: 0 } };

  for (const [gKey, gBlock] of Object.entries(PKG_DATA)) {
    const groupId = idMap.groupId[gKey];
    for (const [pKey, pRow] of Object.entries(gBlock.pkgs)) {
      const packageId = idMap.packageId[gKey][pKey];
      for (const [monthStr, cell] of Object.entries(pRow.cells)) {
        const month = Number(monthStr);
        const [qty, rev] = cell;
        if (qty === 0 && rev === 0) continue;
        const period = `${YEAR}-${pad2(month)}`;
        const docId = `${YEAR}_${pad2(month)}_${BRANCH}_${packageId}`;
        ops.push({
          docId,
          data: {
            branchId: BRANCH, year: YEAR, month, period,
            groupId, groupName: gBlock.name,
            packageId, packageName: pRow.name,
            quantity: qty, revenue: rev,
            sourceSystem: 'manual',
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: 'import-ctt-2026',
          },
        });
        monthTotals[month].qty += qty;
        monthTotals[month].rev += rev;
      }
    }
  }

  console.log(`  Tổng docs: ${ops.length}`);
  for (const m of [1,2,3,4]) {
    console.log(`  T${m}: qty=${monthTotals[m].qty.toLocaleString('vi-VN')} · rev=${fmt(monthTotals[m].rev)}`);
  }
  const grandRev = Object.values(monthTotals).reduce((s, v) => s + v.rev, 0);
  console.log(`  TỔNG NĂM: rev=${fmt(grandRev)}`);

  if (APPLY) {
    // Firestore batch limit 500 — chia chunk
    const CHUNK = 400;
    for (let i = 0; i < ops.length; i += CHUNK) {
      const batch = db.batch();
      for (const op of ops.slice(i, i + CHUNK)) {
        batch.set(db.collection('packageQuantities').doc(op.docId), op.data, { merge: true });
      }
      await batch.commit();
    }
    console.log(`  ✅ Đã ghi ${ops.length} packageQuantities`);
  }
}

async function importSalesEntries() {
  console.log('\n━━━ PHASE 3: salesEntries (T1-T5) ━━━');
  // Tổng các nguồn checksum sẽ verify ở cuối
  const sourceTotals: Record<SourceCode, { leads: number; closed: number }> = {
    MKT: { leads: 0, closed: 0 },
    'Walk-in': { leads: 0, closed: 0 },
    Renew: { leads: 0, closed: 0 },
    Referral: { leads: 0, closed: 0 },
    Sale: { leads: 0, closed: 0 },
  };
  const ops: Array<{ docId: string; data: any }> = [];

  // Anh chốt 2026-06-01: CHỈ nhập leads T1-T4 (T5 trong bảng anh gửi chỉ để tham khảo, chưa nhập).
  for (const month of [1,2,3,4] as const) {
    const raw = LEADS_RAW[month];
    // Gộp FACE + HOTLINE = MKT
    const merged: Record<SourceCode, LeadCell> = {
      MKT: { leads: raw.FACE.leads + raw.HOTLINE.leads, closed: raw.FACE.closed + raw.HOTLINE.closed },
      'Walk-in': raw.WALKIN,
      Renew: raw.RENEW,
      Referral: raw.REFER,
      Sale: raw.SALE,
    };
    const period = `${YEAR}-${pad2(month)}`;
    console.log(`  T${month}:`);
    for (const [source, cell] of Object.entries(merged) as Array<[SourceCode, LeadCell]>) {
      if (cell.leads === 0 && cell.closed === 0) continue;
      const lBy = distribute(cell.leads);
      const cBy = distribute(cell.closed);
      console.log(`    ${source.padEnd(10)} L=${cell.leads.toString().padStart(4)} C=${cell.closed.toString().padStart(4)}  →  ${SALES.map((s,i) => `${s.short}:${lBy[i]}/${cBy[i]}`).join(' · ')}`);
      sourceTotals[source].leads += cell.leads;
      sourceTotals[source].closed += cell.closed;
      for (let i = 0; i < SALES.length; i++) {
        const s = SALES[i];
        const sL = lBy[i], sC = cBy[i];
        if (sL === 0 && sC === 0) continue;
        if (sC > sL) console.warn(`    ⚠ ${s.short} ${source}: closed=${sC} > leads=${sL}`);
        ops.push({
          docId: `month_${period}_${BRANCH}_${s.id}_${source}`,
          data: {
            period, periodType: 'month',
            year: YEAR, month, branchId: BRANCH,
            saleId: s.id, saleName: s.name,
            source,
            leads: sL, closed: sC, notClosed: sL - sC,
            sourceSystem: 'manual',
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: 'import-ctt-2026',
          },
        });
      }
    }
  }

  // Verify checksum (cột TỔNG anh ghi). Nguồn MKT = FACE + HOTLINE → sum 2 checksum.
  console.log('\n  Verify checksum (anh ghi cột TỔNG):');
  const expected: Record<SourceCode, { leads: number; closed: number }> = {
    MKT: { leads: LEADS_CHECKSUM_BY_SOURCE.FACE.leads + LEADS_CHECKSUM_BY_SOURCE.HOTLINE.leads,
           closed: LEADS_CHECKSUM_BY_SOURCE.FACE.closed + LEADS_CHECKSUM_BY_SOURCE.HOTLINE.closed },
    'Walk-in': LEADS_CHECKSUM_BY_SOURCE.WALKIN,
    Renew: LEADS_CHECKSUM_BY_SOURCE.RENEW,
    Referral: LEADS_CHECKSUM_BY_SOURCE.REFER,
    Sale: LEADS_CHECKSUM_BY_SOURCE.SALE,
  };
  let allOk = true;
  for (const src of Object.keys(sourceTotals) as SourceCode[]) {
    const got = sourceTotals[src];
    const exp = expected[src];
    const okL = got.leads === exp.leads ? '✓' : `✗ got=${got.leads} exp=${exp.leads}`;
    const okC = got.closed === exp.closed ? '✓' : `✗ got=${got.closed} exp=${exp.closed}`;
    console.log(`    ${src.padEnd(10)} L=${got.leads.toString().padStart(4)} [${okL}] · C=${got.closed.toString().padStart(4)} [${okC}]`);
    if (got.leads !== exp.leads || got.closed !== exp.closed) allOk = false;
  }
  if (!allOk) {
    console.error('\n  ⚠ CHECKSUM SAI → DỪNG');
    process.exit(1);
  }
  console.log(`  ✓ Tất cả checksum khớp`);

  console.log(`\n  Tổng salesEntries docs: ${ops.length}`);
  if (APPLY) {
    const CHUNK = 400;
    for (let i = 0; i < ops.length; i += CHUNK) {
      const batch = db.batch();
      for (const op of ops.slice(i, i + CHUNK)) {
        batch.set(db.collection('salesEntries').doc(op.docId), op.data, { merge: true });
      }
      await batch.commit();
    }
    console.log(`  ✅ Đã ghi ${ops.length} salesEntries`);
  }
}

async function main() {
  console.log(APPLY ? '🚀 APPLY MODE' : '👀 DRY-RUN MODE');
  console.log(`Branch: ${BRANCH} · Year: ${YEAR} · 5 sale Member\n`);

  await loadSaleUids();
  console.log('Sale UIDs:');
  for (const s of SALES) console.log(`  ${s.short.padEnd(6)} → ${s.id} (${s.email})`);

  console.log('\n━━━ PHASE 1: ensure groups + packages ━━━');
  const idMap = await ensureGroupsAndPackages();

  await importPackageQuantities(idMap);
  await importSalesEntries();

  console.log(APPLY ? '\n✅ DONE — đã ghi vào Firestore' : '\n(dry-run — không ghi gì)');
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
