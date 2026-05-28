// Import per-sale total revenue cho Thanh Trì T2-T4/2026.
// Pattern packageSales: packageId='__total', groupId='__total' — mỗi sale 1 doc / tháng.
// Doc ID: `month_2026-MM_TT_{saleId}___total` (giống T1 user đã nhập).
//
// Run:
//   npx --yes tsx scripts/import-tt-sale-totals-t2-4.ts           # dry run
//   npx --yes tsx scripts/import-tt-sale-totals-t2-4.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const SALES = [
  { id: 'C84p9DcZlSMVm6jq046KisaMtn83', name: 'Nguyễn Thị Mai Anh', short: 'M.Anh' },
  { id: 'DE2pJjR5DQZ8w7ZsvKSfqvb2gaJ3', name: 'Lê Nhật Linh',        short: 'Linh' },
  { id: 'JzIeFZrq2sO61W2SXSdhJCdXP4h1', name: 'Nguyễn Hữu Quân',     short: 'Quân' },
  { id: 'MtoOFU7hMSXDxLQtyTvx0FK6zPQ2', name: 'Nguyễn Quỳnh Chi',    short: 'Q.Chi' },
  { id: 'bOehQMAGzme57x15sgnQ2Lx33Ma2', name: 'Vũ Thị Hương Giang',  short: 'Giang' },
];

// Revenue per sale per month (từ bảng user)
const REV: Record<number, Record<string, number>> = {
  2: { 'M.Anh':  84_230_000, Linh:  86_624_000, Quân:  71_331_000, 'Q.Chi':  63_179_000, Giang:  62_533_000 },
  3: { 'M.Anh': 264_460_000, Linh: 271_080_000, Quân: 164_350_000, 'Q.Chi': 200_845_000, Giang: 163_890_000 },
  4: { 'M.Anh': 453_195_000, Linh: 501_395_000, Quân: 503_275_000, 'Q.Chi': 306_905_000, Giang: 450_575_000 },
};

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY RUN — dùng --apply');
  console.log('Branch: TT · Year: 2026 · Months: 2, 3, 4 · 5 sales\n');

  const ops: Array<{ docId: string; data: Record<string, unknown> }> = [];

  for (const month of [2, 3, 4] as const) {
    console.log(`━━━ Tháng ${month}/2026 ━━━`);
    let total = 0;
    for (const sale of SALES) {
      const revenue = REV[month][sale.short];
      const period = `2026-${pad2(month)}`;
      const docId = `month_${period}_TT_${sale.id}___total`;
      const data = {
        unitPrice: revenue,
        branchId: 'TT',
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
      console.log(`  ${sale.short.padEnd(7)} ${fmt(revenue).padStart(15)}đ`);
      total += revenue;
    }
    console.log(`  ─ Tổng tháng ${month}: ${fmt(total)}đ\n`);
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
