// Import packageQuantities Thuỵ Khuê T1-T4/2026 với cả qty + revenue.
// Replace mode: xóa toàn bộ T1-T4 cũ rồi nhập fresh (vì data cũ thiếu revenue + có entry Thẻ 6 tháng sai).
//
// Run:
//   npx --yes tsx scripts/import-tk-packages.ts           # dry run
//   npx --yes tsx scripts/import-tk-packages.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// Mapping bảng user → packageId TK (verified từ Firestore)
const PKG = {
  HBCBTE:    { id: 'OoXLlY9YN3LV5kE8EcMQ', group: 'ss7YqXrcdjalRAysh9eq', groupName: 'Thẻ học bơi',     name: 'Học bơi cơ bản trẻ em' },
  HBCBNL:    { id: 'yO71o3F0DZ9VsnGFVggv', group: 'ss7YqXrcdjalRAysh9eq', groupName: 'Thẻ học bơi',     name: 'Học bơi cơ bản người lớn' },
  '15 lượt': { id: 'UogOEQrjGeWrWZn2vXb4', group: 'qWYKSpYfRflNRMsrzjwk', groupName: 'Thẻ tích lượt',   name: '15 lượt' },
  '30 lượt': { id: 'LWRlcrdYoEzxX8DtlIdo', group: 'qWYKSpYfRflNRMsrzjwk', groupName: 'Thẻ tích lượt',   name: '30 lượt' },
  '60 lượt': { id: 'I1Wn5ekwKE2YifD6ZJFR', group: 'qWYKSpYfRflNRMsrzjwk', groupName: 'Thẻ tích lượt',   name: '60 lượt' },
  '1 tháng': { id: 'ypAsHePYJiBNZQa1ji6f', group: 'ZfIE9quMIdXIGkdYXwDE', groupName: 'Thẻ member bơi',  name: 'Thẻ 1 tháng' },
  '2 tháng': { id: 'ImPhyQqQ58R4KUWnMW3A', group: 'ZfIE9quMIdXIGkdYXwDE', groupName: 'Thẻ member bơi',  name: 'thẻ 2 tháng' },
  '3 tháng': { id: 'MoZYKE1BDpAf7Z0OW2AJ', group: 'ZfIE9quMIdXIGkdYXwDE', groupName: 'Thẻ member bơi',  name: 'Thẻ 3 tháng' },
  '1 năm':   { id: 'ndVyJ9OQNUZ8BJVGTQas', group: 'ZfIE9quMIdXIGkdYXwDE', groupName: 'Thẻ member bơi',  name: 'Thẻ 1 năm' },
  '2 năm':   { id: 'A3VFNeMX670dsLyiNwZ8', group: 'ZfIE9quMIdXIGkdYXwDE', groupName: 'Thẻ member bơi',  name: 'Thẻ 2 năm' },
  HBNC:      { id: 'aQDuferIKgM1ifrthpLU', group: 'ss7YqXrcdjalRAysh9eq', groupName: 'Thẻ học bơi',     name: 'Học bơi Thang Long Kid' },
} as const;

// Data từ bảng user — { qty, rev }
const DATA: Record<number, Record<keyof typeof PKG, { qty: number; rev: number }>> = {
  1: {
    HBCBTE:    { qty: 10, rev: 15_600_000 },
    HBCBNL:    { qty: 44, rev: 74_440_000 },
    '15 lượt': { qty: 0,  rev: 0 },
    '30 lượt': { qty: 46, rev: 115_200_000 },
    '60 lượt': { qty: 1,  rev: 2_900_000 },
    '1 tháng': { qty: 77, rev: 56_183_000 },
    '2 tháng': { qty: 0,  rev: 0 },
    '3 tháng': { qty: 0,  rev: 0 },
    '1 năm':   { qty: 29, rev: 261_300_000 },
    '2 năm':   { qty: 0,  rev: 0 },
    HBNC:      { qty: 1,  rev: 6_300_000 },
  },
  2: {
    HBCBTE:    { qty: 10, rev: 15_000_000 },
    HBCBNL:    { qty: 56, rev: 55_850_000 },
    '15 lượt': { qty: 1,  rev: 1_500_000 },
    '30 lượt': { qty: 1,  rev: 1_700_000 },
    '60 lượt': { qty: 31, rev: 85_700_000 },
    '1 tháng': { qty: 0,  rev: 700_000 },        // qty=0 nhưng có revenue (truy thu)
    '2 tháng': { qty: 162,rev: 156_900_000 },
    '3 tháng': { qty: 0,  rev: 0 },
    '1 năm':   { qty: 26, rev: 200_800_000 },
    '2 năm':   { qty: 3,  rev: 48_000_000 },
    HBNC:      { qty: 0,  rev: 0 },
  },
  3: {
    HBCBTE:    { qty: 51, rev: 62_320_000 },
    HBCBNL:    { qty: 75, rev: 152_681_000 },
    '15 lượt': { qty: 0,  rev: 0 },
    '30 lượt': { qty: 2,  rev: 5_700_000 },
    '60 lượt': { qty: 139,rev: 356_200_000 },
    '1 tháng': { qty: 103,rev: 80_165_000 },
    '2 tháng': { qty: 0,  rev: 50_900_000 },     // qty=0 nhưng rev>0
    '3 tháng': { qty: 0,  rev: 0 },
    '1 năm':   { qty: 187,rev: 667_900_000 },
    '2 năm':   { qty: 6,  rev: 25_200_000 },
    HBNC:      { qty: 3,  rev: 4_200_000 },
  },
  4: {
    HBCBTE:    { qty: 47, rev: 141_910_000 },
    HBCBNL:    { qty: 54, rev: 197_775_000 },
    '15 lượt': { qty: 5,  rev: 7_500_000 },
    '30 lượt': { qty: 13, rev: 24_640_000 },
    '60 lượt': { qty: 224,rev: 665_930_000 },
    '1 tháng': { qty: 0,  rev: 1_400_000 },      // qty=0 nhưng rev>0
    '2 tháng': { qty: 0,  rev: 0 },
    '3 tháng': { qty: 40, rev: 130_550_000 },
    '1 năm':   { qty: 33, rev: 398_970_000 },
    '2 năm':   { qty: 1,  rev: 5_500_000 },
    HBNC:      { qty: 6,  rev: 8_400_000 },
  },
};

