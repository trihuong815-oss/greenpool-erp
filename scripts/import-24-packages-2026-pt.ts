// Import packageQuantities (qty + revenue per package × month) cho 24 NCT T1-T4/2026.
// 3 dịch vụ: BƠI (Thẻ member bơi), FITNESS (Thẻ member Fitness), FULL (Full dịch vụ).
// Data anh gửi 2026-05-30.
//
// Quy tắc:
// - Bỏ cells có rev=0 (vd "1 / -" tức 1 lượt nhưng doanh thu chưa thu, skip để tránh dirty data).
// - Có checksum: tổng tính-được phải khớp tổng anh ghi trong bảng (TỔNG cuối hàng).
//
// DRY-RUN:  GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-24-packages-2026-pt.ts
// APPLY:    GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-24-packages-2026-pt.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// ─── PACKAGE MAP (24 NCT) — verified bằng scripts/find-24-packages.ts ───
type Service = 'BOI' | 'FITNESS' | 'FULL';
type Duration = '1T' | '2T' | '3T' | '6T' | '1Y' | '2Y' | '3Y';

const GROUP: Record<Service, { id: string; name: string }> = {
  BOI:     { id: 'EOUj89xuEVZpiHICfHBj', name: 'Thẻ member bơi' },
  FITNESS: { id: 'lGLmqoa57FAlUwl6ICvc', name: 'Thẻ member Fitness' },
  FULL:    { id: 'PyOl51xyOjhy6wpy4rhK', name: 'Full dịch vụ' },
};

const PKG: Record<Service, Partial<Record<Duration, { id: string; name: string }>>> = {
  BOI: {
    '1T': { id: 'RlpcrLNIKnn4TBtUAmV7', name: 'Thẻ 1 tháng' },
    '2T': { id: 'ZeBzQiz8lRhIqifdGPaj', name: 'thẻ 2 tháng' },
    '3T': { id: 'lmiWUA77jWKnOCzgVkKl', name: 'Thẻ 3 tháng' },
    '6T': { id: 'RV2f7TZY9gXtgOyeNf3H', name: 'Thẻ 6 tháng' },
    '1Y': { id: 'BlUIBomRO0FieIGMc6Zm', name: 'Thẻ 1 năm' },
    '2Y': { id: 'e1iCHcjavCu0t9103ytc', name: 'Thẻ 2 năm' },
    '3Y': { id: 'MrwAqJWXYS1qO5LHjmt3', name: 'Thẻ 3 năm' },
  },
  FITNESS: {
    '1T': { id: 'm9IxcW2rRdPMrPatbPko', name: '1 tháng fitness' },
    // '2T' fitness: chưa có package này trong DB → skip
    '3T': { id: 'xTGM3illhwWpdy6mJ97l', name: '3 tháng fitness' },
    '6T': { id: 'QR7c5hqMvaArD6VDCz7l', name: '6 tháng fitness' },
    '1Y': { id: '5pLWO0H0m7Kg0RhSy0zm', name: '1 năm fitness' },
    '2Y': { id: 'jBienA9u8CvNq081pBmZ', name: '2 năm fitness' },
    '3Y': { id: 'WTBxnAvCyqTfTVXdBLXl', name: '3 năm fitness' },
  },
  FULL: {
    '1T': { id: 'q3BM6I5AeFa8Ur3pjhSB', name: 'full 1 tháng' },
    '2T': { id: 'qxZAS7c9wjRGF2e65jJF', name: 'full 2 tháng' },
    '3T': { id: 'Xh4JMu6z7T5OnuAXbAYl', name: 'full 3 tháng' },
    '6T': { id: 'WlXELVueRpI26fk3rDYt', name: 'full 6 tháng' },
    '1Y': { id: 'RIyTiSwgeyTKYxPomJaf', name: 'full 1 năm' },
    '2Y': { id: 'l0gSaNzZEPNeALXcfJkM', name: 'full 2 năm' },
    '3Y': { id: 'VVstnNwmszn2gBMjGLvr', name: 'full 3 năm' },
  },
};

