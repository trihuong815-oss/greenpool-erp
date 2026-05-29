// Import per-sale __total revenue cho 24 NCT T1-T4/2026.
// Pattern: packageSales với packageId='__total' (giống HM/TK/TT đã làm).
// Run:
//   npx --yes tsx scripts/import-24-sale-totals.ts           # dry run
//   npx --yes tsx scripts/import-24-sale-totals.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const SALES = [
  { id: 'eA4vyjj9opMNe6lSfhqdzsOYdHe2', name: 'Đoàn Trung Kiên',         short: 'Kiên'  },
  { id: '21tJyTuq27MTXiF1hq9phhd86V53', name: 'Nguyễn Thị Thanh Huyền',  short: 'Huyền' },
  { id: 'yHWyVnQTXYRtmIxdleMJ35jmi4y1', name: 'Nông Thị Thanh Hương',    short: 'Hương' },
  { id: 'nnI9HmKzB0Ob5sskMPJ5CtPIE9I2', name: 'Đới Nhật Lương',          short: 'Lương' },
];

// Revenue per sale per month — VND
const REV: Record<number, Record<string, number>> = {
  1: { Kiên: 107_050_000, Huyền: 197_675_000, Hương: 113_915_000, Lương: 107_452_000 },
  2: { Kiên: 120_049_000, Huyền: 154_900_000, Hương:  83_768_000, Lương: 122_048_000 },
  3: { Kiên: 380_220_000, Huyền: 411_550_000, Hương: 300_537_000, Lương: 314_400_000 },
  4: { Kiên: 304_900_000, Huyền: 408_074_000, Hương: 302_875_000, Lương: 314_000_000 },
};

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY' : '👀 DRY RUN — dùng --apply');
  console.log('Branch: 24 NCT (24) · Year: 2026 · Months: 1-4 · 4 sales\n');

  const ops: Array<{ docId: string; data: Record<string, unknown> }> = [];
  for (const month of [1, 2, 3, 4] as const) {
    console.log(`━━━ T${month} ━━━`);
    let total = 0;
    for (const sale of SALES) {
      const revenue = REV[month][sale.short];
      const period = `2026-${pad2(month)}`;
      const docId = `month_${period}_24_${sale.id}___total`;
      ops.push({
        docId,
        data: {
          unitPrice: revenue, branchId: '24', period, quantity: 1,
          updatedBy: 'admin@migration',
          saleId: sale.id, year: 2026, sourceSystem: 'manual',
          groupId: '__total', packageId: '__total',
          saleName: sale.name,
          groupName: '(Tổng)', packageName: '(Tổng theo sale)',
          revenue, periodType: 'month', month,
          createdBy: 'admin@migration',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      console.log(`  ${sale.short.padEnd(7)} ${fmt(revenue).padStart(15)}đ`);
      total += revenue;
    }
    console.log(`  ─ Tổng T${month}: ${fmt(total)}đ\n`);
  }

  console.log(`Tổng docs sẽ ghi: ${ops.length}`);

  if (APPLY) {
    const batch = db.batch();
    for (const op of ops) batch.set(db.collection('packageSales').doc(op.docId), op.data, { merge: true });
    await batch.commit();
    console.log(`✅ Wrote ${ops.length} docs`);
  } else {
    console.log('(dry run)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
