// Nhập doanh số tháng 5/2026 cho cơ sở TK (20 Thuỵ Khuê).
// Source: ảnh anh gửi 2026-06-08.
//
// 2 collection:
// 1. `sales` (per-aggregate) — 3 docs cho Dung/Hương/Quân với amount tổng.
// 2. `packageQuantities` — 11 docs cho 11 gói (quantity + revenue).
//
// Invariant kiểm tra:
//   sum(sales[branch=TK,month=5].amount) === sum(packageQuantities[TK,2026/5].revenue) === 2,141,696,000
//
// Usage: tsx scripts/import-tk-may-2026.ts (dry) | tsx scripts/import-tk-may-2026.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

const BRANCH = 'TK';
const YEAR = 2026;
const MONTH = 5;
// Giữa tháng để chắc trong khoảng — tránh edge case timezone end-of-month.
const TIMESTAMP_MID_MONTH = new Date('2026-05-15T07:00:00.000Z'); // 14:00 VN

// Sales aggregate (uid lookup từ check trước)
const SALES_AGGREGATE = [
  { saleId: 'U1qZ5Rmu1xVZUnBLFaHzlkKuHKr2', name: 'Nguyễn Thị Dung',        amount: 905_305_000 },
  { saleId: 'eJVGPWO0RKZMebdWWxrxsW3y1F82', name: 'Đồng Thị Lan Hương',      amount: 658_045_000 },
  { saleId: 'JEJfVKddpyW6WYKwMgwVHl2q3pE3', name: 'Nguyễn Văn Quân',        amount: 578_346_000 },
];

// 11 packages — map từ ảnh sang packageId TK catalog (đã verify ở list-tk-packages.ts)
const PACKAGES_DATA = [
  { packageId: 'OoXLlY9YN3LV5kE8EcMQ', packageName: 'Học bơi cơ bản trẻ em',     groupId: 'ss7YqXrcdjalRAysh9eq', groupName: 'Học bơi',         quantity: 121, revenue: 294_700_000 },
  { packageId: 'yO71o3F0DZ9VsnGFVggv', packageName: 'Học bơi cơ bản người lớn',  groupId: 'ss7YqXrcdjalRAysh9eq', groupName: 'Học bơi',         quantity: 108, revenue: 322_105_000 },
  { packageId: 'UogOEQrjGeWrWZn2vXb4', packageName: '15 lượt',                   groupId: 'qWYKSpYfRflNRMsrzjwk', groupName: 'Tích lượt',       quantity: 4,   revenue: 6_000_000 },
  { packageId: 'LWRlcrdYoEzxX8DtlIdo', packageName: '30 lượt',                   groupId: 'qWYKSpYfRflNRMsrzjwk', groupName: 'Tích lượt',       quantity: 6,   revenue: 14_399_000 },
  { packageId: 'I1Wn5ekwKE2YifD6ZJFR', packageName: '60 lượt',                   groupId: 'qWYKSpYfRflNRMsrzjwk', groupName: 'Tích lượt',       quantity: 290, revenue: 1_055_442_000 },
  { packageId: 'ypAsHePYJiBNZQa1ji6f', packageName: 'Thẻ 1 tháng',               groupId: 'ZfIE9quMIdXIGkdYXwDE', groupName: 'Thẻ tháng/năm',   quantity: 0,   revenue: 0 },
  { packageId: 'ImPhyQqQ58R4KUWnMW3A', packageName: 'thẻ 2 tháng',               groupId: 'ZfIE9quMIdXIGkdYXwDE', groupName: 'Thẻ tháng/năm',   quantity: 8,   revenue: 21_780_000 },
  { packageId: 'MoZYKE1BDpAf7Z0OW2AJ', packageName: 'Thẻ 3 tháng',               groupId: 'ZfIE9quMIdXIGkdYXwDE', groupName: 'Thẻ tháng/năm',   quantity: 36,  revenue: 94_050_000 },
  { packageId: 'ndVyJ9OQNUZ8BJVGTQas', packageName: 'Thẻ 1 năm',                 groupId: 'ZfIE9quMIdXIGkdYXwDE', groupName: 'Thẻ tháng/năm',   quantity: 34,  revenue: 267_620_000 },
  { packageId: 'A3VFNeMX670dsLyiNwZ8', packageName: 'Thẻ 2 năm',                 groupId: 'ZfIE9quMIdXIGkdYXwDE', groupName: 'Thẻ tháng/năm',   quantity: 4,   revenue: 48_900_000 },
  { packageId: 'aQDuferIKgM1ifrthpLU', packageName: 'Học bơi Thang Long Kid',    groupId: 'ss7YqXrcdjalRAysh9eq', groupName: 'Học bơi',         quantity: 14,  revenue: 16_700_000 },
];

