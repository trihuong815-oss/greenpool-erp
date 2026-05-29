// Import HM 2026 T1-T4 đầy đủ:
// 1. salesEntries (leads per sale × source × month)
// 2. packageQuantities (qty + revenue per package × month)
// 3. packageSales __total (revenue per sale × month)
//
// Quy tắc:
// - Lead distribute: chia đều 5 sale, dư ưu tiên theo [Hoa, Linh, Thúy, Duy, Nam]
// - Source mapping: FACE+HOTLINE → MKT · WALK-IN → Walk-in · RENEW → Renew · REFER → Referral · ĐI THỊ TRƯỜNG → Sale
// - Package: "90;120 lượt" → tất vào 120 lượt · "Học bơi nâng cao" → Thang Long Kid · Bảo lưu+Chuyển nhượng skip
// - T3 FACE SỐ LƯỢNG đã sửa 103 → 193 (chốt+chưa khớp đúng)
//
// Run:
//   npx --yes tsx scripts/import-hm-2026.ts           # dry run
//   npx --yes tsx scripts/import-hm-2026.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// ─── 5 SALE HM (priority order cho dư lead) ───
const SALES = [
  { id: '0cpQyEfwtmRd5IRBT0KaeG7Q6W23', name: 'Ngô Thị Hoa',         short: 'Hoa'   },
  { id: 'mvzmQBSK1XW4v0QZ7cHAYvncPx13', name: 'Ngọc Thị Linh',        short: 'Linh'  },
  { id: 'a34JerXCxCh8g3zvWLYScteiZxJ2', name: 'Nguyễn Thị Thúy',      short: 'Thúy'  },
  { id: 'VRgOZpfxjJU5Etn1QPsbWWLcf3A2', name: 'Đoàn Công Duy',        short: 'Duy'   },
  { id: 'xhJIOyYlu3SeNMexIqQLOcTsrPN2', name: 'Nguyễn Phương Nam',    short: 'Nam'   },
];

// ─── LEAD DATA per source × month — chốt + chưa chốt + tổng tự derive ───
type SourceCode = 'MKT' | 'Walk-in' | 'Renew' | 'Referral' | 'Sale';
const LEADS: Record<number, Record<SourceCode, { leads: number; closed: number }>> = {
  1: {
    MKT:        { leads: 61 + 15, closed: 12 + 4 },     // FACE + HOTLINE
    'Walk-in':  { leads: 44,      closed: 31 },
    Renew:      { leads: 334,     closed: 235 },
    Referral:   { leads: 93,      closed: 62 },
    Sale:       { leads: 36,      closed: 14 },          // ĐI THỊ TRƯỜNG
  },
  2: {
    MKT:        { leads: 33 + 11, closed: 17 + 1 },
    'Walk-in':  { leads: 14,      closed: 6 },
    Renew:      { leads: 415,     closed: 313 },
    Referral:   { leads: 88,      closed: 70 },
    Sale:       { leads: 73,      closed: 56 },
  },
  3: {
    // T3 FACE SỐ LƯỢNG fix 103 → 193 (chốt 36 + chưa 157)
    MKT:        { leads: 193 + 42, closed: 36 + 9 },
    'Walk-in':  { leads: 106,      closed: 58 },
    Renew:      { leads: 802,      closed: 618 },
    Referral:   { leads: 236,      closed: 182 },
    Sale:       { leads: 551,      closed: 97 },
  },
  4: {
    MKT:        { leads: 232 + 115, closed: 43 + 10 },
    'Walk-in':  { leads: 147,       closed: 65 },
    Renew:      { leads: 636,       closed: 499 },
    Referral:   { leads: 351,       closed: 275 },
    Sale:       { leads: 216,       closed: 119 },
  },
};

// ─── PER-SALE TOTAL REVENUE ───
const PER_SALE: Record<number, Record<string, number>> = {
  1: { Hoa: 165_849_000, Linh: 202_520_000, Thúy: 160_850_000, Duy: 173_299_000, Nam: 166_129_000 },
  2: { Hoa: 270_030_000, Linh: 209_059_000, Thúy: 203_278_000, Duy: 200_049_000, Nam: 217_870_000 },
  3: { Hoa: 549_670_000, Linh: 425_288_000, Thúy: 335_940_000, Duy: 339_410_000, Nam: 332_730_000 },
  4: { Hoa: 1_075_680_000, Linh: 745_480_000, Thúy: 650_530_000, Duy: 700_555_000, Nam: 690_142_000 },
};