// Per-sale totals (đã nhập từ trước) để cross-check
const PER_SALE_TOTAL: Record<number, number> = {
  1: 531_923_000,
  2: 566_150_000,
  3: 1_407_266_000,
  4: 1_583_075_000,
};

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY RUN — dùng --apply');
  console.log('Branch: TK · Year: 2026 · Months: 1-4\n');

  // Step 1: List existing docs sẽ bị xoá
  console.log('━━━ Existing docs sẽ xoá (replace mode) ━━━');
  for (const m of [1, 2, 3, 4] as const) {
    const s = await db.collection('packageQuantities')
      .where('branchId', '==', 'TK').where('year', '==', 2026).where('month', '==', m).get();
    console.log(`  T${m}: ${s.size} docs`);
  }

  const ops: Array<{ docId: string; data: Record<string, unknown> }> = [];
  const docsToDelete: string[] = [];

  // Collect existing doc IDs to delete
  for (const m of [1, 2, 3, 4] as const) {
    const s = await db.collection('packageQuantities')
      .where('branchId', '==', 'TK').where('year', '==', 2026).where('month', '==', m).get();
    s.docs.forEach((d) => docsToDelete.push(d.id));
  }

  // Build new docs
  for (const month of [1, 2, 3, 4] as const) {
    console.log(`\n━━━ Tháng ${month}/2026 ━━━`);
    let totalRev = 0, totalQty = 0;
    for (const [tableName, { qty, rev }] of Object.entries(DATA[month])) {
      if (qty === 0 && rev === 0) continue;
      const pkg = PKG[tableName as keyof typeof PKG];
      const id = `2026_${pad2(month)}_TK_${pkg.id}`;
      ops.push({
        docId: id,
        data: {
          year: 2026, month, branchId: 'TK',
          groupId: pkg.group, groupName: pkg.groupName,
          packageId: pkg.id, packageName: pkg.name,
          quantity: qty, revenue: rev,
          updatedAt: new Date(),
          updatedBy: 'admin@migration',
        },
      });
      const flag = (qty === 0 && rev > 0) ? ' ⚠ qty=0 rev>0' : '';
      console.log(`  ${tableName.padEnd(10)} qty=${qty.toString().padStart(4)}  rev=${fmt(rev).padStart(15)}${flag}`);
      totalRev += rev;
      totalQty += qty;
    }
    const perSale = PER_SALE_TOTAL[month];
    const diff = totalRev - perSale;
    const match = diff === 0 ? '✓ MATCH per-sale' : `⚠ lệch ${fmt(diff)} so với per-sale=${fmt(perSale)}`;
    console.log(`  ─ Tổng T${month}: ${totalQty} gói · ${fmt(totalRev)}đ  [${match}]`);
  }

  console.log(`\nSẽ xoá: ${docsToDelete.length} docs cũ`);
  console.log(`Sẽ ghi: ${ops.length} docs mới`);

  if (APPLY) {
    // Delete old
    if (docsToDelete.length > 0) {
      const batch = db.batch();
      docsToDelete.forEach((id) => batch.delete(db.collection('packageQuantities').doc(id)));
      await batch.commit();
      console.log(`✅ Xoá ${docsToDelete.length} docs cũ`);
    }
    // Insert new
    const batch = db.batch();
    for (const op of ops) {
      batch.set(db.collection('packageQuantities').doc(op.docId), op.data);
    }
    await batch.commit();
    console.log(`✅ Ghi ${ops.length} docs mới`);
  } else {
    console.log('\n(dry run — chưa thay đổi · dùng --apply)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
