// Import packageQuantities cho gói "PT Gym" của cơ sở 24 NCT — T1-T4/2026.
// Data lấy từ per-sale PT (17 docs đã import ở 2c39b42) — tổng hợp theo tháng.
// Mục đích: cơ sở 24 có dữ liệu doanh số PT trong "Doanh số theo gói (cơ cấu tháng)".
//
// Quantity tạm tính = số sale PT có doanh thu > 0 trong tháng (vì gói PT linh động,
// không có quantity cố định). Anh có thể cập nhật sau qua UI nếu có số HĐ chính xác.
//
// DRY-RUN:  GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-24-pt-quantities.ts
// APPLY:    GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-24-pt-quantities.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// Package PT Gym vừa tạo bởi seed-pt-gym-group.ts
const GROUP_ID   = 'RagnOJvxPPaO4dKH61M8';
const GROUP_NAME = 'Gói PT Gym';
const PKG_ID     = '0uNQGJYbEGArkC4cAXqc';
const PKG_NAME   = 'PT Gym (gói tùy chỉnh)';

// Data tổng hợp từ bảng per-sale PT anh gửi (đã import 2c39b42).
// qty = số sale PT có doanh thu > 0 trong tháng. rev = tổng doanh thu PT tháng đó.
const DATA: Record<number, { qty: number; rev: number }> = {
  1: { qty: 5, rev:   406_700_000 },  // Lò Thị Thới, Trần Thanh Tài, Nguyễn Hồng Nhung, Bùi Văn Hoạt, Hoàng Hồng Phúc
  2: { qty: 2, rev:     8_000_000 },  // Nguyễn Hồng Nhung 4tr + Bùi Văn Hoạt 4tr
  3: { qty: 5, rev:   509_150_000 },  // 5 sale (trừ Nguyễn Hải Long)
  4: { qty: 5, rev:   289_700_000 },  // 5 sale (trừ Trần Thanh Tài)
};
// Verify: tổng = 1.213.550.000 (khớp per-sale PT đã import)
const EXPECTED_TOTAL_REV = 1_213_550_000;
const EXPECTED_TOTAL_QTY = 17;        // = số docs per-sale PT

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY' : '👀 DRY-RUN');
  console.log(`Branch: 24 NCT · Package: ${PKG_NAME} (${PKG_ID})\n`);

  const ops: Array<{ docId: string; data: Record<string, unknown> }> = [];
  let sumQty = 0, sumRev = 0;
  for (const month of [1, 2, 3, 4] as const) {
    const { qty, rev } = DATA[month];
    const docId = `2026_${pad2(month)}_24_${PKG_ID}`;
    ops.push({
      docId,
      data: {
        year: 2026, month, branchId: '24',
        groupId: GROUP_ID, groupName: GROUP_NAME,
        packageId: PKG_ID, packageName: PKG_NAME,
        quantity: qty, revenue: rev,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin@migration',
      },
    });
    console.log(`  T${month}: qty=${qty}  rev=${fmt(rev).padStart(15)}đ`);
    sumQty += qty;
    sumRev += rev;
  }
  const okQty = sumQty === EXPECTED_TOTAL_QTY ? '✓' : `✗ (tính=${sumQty} vs expected=${EXPECTED_TOTAL_QTY})`;
  const okRev = sumRev === EXPECTED_TOTAL_REV ? '✓' : `✗ (tính=${fmt(sumRev)} vs expected=${fmt(EXPECTED_TOTAL_REV)})`;
  console.log(`\n  TỔNG: qty=${sumQty} [${okQty}] · rev=${fmt(sumRev)}đ [${okRev}]`);
  if (sumQty !== EXPECTED_TOTAL_QTY || sumRev !== EXPECTED_TOTAL_REV) {
    console.error('⚠ Checksum SAI — dừng');
    process.exit(1);
  }

  if (APPLY) {
    const batch = db.batch();
    for (const op of ops) batch.set(db.collection('packageQuantities').doc(op.docId), op.data, { merge: true });
    await batch.commit();
    console.log(`\n✅ Wrote ${ops.length} docs vào packageQuantities`);
  } else {
    console.log('\n(dry-run)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