// ─── PACKAGE DATA (qty + rev) ─── (skip Bảo lưu + Chuyển nhượng)
type PkgKey =
  | '1 tháng' | '2 tháng' | '3 tháng' | '6 tháng' | '1 năm' | '2 năm'
  | '30 lượt' | '60 lượt' | '120 lượt'  // 90;120 gộp vào 120
  | 'HBCBTE' | 'HBCBNL' | 'HBNC' | 'HBPT';
const PKG_MAP: Record<PkgKey, { id: string; group: string; groupName: string; name: string }> = {
  '1 tháng':  { id: 'WoQUBj5Ydone8BcLiyNH', group: '1i9DeoSdRxND', groupName: 'Thẻ member bơi', name: 'Thẻ 1 tháng' },
  '2 tháng':  { id: 'IspLgp1MwoimQA7MPBas', group: '1i9DeoSdRxND', groupName: 'Thẻ member bơi', name: 'Thẻ 2 tháng' }, // mới tạo
  '3 tháng':  { id: 'SoXYP9oVVLVelNdcYxny', group: '1i9DeoSdRxND', groupName: 'Thẻ member bơi', name: 'Thẻ 3 tháng' },
  '6 tháng':  { id: 'upKc50OeFEUQN9T87ydh', group: '1i9DeoSdRxND', groupName: 'Thẻ member bơi', name: 'Thẻ 6 tháng' },
  '1 năm':    { id: '3BV635VkatlgHfWZYj7f', group: '1i9DeoSdRxND', groupName: 'Thẻ member bơi', name: 'Thẻ 1 năm' },
  '2 năm':    { id: 'wVVctg22tVCD9UkA6CQ6', group: '1i9DeoSdRxND', groupName: 'Thẻ member bơi', name: 'Thẻ 2 năm' },
  '30 lượt':  { id: 'TdGcWjVL1GSaAZZ1OpH8', group: 'IwKL1C5BCYwn', groupName: 'Thẻ tích lượt',  name: '30 lượt' },
  '60 lượt':  { id: 'AVTt4PuiaeYqdSlMSiSC', group: 'IwKL1C5BCYwn', groupName: 'Thẻ tích lượt',  name: '60 lượt' },
  '120 lượt': { id: '40F8EZ0ODreILg328d3k', group: 'IwKL1C5BCYwn', groupName: 'Thẻ tích lượt',  name: '120 lượt' }, // gộp 90;120
  HBCBTE:     { id: 'vnUMd7SoChXn8BUoWebV', group: 'K88HOpXs9wl8', groupName: 'Thẻ học bơi',    name: 'Học bơi cơ bản trẻ em' },
  HBCBNL:     { id: 'VQwEETZyK8sEa3zLpUfS', group: 'K88HOpXs9wl8', groupName: 'Thẻ học bơi',    name: 'Học bơi cơ bản người lớn' },
  HBNC:       { id: 'ImKJ6xm8aObgHuxyrpPn', group: 'K88HOpXs9wl8', groupName: 'Thẻ học bơi',    name: 'Học bơi Thang Long Kid' }, // = "Học bơi nâng cao"
  HBPT:       { id: 'ufikcMKXKEAg0UtDhxuN', group: 'K88HOpXs9wl8', groupName: 'Thẻ học bơi',    name: 'Học bơi PT' },
};

