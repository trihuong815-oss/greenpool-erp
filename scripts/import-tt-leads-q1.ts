// Import lead data Thanh Trì tháng 1-4 năm 2026.
// Source mapping: FACE + HOTLINE → MKT · WALK-IN → Walk-in · RENEW → Renew · REFER → Referral · ĐI THỊ TRƯỜNG → Sale
// Phân bổ 5 sale đều. Dư lẻ ưu tiên Linh (Linh = ceil(rem/2), Quân = floor(rem/2)).
// Constraint: closed_per_sale ≤ leads_per_sale.
//
// Run:
//   npx --yes tsx scripts/import-tt-leads-q1.ts           # dry run
//   npx --yes tsx scripts/import-tt-leads-q1.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// Sales — 5 NV_SALE của Thanh Trì
const SALES = [
  { id: 'C84p9DcZlSMVm6jq046KisaMtn83', name: 'Nguyễn Thị Mai Anh',  isLinh: false, isQuan: false },
  { id: 'DE2pJjR5DQZ8w7ZsvKSfqvb2gaJ3', name: 'Lê Nhật Linh',         isLinh: true,  isQuan: false },
  { id: 'JzIeFZrq2sO61W2SXSdhJCdXP4h1', name: 'Nguyễn Hữu Quân',      isLinh: false, isQuan: true  },
  { id: 'MtoOFU7hMSXDxLQtyTvx0FK6zPQ2', name: 'Nguyễn Quỳnh Chi',     isLinh: false, isQuan: false },
  { id: 'bOehQMAGzme57x15sgnQ2Lx33Ma2', name: 'Vũ Thị Hương Giang',   isLinh: false, isQuan: false },
];

// Aggregated data per month per (system) source
// Source order: MKT (FACE+HOTLINE), Sale (ĐITT), Renew, Referral, Walk-in
type Source = 'MKT' | 'Sale' | 'Renew' | 'Referral' | 'Walk-in';
const MONTHLY: Record<number, Record<Source, { leads: number; closed: number }>> = {
  1: {
    MKT:        { leads: 64 + 10, closed: 33 + 1 },   // FACE + HOTLINE
    'Walk-in':  { leads: 45,      closed: 28 },
    Renew:      { leads: 203,     closed: 130 },
    Referral:   { leads: 38,      closed: 33 },
    Sale:       { leads: 82,      closed: 36 },        // ĐI THỊ TRƯỜNG
  },
  2: {
    MKT:        { leads: 35 + 12, closed: 10 + 9 },
    'Walk-in':  { leads: 21,      closed: 18 },
    Renew:      { leads: 57,      closed: 57 },
    Referral:   { leads: 155,     closed: 136 },
    Sale:       { leads: 0,       closed: 0 },
  },
  3: {
    MKT:        { leads: 233 + 41, closed: 53 + 41 },
    'Walk-in':  { leads: 56,       closed: 53 },
    Renew:      { leads: 116,      closed: 115 },
    Referral:   { leads: 445,      closed: 431 },
    Sale:       { leads: 250,      closed: 13 },
  },
  4: {
    MKT:        { leads: 388 + 32, closed: 36 + 5 },
    'Walk-in':  { leads: 82,       closed: 78 },
    Renew:      { leads: 15,       closed: 15 },
    Referral:   { leads: 595,      closed: 586 },
    Sale:       { leads: 72,       closed: 22 },
  },
};

const SOURCES_ORDER: Source[] = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'];

/** Chia tổng N cho 5 sale; dư lẻ ưu tiên Linh, Quân hưởng phần chẵn còn lại */
function distribute(total: number): number[] {
  const base = Math.floor(total / 5);
  const rem = total % 5;
  const linhExtra = Math.ceil(rem / 2);
  const quanExtra = Math.floor(rem / 2);
  return SALES.map((s) => base + (s.isLinh ? linhExtra : s.isQuan ? quanExtra : 0));
}

function pad2(n: number): string { return n.toString().padStart(2, '0'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY RUN — dùng --apply để ghi');
  console.log(`Branch: TT · Year: 2026 · Sales: ${SALES.length}`);
  console.log(`Mapping: FACE + HOTLINE → MKT · WALK-IN → Walk-in · RENEW → Renew · REFER → Referral · ĐI THỊ TRƯỜNG → Sale\n`);

  let totalDocs = 0;
  const operations: Array<{ docId: string; data: Record<string, unknown> }> = [];

  for (const month of [1, 2, 3, 4]) {
    const period = `2026-${pad2(month)}`;
    console.log(`━━━ Tháng ${month}/2026 ━━━`);
    let monthLeadsTotal = 0;
    let monthClosedTotal = 0;

    for (const source of SOURCES_ORDER) {
      const { leads, closed } = MONTHLY[month][source];
      if (leads === 0 && closed === 0) {
        console.log(`  ${source.padEnd(10)} skip (0 leads, 0 closed)`);
        continue;
      }
      const leadsBy = distribute(leads);
      const closedBy = distribute(closed);

      // Sanity: closed ≤ leads tổng
      if (closed > leads) {
        console.warn(`  ⚠ ${source} M${month}: closed (${closed}) > leads (${leads}) — bỏ qua`);
        continue;
      }

      console.log(`  ${source.padEnd(10)} L=${leads.toString().padStart(4)} C=${closed.toString().padStart(4)}  →  ${SALES.map((s, i) => `${s.name.split(' ').pop()}: ${leadsBy[i]}/${closedBy[i]}`).join(' · ')}`);

      for (let i = 0; i < SALES.length; i++) {
        const sale = SALES[i];
        const saleLeads = leadsBy[i];
        const saleClosed = closedBy[i];
        // Skip nếu cả 2 = 0 (không có gì để nhập)
        if (saleLeads === 0 && saleClosed === 0) continue;

        // Đảm bảo closed ≤ leads per sale (đã đảm bảo bởi algorithm, nhưng double-check)
        if (saleClosed > saleLeads) {
          console.warn(`    ⚠ ${sale.name}: closed ${saleClosed} > leads ${saleLeads} — skip`);
          continue;
        }

        const docId = `month_${period}_TT_${sale.id}_${source}`;
        const data = {
          period,
          periodType: 'month',
          year: 2026,
          month,
          branchId: 'TT',
          saleId: sale.id,
          saleName: sale.name,
          source,
          leads: saleLeads,
          closed: saleClosed,
          notClosed: saleLeads - saleClosed,
          sourceSystem: 'manual',
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'admin@migration',
        };
        operations.push({ docId, data });
      }
      monthLeadsTotal += leads;
      monthClosedTotal += closed;
    }
    console.log(`  ─ Tổng tháng ${month}: ${monthLeadsTotal} leads · ${monthClosedTotal} closed`);
    console.log();
  }

  console.log(`Tổng documents sẽ ghi: ${operations.length}`);

  if (APPLY) {
    // Batch writes (Firestore giới hạn 500/batch)
    const BATCH_SIZE = 400;
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = operations.slice(i, i + BATCH_SIZE);
      for (const op of chunk) {
        batch.set(db.collection('salesEntries').doc(op.docId), op.data);
      }
      await batch.commit();
      console.log(`  ✅ Wrote batch ${i / BATCH_SIZE + 1} (${chunk.length} docs)`);
      totalDocs += chunk.length;
    }
    console.log(`\n🎉 Hoàn tất: ${totalDocs} docs đã ghi vào salesEntries`);
  } else {
    console.log('\n(dry run — chưa ghi · dùng --apply để thực thi)');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
