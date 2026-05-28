// Import packageQuantities cho Thanh Trì T2, T3, T4 năm 2026.
// User đã nhập T1 (10 docs, thiếu HBNC). T2-4 nhập đầy đủ.
// Bỏ Bảo lưu theo user.
//
// Run:
//   npx --yes tsx scripts/import-tt-packages-t2-4.ts           # dry run
//   npx --yes tsx scripts/import-tt-packages-t2-4.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// Mapping tên gói trong bảng user → packageId TT (đã verify từ Firestore)
const PKG = {
  '1 tháng':  { id: 'RAuRGmAssiLw4haJuWfZ', group: '53Tg6eVzvrMY10UKKl53', groupName: 'Thẻ member bơi', name: 'Thẻ 1 tháng' },
  '2 tháng':  { id: 'iRlxeS3csVYDIs2hDqUx', group: '53Tg6eVzvrMY10UKKl53', groupName: 'Thẻ member bơi', name: 'thẻ 2 tháng' },
  '3 tháng':  { id: '3NEp86lt1plFSZbKFVJU', group: '53Tg6eVzvrMY10UKKl53', groupName: 'Thẻ member bơi', name: 'Thẻ 3 tháng' },
  '6 tháng':  { id: 'XUNNR5jVJ7rqtHxtrDm7', group: '53Tg6eVzvrMY10UKKl53', groupName: 'Thẻ member bơi', name: 'Thẻ 6 tháng' },
  '1 năm':    { id: 'WqFEoO2vN35lNBouFGPr', group: '53Tg6eVzvrMY10UKKl53', groupName: 'Thẻ member bơi', name: 'Thẻ 1 năm' },
  '2 năm':    { id: '8aZusgkbaIYOGaixH8iC', group: '53Tg6eVzvrMY10UKKl53', groupName: 'Thẻ member bơi', name: 'Thẻ 2 năm' },
  '30 lượt':  { id: '8hyGiKDN7iZa1ZjHuoU3', group: 'kBFrwGS1mCeYFc4z8KrM', groupName: 'Thẻ tích lượt',  name: '30 lượt' },
  '60 lượt':  { id: 'kq375LHJkTN5izqD7jMR', group: 'kBFrwGS1mCeYFc4z8KrM', groupName: 'Thẻ tích lượt',  name: '60 lượt' },
  '120 lượt': { id: 'uBxKlqQfxpI5NrpX3mPs', group: 'kBFrwGS1mCeYFc4z8KrM', groupName: 'Thẻ tích lượt',  name: '120 lượt' },
  '240 lượt': { id: 'Edk67VI2jv7scKSStJAh', group: 'kBFrwGS1mCeYFc4z8KrM', groupName: 'Thẻ tích lượt',  name: '240 lượt' },
  HBCBTE:     { id: 'z7huDs9RX6IvMVX9epcT', group: '0CZJecl9Rt08EJ4cEdJm', groupName: 'Thẻ học bơi',    name: 'Học bơi cơ bản trẻ em' },
  HBCBNL:     { id: 'Gfwd24I7t3lp63aT7RZa', group: '0CZJecl9Rt08EJ4cEdJm', groupName: 'Thẻ học bơi',    name: 'Học bơi cơ bản người lớn' },
  CLCNL:      { id: '1Em5DMXZEDM9GcizUS3V', group: '0CZJecl9Rt08EJ4cEdJm', groupName: 'Thẻ học bơi',    name: 'Học bơi chất lượng cao NL' },
  CLCTE:      { id: 'dIoC4q55DFFw6TI75Omf', group: '0CZJecl9Rt08EJ4cEdJm', groupName: 'Thẻ học bơi',    name: 'Học bơi chất lượng cao TE' },
  HBNC:       { id: 'WaUBNhh5DOMJSK8Ldfyv', group: '0CZJecl9Rt08EJ4cEdJm', groupName: 'Thẻ học bơi',    name: 'Học bơi Thang Long Kid' },
  PT:         { id: 'j8tXFkQX5p6sRBSHh76A', group: '0CZJecl9Rt08EJ4cEdJm', groupName: 'Thẻ học bơi',    name: 'Học bơi PT' },
} as const;