const PKG_DATA: Record<number, Record<PkgKey, { qty: number; rev: number }>> = {
  1: {
    '1 tháng':  { qty: 56,  rev: 28_398_000 },
    '2 tháng':  { qty: 79,  rev: 73_899_000 },
    '3 tháng':  { qty: 0,   rev: 0 },
    '6 tháng':  { qty: 1,   rev: 5_800_000 },
    '1 năm':    { qty: 18,  rev: 156_800_000 },
    '2 năm':    { qty: 0,   rev: 0 },
    '30 lượt':  { qty: 20,  rev: 40_010_000 },
    '60 lượt':  { qty: 11,  rev: 35_220_000 },
    '120 lượt': { qty: 8,   rev: 47_880_000 },
    HBCBTE:     { qty: 31,  rev: 41_500_000 },
    HBCBNL:     { qty: 122, rev: 207_040_000 },
    HBNC:       { qty: 89,  rev: 232_100_000 },
    HBPT:       { qty: 0,   rev: 0 },
  },
  2: {
    '1 tháng':  { qty: 36,  rev: 25_196_000 },
    '2 tháng':  { qty: 4,   rev: 3_600_000 },
    '3 tháng':  { qty: 7,   rev: 17_500_000 },
    '6 tháng':  { qty: 0,   rev: 0 },
    '1 năm':    { qty: 136, rev: 502_510_000 },
    '2 năm':    { qty: 0,   rev: 0 },
    '30 lượt':  { qty: 20,  rev: 35_810_000 },
    '60 lượt':  { qty: 9,   rev: 28_130_000 },
    '120 lượt': { qty: 23,  rev: 118_650_000 },
    HBCBTE:     { qty: 99,  rev: 57_550_000 },
    HBCBNL:     { qty: 130, rev: 125_900_000 },
    HBNC:       { qty: 56,  rev: 185_440_000 },
    HBPT:       { qty: 0,   rev: 0 },
  },
  3: {
    '1 tháng':  { qty: 66,  rev: 50_999_000 },
    '2 tháng':  { qty: 0,   rev: 0 },
    '3 tháng':  { qty: 51,  rev: 68_600_000 },  // note bảng: "51-1 tt nốt" → qty=51
    '6 tháng':  { qty: 1,   rev: 5_800_000 },
    '1 năm':    { qty: 35,  rev: 541_040_000 },
    '2 năm':    { qty: 1,   rev: 200_000 },
    '30 lượt':  { qty: 109, rev: 143_819_000 },
    '60 lượt':  { qty: 34,  rev: 71_850_000 },
    '120 lượt': { qty: 194, rev: 359_030_000 },
    HBCBTE:     { qty: 113, rev: 191_150_000 },
    HBCBNL:     { qty: 170, rev: 295_900_000 },
    HBNC:       { qty: 88,  rev: 254_650_000 },
    HBPT:       { qty: 0,   rev: 0 },
  },
  4: {
    '1 tháng':  { qty: 13,  rev: 21_900_000 },
    '2 tháng':  { qty: 0,   rev: 0 },
    '3 tháng':  { qty: 8,   rev: 62_400_000 },
    '6 tháng':  { qty: 0,   rev: 0 },
    '1 năm':    { qty: 14,  rev: 211_410_000 },
    '2 năm':    { qty: 0,   rev: 13_800_000 },   // qty=0 rev>0
    '30 lượt':  { qty: 105, rev: 309_850_000 },
    '60 lượt':  { qty: 30,  rev: 194_830_000 },
    '120 lượt': { qty: 34,  rev: 1_150_140_000 }, // BẢNG: bất thường, đơn giá ~33.8M (cao)
    HBCBTE:     { qty: 283, rev: 749_550_000 },
    HBCBNL:     { qty: 202, rev: 804_975_000 },
    HBNC:       { qty: 110, rev: 322_832_000 },
    HBPT:       { qty: 0,   rev: 20_700_000 },   // qty blank → 0, rev>0
  },
};