const TOTAL_REVENUE_EXPECTED = 2_141_696_000;

function pkgQuantityDocId(year: number, month: number, branchId: string, packageId: string): string {
  return `${year}-${String(month).padStart(2, '0')}_${branchId}_${packageId}`;
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const APPLY = process.argv.includes('--apply');
  const now = Timestamp.now();
  const midMonth = Timestamp.fromDate(TIMESTAMP_MID_MONTH);

  // ─── Verify totals trước khi nhập ───
  const sumSales = SALES_AGGREGATE.reduce((s, x) => s + x.amount, 0);
  const sumPkgRev = PACKAGES_DATA.reduce((s, p) => s + p.revenue, 0);
  console.log(`\n=== VERIFY INVARIANT ===`);
  console.log(`Sum sales aggregate  : ${sumSales.toLocaleString('vi-VN')}`);
  console.log(`Sum packages revenue : ${sumPkgRev.toLocaleString('vi-VN')}`);
  console.log(`Expected total       : ${TOTAL_REVENUE_EXPECTED.toLocaleString('vi-VN')}`);
  if (sumSales !== sumPkgRev || sumSales !== TOTAL_REVENUE_EXPECTED) {
    console.error(`❌ TOTALS MISMATCH — abort`);
    process.exit(1);
  }
  console.log(`✓ Invariant OK\n`);

  // Get fcmDevices của 3 sale (để khẳng định uid hợp lệ)
  console.log(`=== Verify saleId hợp lệ ===`);
  for (const s of SALES_AGGREGATE) {
    const d = await db.collection('users').doc(s.saleId).get();
    if (!d.exists) {
      console.error(`❌ Sale ${s.name} uid=${s.saleId} KHÔNG tồn tại`);
      process.exit(1);
    }
    const x = d.data() as any;
    console.log(`  ✓ ${s.saleId} | ${x.displayName} | ${x.email} | ${x.roleId}`);
  }

  // ─── Check existing data ───
  console.log(`\n=== Check data hiện có ===`);
  const existingPkgs = await db.collection('packageQuantities')
    .where('year', '==', YEAR).where('month', '==', MONTH).where('branchId', '==', BRANCH).get();
  console.log(`Existing packageQuantities: ${existingPkgs.size}`);

  // Check sales existing in May 2026 for TK — single where + filter in memory (tránh index)
  const allTkSales = await db.collection('sales').where('branchId', '==', BRANCH).get();
  const existingSalesDocs = allTkSales.docs.filter((d) => {
    const x = d.data() as any;
    const ts: Date | null = x.createdAt?.toDate?.() ?? (typeof x.createdAt === 'string' ? new Date(x.createdAt) : null);
    if (!ts) return false;
    return ts.getUTCFullYear() === YEAR && ts.getUTCMonth() + 1 === MONTH;
  });
  console.log(`Existing sales TK 2026-05: ${existingSalesDocs.length} (filtered from ${allTkSales.size} total TK)`);
  if (existingSalesDocs.length > 0) {
    console.log('  Sample:');
    existingSalesDocs.slice(0, 3).forEach((d) => {
      const x = d.data() as any;
      console.log(`    ${d.id}: amount=${x.amount} saleBy=${x.saleBy} status=${x.status}`);
    });
  }

  // ─── Apply ───
  if (!APPLY) {
    console.log(`\n=== DRY RUN — Sẽ nhập (chạy lại với --apply để commit) ===`);
    console.log(`\n[Sales] 3 docs aggregate:`);
    SALES_AGGREGATE.forEach((s) => {
      console.log(`  - ${s.name} (${s.saleId.slice(0, 8)}...): ${s.amount.toLocaleString('vi-VN')} đ`);
    });
    console.log(`\n[PackageQuantities] 11 docs:`);
    PACKAGES_DATA.forEach((p) => {
      console.log(`  - ${p.packageName.padEnd(30)} qty=${String(p.quantity).padStart(3)} rev=${p.revenue.toLocaleString('vi-VN').padStart(15)} đ`);
    });
    console.log(`\nReplace mode (delete existing) sẽ bật. Chạy --apply để commit.`);
    return;
  }

  console.log(`\n=== APPLY ===`);

  // 1. Replace existing TK month 5/2026 sales — xoá docs cũ
  if (existingSalesDocs.length > 0) {
    console.log(`[Sales] Đang xoá ${existingSalesDocs.length} docs cũ...`);
    const batchDel = db.batch();
    existingSalesDocs.forEach((d) => batchDel.delete(d.ref));
    await batchDel.commit();
    console.log(`  ✓ Đã xoá`);
  }

  // 2. Insert 3 sales aggregate
  console.log(`[Sales] Insert 3 docs aggregate...`);
  for (const s of SALES_AGGREGATE) {
    const ref = db.collection('sales').doc();
    await ref.set({
      branchId: BRANCH,
      amount: s.amount,
      packageId: null,                              // aggregate — không gắn 1 package cụ thể
      packageName: `[Aggregate T${MONTH}/${YEAR}]`, // label rõ
      saleBy: s.saleId,
      saleByName: s.name,
      status: 'confirmed',
      closeSource: 'Aggregate',
      sourceSystem: 'manual',
      external_id: `aggregate_TK_${YEAR}-${MONTH}_${s.saleId.slice(0, 8)}`,
      createdAt: midMonth,
      createdBy: 'script-import-tk-may',
      updatedAt: now,
      updatedBy: 'script-import-tk-may',
      isAggregate: true,                            // flag để UI biết doc tổng hợp
      note: 'Doanh số tháng 5/2026 — nhập aggregate từ báo cáo Excel.',
    });
    console.log(`  ✓ ${s.name}: ${s.amount.toLocaleString('vi-VN')} đ → ${ref.id}`);
  }

  // 3. Replace + insert 11 packageQuantities
  console.log(`[PackageQuantities] Replace + insert 11 docs...`);
  // Delete existing
  if (existingPkgs.size > 0) {
    const batchDel = db.batch();
    existingPkgs.docs.forEach((d) => batchDel.delete(d.ref));
    await batchDel.commit();
    console.log(`  ✓ Đã xoá ${existingPkgs.size} docs cũ`);
  }
  const batchIns = db.batch();
  for (const p of PACKAGES_DATA) {
    const id = pkgQuantityDocId(YEAR, MONTH, BRANCH, p.packageId);
    const ref = db.collection('packageQuantities').doc(id);
    batchIns.set(ref, {
      year: YEAR,
      month: MONTH,
      branchId: BRANCH,
      packageId: p.packageId,
      packageName: p.packageName,
      groupId: p.groupId,
      groupName: p.groupName,
      quantity: p.quantity,
      revenue: p.revenue,
      createdAt: now,
      createdBy: 'script-import-tk-may',
      updatedAt: now,
      updatedBy: 'script-import-tk-may',
    });
  }
  await batchIns.commit();
  console.log(`  ✓ 11 docs đã set`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✓ HOÀN TẤT NHẬP DỮ LIỆU TK T${MONTH}/${YEAR}`);
  console.log(`  Total: ${TOTAL_REVENUE_EXPECTED.toLocaleString('vi-VN')} đ`);
  console.log(`  3 sales aggregate + 11 package quantities`);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