// ─── DATA per service × month × duration: [qty, revenue]. Cells có rev=0 / "-" sẽ skip ───
// Checksum: từng tháng có { totalQty, totalRev } cuối hàng — script sẽ verify.
type Cell = { qty: number; rev: number };
type MonthData = Partial<Record<Duration, Cell>>;
interface ServiceData {
  monthly: Record<number, MonthData>;
  checksum: Record<number, { totalQty: number; totalRev: number }>;
}

const DATA: Record<Service, ServiceData> = {
  BOI: {
    monthly: {
      1: { '1T': { qty: 12,  rev:   5_400_000 }, '3T': { qty: 1, rev:   100_000 }, '6T': { qty: 3, rev:   9_500_000 }, '1Y': { qty: 11, rev:  75_620_000 } },
      2: { '1T': { qty:  6,  rev:   2_899_000 }, '2T': { qty: 1, rev:           0 }, '3T': { qty: 4, rev:   8_400_000 }, '1Y': { qty: 15, rev: 107_420_000 } },
      3: { '1T': { qty: 32,  rev:  22_698_000 }, '3T': { qty: 20, rev: 41_900_000 }, '6T': { qty: 5, rev:  20_000_000 }, '1Y': { qty: 24, rev: 150_100_000 } },
      4: { '1T': { qty:  4,  rev:   3_500_000 }, '3T': { qty: 19, rev: 41_700_000 }, '6T': { qty: 3, rev:   5_200_000 }, '1Y': { qty: 15, rev:  76_500_000 } },
    },
    checksum: {
      1: { totalQty: 27, totalRev:  90_620_000 },
      2: { totalQty: 26, totalRev: 118_719_000 },
      3: { totalQty: 81, totalRev: 234_698_000 },
      4: { totalQty: 41, totalRev: 126_900_000 },
    },
  },
  FITNESS: {
    monthly: {
      1: { '1T': { qty: 35, rev: 10_997_000 }, '2T': { qty: 1, rev: 0 }, '3T': { qty:  9, rev: 15_400_000 }, '6T': { qty: 5, rev: 16_000_000 }, '1Y': { qty: 14, rev:  77_800_000 } },
      2: { '1T': { qty:  3, rev:  1_499_000 }, '3T': { qty:  6, rev: 10_800_000 }, '6T': { qty: 8, rev: 24_600_000 }, '1Y': { qty: 6, rev: 39_600_000 }, '3Y': { qty: 1, rev: 18_000_000 } },
      3: { '1T': { qty:  6, rev:  3_297_999 }, '2T': { qty: 1, rev: 0 }, '3T': { qty: 19, rev: 28_400_000 }, '6T': { qty: 8, rev: 26_200_000 }, '1Y': { qty: 17, rev:  66_300_000 } },
      4: { '1T': { qty:  6, rev:  5_999_000 }, '3T': { qty: 22, rev: 45_000_000 }, '6T': { qty: 4, rev: 15_900_000 }, '1Y': { qty: 19, rev: 80_300_000 } },
    },
    checksum: {
      1: { totalQty: 64, totalRev: 120_197_000 },
      2: { totalQty: 24, totalRev:  94_499_000 },
      3: { totalQty: 51, totalRev: 124_197_999 },
      4: { totalQty: 51, totalRev: 147_199_000 },
    },
  },
  FULL: {
    monthly: {
      1: { '3T': { qty:  1, rev:  3_500_000 }, '6T': { qty: 1, rev: 5_000_000 }, '1Y': { qty:  5, rev:  21_090_000 } },
      2: { '1T': { qty: 17, rev:  8_497_000 }, '1Y': { qty:  9, rev: 68_025_000 } },
      3: { '1T': { qty:100, rev: 52_098_000 }, '3T': { qty: 4, rev: 14_000_000 }, '6T': { qty: 1, rev: 2_750_000 }, '1Y': { qty: 17, rev: 77_600_000 } },
      4: { '3T': { qty:  4, rev: 11_500_000 }, '1Y': { qty: 28, rev: 116_350_000 }, '3Y': { qty: 1, rev: 4_500_000 } },
    },
    checksum: {
      1: { totalQty:   7, totalRev:  29_590_000 },
      2: { totalQty:  26, totalRev:  76_522_000 },
      3: { totalQty: 122, totalRev: 146_448_000 },
      4: { totalQty:  33, totalRev: 132_350_000 },
    },
  },
};

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY RUN — dùng --apply');
  console.log('Branch: 24 NCT · Year: 2026 · Months: 1-4 · 3 dịch vụ\n');

  const ops: Array<{ docId: string; data: Record<string, unknown> }> = [];
  let allChecksumOk = true;

  for (const service of ['BOI', 'FITNESS', 'FULL'] as Service[]) {
    const group = GROUP[service];
    const pkgMap = PKG[service];
    const sd = DATA[service];
    console.log(`\n═══ ${service} (${group.name}) ═══`);
    for (const month of [1, 2, 3, 4] as const) {
      let mQty = 0, mRev = 0, mDocs = 0;
      const m = sd.monthly[month] ?? {};
      for (const [dur, cell] of Object.entries(m) as [Duration, Cell][]) {
        if (cell.qty === 0 && cell.rev === 0) continue;
        mQty += cell.qty;
        mRev += cell.rev;
        if (cell.rev === 0) {
          console.log(`  T${month} ${dur.padEnd(3)} skip ghi (qty=${cell.qty} nhưng rev=0)`);
          continue;
        }
        const pkg = pkgMap[dur];
        if (!pkg) {
          console.error(`  ✗ T${month} ${service} ${dur}: KHÔNG có package map — bỏ qua (qty=${cell.qty} rev=${fmt(cell.rev)}đ)`);
          continue;
        }
        const docId = `2026_${pad2(month)}_24_${pkg.id}`;
        ops.push({
          docId,
          data: {
            year: 2026, month, branchId: '24',
            groupId: group.id, groupName: group.name,
            packageId: pkg.id, packageName: pkg.name,
            quantity: cell.qty, revenue: cell.rev,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: 'admin@migration',
          },
        });
        mDocs++;
        console.log(`  T${month} ${dur.padEnd(3)} qty=${cell.qty.toString().padStart(4)}  rev=${fmt(cell.rev).padStart(16)}đ → ${pkg.name}`);
      }
      const chk = sd.checksum[month];
      const matchQty = mQty === chk.totalQty ? '✓' : `✗ tính=${mQty} bảng=${chk.totalQty}`;
      const matchRev = mRev === chk.totalRev ? '✓' : `✗ tính=${fmt(mRev)} bảng=${fmt(chk.totalRev)}`;
      console.log(`  ─ Tổng T${month}: ${mDocs} docs · qty=${mQty} [${matchQty}] · rev=${fmt(mRev)}đ [${matchRev}]`);
      if (mQty !== chk.totalQty || mRev !== chk.totalRev) allChecksumOk = false;
    }
  }

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Tổng docs sẽ ghi: ${ops.length}`);
  if (!allChecksumOk) {
    console.error('⚠⚠⚠ CHECKSUM SAI — KHÔNG APPLY. Kiểm tra lại số liệu.');
    process.exit(1);
  }
  console.log('✓ Tất cả checksum khớp với bảng anh gửi.');

  if (APPLY) {
    const batch = db.batch();
    for (const op of ops) batch.set(db.collection('packageQuantities').doc(op.docId), op.data, { merge: true });
    await batch.commit();
    console.log(`✅ Wrote ${ops.length} docs vào collection packageQuantities`);
  } else {
    console.log('(dry run — chạy lại với --apply)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