// ─── LEAD distribution: chia đều 5, dư theo priority [Hoa, Linh, Thúy, Duy, Nam] ───
function distribute(total: number): number[] {
  const base = Math.floor(total / 5);
  const rem = total % 5;
  return SALES.map((_, i) => base + (i < rem ? 1 : 0));
}

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY RUN — dùng --apply');
  console.log('Branch: HM · Year: 2026 · Months: 1-4\n');

  const seOps: Array<{ docId: string; data: Record<string, unknown> }> = [];
  const pqOps: Array<{ docId: string; data: Record<string, unknown> }> = [];
  const psOps: Array<{ docId: string; data: Record<string, unknown> }> = [];
  const SOURCES_ORDER: SourceCode[] = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'];

  // ─── salesEntries (leads) ───
  console.log('═══ LEADS ═══');
  for (const month of [1, 2, 3, 4] as const) {
    console.log(`\n━━━ T${month} ━━━`);
    const period = `2026-${pad2(month)}`;
    let monthLeadsTotal = 0, monthClosedTotal = 0;
    for (const source of SOURCES_ORDER) {
      const { leads, closed } = LEADS[month][source];
      if (leads === 0 && closed === 0) continue;
      const lBy = distribute(leads);
      const cBy = distribute(closed);
      console.log(`  ${source.padEnd(10)} L=${fmt(leads).padStart(5)} C=${fmt(closed).padStart(5)}  →  ${SALES.map((s,i) => `${s.short}:${lBy[i]}/${cBy[i]}`).join(' · ')}`);
      for (let i = 0; i < SALES.length; i++) {
        const sale = SALES[i];
        const saleLeads = lBy[i], saleClosed = cBy[i];
        if (saleLeads === 0 && saleClosed === 0) continue;
        if (saleClosed > saleLeads) {
          console.warn(`    ⚠ ${sale.name} ${source}: closed > leads`);
        }
        const docId = `month_${period}_HM_${sale.id}_${source}`;
        seOps.push({
          docId,
          data: {
            period, periodType: 'month',
            year: 2026, month, branchId: 'HM',
            saleId: sale.id, saleName: sale.name,
            source,
            leads: saleLeads, closed: saleClosed, notClosed: saleLeads - saleClosed,
            sourceSystem: 'manual',
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: 'admin@migration',
          },
        });
      }
      monthLeadsTotal += leads;
      monthClosedTotal += closed;
    }
    console.log(`  ─ Tổng T${month}: ${fmt(monthLeadsTotal)} leads · ${fmt(monthClosedTotal)} closed`);
  }

  // ─── packageQuantities (per gói) ───
  console.log('\n\n═══ PACKAGE QUANTITIES ═══');
  for (const month of [1, 2, 3, 4] as const) {
    console.log(`\n━━━ T${month} ━━━`);
    let totalRev = 0, totalQty = 0;
    for (const [pkgKey, { qty, rev }] of Object.entries(PKG_DATA[month]) as [PkgKey, { qty: number; rev: number }][]) {
      if (qty === 0 && rev === 0) continue;
      const pkg = PKG_MAP[pkgKey];
      const id = `2026_${pad2(month)}_HM_${pkg.id}`;
      pqOps.push({
        docId: id,
        data: {
          year: 2026, month, branchId: 'HM',
          groupId: pkg.group, groupName: pkg.groupName,
          packageId: pkg.id, packageName: pkg.name,
          quantity: qty, revenue: rev,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'admin@migration',
        },
      });
      const flag = (qty === 0 && rev > 0) ? ' ⚠ qty=0 rev>0' : '';
      console.log(`  ${pkgKey.padEnd(10)} qty=${qty.toString().padStart(5)} rev=${fmt(rev).padStart(18)}${flag}`);
      totalRev += rev;
      totalQty += qty;
    }
    const perSaleTotal = Object.values(PER_SALE[month]).reduce((s, n) => s + n, 0);
    const match = totalRev === perSaleTotal ? '✓ KHỚP per-sale' : `⚠ lệch ${fmt(totalRev - perSaleTotal)}`;
    console.log(`  ─ Tổng T${month}: ${totalQty} gói · ${fmt(totalRev)}đ  [${match}]`);
  }

  // ─── packageSales __total (per sale) ───
  console.log('\n\n═══ PER-SALE __total ═══');
  for (const month of [1, 2, 3, 4] as const) {
    console.log(`\n━━━ T${month} ━━━`);
    const period = `2026-${pad2(month)}`;
    let totalRev = 0;
    for (const sale of SALES) {
      const revenue = PER_SALE[month][sale.short];
      const docId = `month_${period}_HM_${sale.id}___total`;
      psOps.push({
        docId,
        data: {
          unitPrice: revenue, branchId: 'HM', period, quantity: 1,
          updatedBy: 'admin@migration',
          saleId: sale.id, year: 2026,
          sourceSystem: 'manual',
          groupId: '__total', packageId: '__total',
          saleName: sale.name,
          groupName: '(Tổng)', packageName: '(Tổng theo sale)',
          revenue, periodType: 'month', month,
          createdBy: 'admin@migration',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      console.log(`  ${sale.short.padEnd(6)} ${fmt(revenue).padStart(15)}đ`);
      totalRev += revenue;
    }
    console.log(`  ─ Tổng T${month}: ${fmt(totalRev)}đ`);
  }

  console.log(`\n═══ TOTAL DOCS ═══`);
  console.log(`  salesEntries:      ${seOps.length}`);
  console.log(`  packageQuantities: ${pqOps.length}`);
  console.log(`  packageSales:      ${psOps.length}`);

  if (APPLY) {
    // Batch writes (500 max per batch)
    async function writeAll(col: string, ops: typeof seOps) {
      const BATCH = 400;
      for (let i = 0; i < ops.length; i += BATCH) {
        const batch = db.batch();
        for (const op of ops.slice(i, i + BATCH)) {
          batch.set(db.collection(col).doc(op.docId), op.data);
        }
        await batch.commit();
      }
    }
    await writeAll('salesEntries', seOps);
    console.log(`✅ salesEntries: ${seOps.length} docs`);
    await writeAll('packageQuantities', pqOps);
    console.log(`✅ packageQuantities: ${pqOps.length} docs`);
    await writeAll('packageSales', psOps);
    console.log(`✅ packageSales: ${psOps.length} docs`);
  } else {
    console.log('\n(dry run — chưa ghi)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
