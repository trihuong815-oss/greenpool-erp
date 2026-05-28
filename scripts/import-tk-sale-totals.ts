// Import per-sale total revenue cho Thuỵ Khuê (TK) T1-T4/2026.
// Pattern: packageSales với packageId='__total' (giống TT).
// Run:
//   npx --yes tsx scripts/import-tk-sale-totals.ts           # dry run
//   npx --yes tsx scripts/import-tk-sale-totals.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const SALES = [
  { id: 'U1qZ5Rmu1xVZUnBLFaHzlkKuHKr2', name: 'Nguyễn Thị Dung',     short: 'Dung' },
  { id: 'eJVGPWO0RKZMebdWWxrxsW3y1F82', name: 'Đồng Thị Lan Hương',  short: 'Hương' },
  { id: 'JEJfVKddpyW6WYKwMgwVHl2q3pE3', name: 'Nguyễn Văn Quân',     short: 'Quân' },
];

// Revenue per sale per month — VND
const REV: Record<number, Record<string, number>> = {
  1: { Dung: 210_795_000, Hương: 204_180_000, Quân: 116_948_000 },
  2: { Dung: 260_500_000, Hương: 220_300_000, Quân:  85_350_000 },
  3: { Dung: 555_919_000, Hương: 505_688_000, Quân: 345_659_000 },
  4: { Dung: 661_625_000, Hương: 466_485_000, Quân: 454_965_000 },
};

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY RUN — dùng --apply');
  console.log('Branch: TK · Year: 2026 · Months: 1-4 · 3 sales\n');

  const ops: Array<{ docId: string; data: Record<string, unknown> }> = [];

  for (const month of [1, 2, 3, 4] as const) {
    console.log(`━━━ Tháng ${month}/2026 ━━━`);
    let total = 0;
    for (const sale of SALES) {
      const revenue = REV[month][sale.short];
      const period = `2026-${pad2(month)}`;
      const docId = `month_${period}_TK_${sale.id}___total`;
      const data = {
        unitPrice: revenue,
        branchId: 'TK',
        period,
        quantity: 1,
        updatedBy: 'admin@migration',
        saleId: sale.id,
        year: 2026,
        sourceSystem: 'manual',
        groupId: '__total',
        packageId: '__total',
        saleName: sale.name,
        groupName: '(Tổng)',
        revenue,
        periodType: 'month',
        month,
        createdBy: 'admin@migration',
        packageName: '(Tổng theo sale)',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      ops.push({ docId, data });
      console.log(`  ${sale.short.padEnd(6)} ${fmt(revenue).padStart(15)}đ`);
      total += revenue;
    }
    console.log(`  ─ Tổng T${month}: ${fmt(total)}đ\n`);
  }

  console.log(`Tổng docs sẽ ghi: ${ops.length}`);

  if (APPLY) {
    const batch = db.batch();
    for (const op of ops) {
      batch.set(db.collection('packageSales').doc(op.docId), op.data, { merge: true });
    }
    await batch.commit();
    console.log(`✅ Wrote ${ops.length} docs`);
  } else {
    console.log('(dry run — chưa ghi)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