// Data từ bảng user — { revenue, qty } per package per month
const DATA: Record<number, Record<keyof typeof PKG, { rev: number; qty: number }>> = {
  2: {
    '1 tháng':  { rev: 35_987_000, qty: 80 },
    '2 tháng':  { rev: 0,          qty: 0 },
    '3 tháng':  { rev: 0,          qty: 0 },
    '6 tháng':  { rev: 0,          qty: 0 },
    '1 năm':    { rev: 142_630_000, qty: 30 },
    '2 năm':    { rev: 0,          qty: 0 },
    '30 lượt':  { rev: 15_300_000, qty: 4 },
    '60 lượt':  { rev: 7_220_000,  qty: 2 },
    '120 lượt': { rev: 32_385_000, qty: 2 },
    '240 lượt': { rev: 0,          qty: 0 },
    HBCBTE:     { rev: 19_800_000, qty: 35 },
    HBCBNL:     { rev: 99_425_000, qty: 83 },
    CLCNL:      { rev: 0,          qty: 0 },
    CLCTE:      { rev: 0,          qty: 0 },
    HBNC:       { rev: 15_250_000, qty: 10 },
    PT:         { rev: 0,          qty: 0 },
  },
  3: {
    '1 tháng':  { rev: 93_500_000, qty: 182 },
    '2 tháng':  { rev: 0,          qty: 0 },
    '3 tháng':  { rev: 2_500_000,  qty: 1 },
    '6 tháng':  { rev: 0,          qty: 0 },
    '1 năm':    { rev: 159_100_000, qty: 35 },
    '2 năm':    { rev: 0,          qty: 0 },
    '30 lượt':  { rev: 68_100_000, qty: 46 },
    '60 lượt':  { rev: 32_920_000, qty: 12 },
    '120 lượt': { rev: 114_905_000, qty: 39 },
    '240 lượt': { rev: 118_200_000, qty: 16 },
    HBCBTE:     { rev: 126_500_000, qty: 119 },
    HBCBNL:     { rev: 289_300_000, qty: 241 },
    CLCNL:      { rev: 5_500_000,  qty: 1 },
    CLCTE:      { rev: 0,          qty: 0 },
    HBNC:       { rev: 42_800_000, qty: 13 },
    PT:         { rev: 11_200_000, qty: 4 },
  },
  4: {
    '1 tháng':  { rev: 81_200_000, qty: 84 },
    '2 tháng':  { rev: 0,          qty: 0 },
    '3 tháng':  { rev: 19_200_000, qty: 7 },
    '6 tháng':  { rev: 0,          qty: 0 },
    '1 năm':    { rev: 261_540_000, qty: 41 },
    '2 năm':    { rev: 0,          qty: 0 },
    '30 lượt':  { rev: 180_025_000, qty: 114 },
    '60 lượt':  { rev: 183_680_000, qty: 51 },
    '120 lượt': { rev: 300_550_000, qty: 51 },
    '240 lượt': { rev: 408_100_000, qty: 35 },
    HBCBTE:     { rev: 250_900_000, qty: 132 },
    HBCBNL:     { rev: 415_600_000, qty: 191 },
    CLCNL:      { rev: 14_900_000, qty: 3 },
    CLCTE:      { rev: 0,          qty: 0 },
    HBNC:       { rev: 69_350_000, qty: 27 },
    PT:         { rev: 30_300_000, qty: 6 },
  },
};

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY RUN — dùng --apply để ghi');
  console.log('Branch: TT · Year: 2026 · Months: 2, 3, 4');
  console.log('Bỏ Bảo lưu theo yêu cầu.\n');

  const ops: Array<{ docId: string; data: Record<string, unknown> }> = [];

  for (const month of [2, 3, 4] as const) {
    console.log(`━━━ Tháng ${month}/2026 ━━━`);
    let totalRev = 0, totalQty = 0;
    for (const [tableName, { rev, qty }] of Object.entries(DATA[month])) {
      if (rev === 0 && qty === 0) continue;
      const pkg = PKG[tableName as keyof typeof PKG];
      const id = `2026_${pad2(month)}_TT_${pkg.id}`;
      const data = {
        year: 2026,
        month,
        branchId: 'TT',
        groupId: pkg.group,
        groupName: pkg.groupName,
        packageId: pkg.id,
        packageName: pkg.name,
        quantity: qty,
        revenue: rev,
        updatedAt: new Date(),
        updatedBy: 'admin@migration',
      };
      ops.push({ docId: id, data });
      console.log(`  ${tableName.padEnd(10)} qty=${qty.toString().padStart(4)}  rev=${fmt(rev).padStart(15)}`);
      totalRev += rev;
      totalQty += qty;
    }
    console.log(`  ─ Tổng: ${totalQty} gói · ${fmt(totalRev)}đ\n`);
  }

  console.log(`Tổng docs sẽ ghi: ${ops.length}`);

  if (APPLY) {
    const batch = db.batch();
    for (const op of ops) {
      batch.set(db.collection('packageQuantities').doc(op.docId), op.data, { merge: true });
    }
    await batch.commit();
    console.log(`✅ Wrote ${ops.length} docs`);
  } else {
    console.log('(dry run — chưa ghi · dùng --apply)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
