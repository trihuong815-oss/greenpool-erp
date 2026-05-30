// Import salesEntries (lead per source × month) cho 4 sale Member 24 NCT T1-T4/2026.
// Sale PT chưa có data lead (anh nói "sale PT chưa có").
//
// Source mapping (theo convention HM):
//   FACE + HOTLINE → MKT
//   WALK-IN → Walk-in
//   RENEW → Renew
//   REFER → Referral
//   ĐI THỊ TRƯỜNG → Sale
//
// Chia đều cho 4 sale Member. Số dư phân theo priority [Huyền, Kiên, Hương, Lương]
// (Huyền lấy dư đầu tiên — anh chốt 2026-05-30).
//
// DRY-RUN:  GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-24-leads-2026.ts
// APPLY:    GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-24-leads-2026.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// 4 sale Member theo priority phân dư (Huyền → Kiên → Hương → Lương)
const SALES = [
  { id: '21tJyTuq27MTXiF1hq9phhd86V53', name: 'Nguyễn Thị Thanh Huyền',  short: 'Huyền' },
  { id: 'eA4vyjj9opMNe6lSfhqdzsOYdHe2', name: 'Đoàn Trung Kiên',          short: 'Kiên'  },
  { id: 'yHWyVnQTXYRtmIxdleMJ35jmi4y1', name: 'Nông Thị Thanh Hương',    short: 'Hương' },
  { id: 'nnI9HmKzB0Ob5sskMPJ5CtPIE9I2', name: 'Đới Nhật Lương',          short: 'Lương' },
];

type SourceCode = 'MKT' | 'Walk-in' | 'Renew' | 'Referral' | 'Sale';
const SOURCES_ORDER: SourceCode[] = ['MKT', 'Walk-in', 'Renew', 'Referral', 'Sale'];

// Data anh gửi (FACE+HOTLINE đã gộp = MKT). Format: { leads, closed }
const LEADS: Record<number, Record<SourceCode, { leads: number; closed: number }>> = {
  1: {
    MKT:        { leads: 76 + 6,  closed: 23 + 6 },    // FACE + HOTLINE
    'Walk-in':  { leads: 11,      closed: 11 },
    Renew:      { leads: 84,      closed: 84 },
    Referral:   { leads: 90,      closed: 90 },
    Sale:       { leads:  9,      closed:  8 },        // ĐI THỊ TRƯỜNG
  },
  2: {
    MKT:        { leads: 27 + 5,  closed:  9 + 5 },
    'Walk-in':  { leads:  8,      closed:  8 },
    Renew:      { leads: 62,      closed: 62 },
    Referral:   { leads: 68,      closed: 68 },
    Sale:       { leads:  3,      closed:  3 },
  },
  3: {
    MKT:        { leads: 178 + 19, closed: 52 + 15 },
    'Walk-in':  { leads: 36,       closed: 36 },
    Renew:      { leads: 175,      closed: 175 },
    Referral:   { leads: 226,      closed: 226 },
    Sale:       { leads: 36,       closed: 35 },
  },
  4: {
    MKT:        { leads: 222 + 10, closed: 32 + 7 },
    'Walk-in':  { leads: 27,       closed: 27 },
    Renew:      { leads: 170,      closed: 170 },
    Referral:   { leads: 114,      closed: 111 },
    Sale:       { leads: 19,       closed: 19 },
  },
};

// Checksum: tổng leads/closed mỗi tháng (theo bảng anh gửi cột TỔNG)
const CHECKSUM: Record<number, { totalLeads: number; totalClosed: number }> = {
  1: { totalLeads: 276, totalClosed: 222 },
  2: { totalLeads: 173, totalClosed: 155 },
  3: { totalLeads: 670, totalClosed: 539 },
  4: { totalLeads: 562, totalClosed: 366 },
};

function distribute(total: number): number[] {
  const n = SALES.length;
  const base = Math.floor(total / n);
  const rem = total % n;
  return SALES.map((_, i) => base + (i < rem ? 1 : 0));   // priority: Huyền, Kiên, Hương, Lương
}

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY' : '👀 DRY-RUN');
  console.log('Branch: 24 NCT · Year: 2026 · 4 Sale Member (Huyền/Kiên/Hương/Lương)\n');

  const ops: Array<{ docId: string; data: Record<string, unknown> }> = [];
  let allOk = true;

  for (const month of [1, 2, 3, 4] as const) {
    console.log(`━━━ T${month} ━━━`);
    const period = `2026-${pad2(month)}`;
    let mLeads = 0, mClosed = 0;
    for (const source of SOURCES_ORDER) {
      const { leads, closed } = LEADS[month][source];
      if (leads === 0 && closed === 0) continue;
      const lBy = distribute(leads);
      const cBy = distribute(closed);
      mLeads += leads;
      mClosed += closed;
      const distLine = SALES.map((s, i) => `${s.short}:${lBy[i]}/${cBy[i]}`).join(' · ');
      console.log(`  ${source.padEnd(10)} L=${fmt(leads).padStart(4)} C=${fmt(closed).padStart(4)}  →  ${distLine}`);
      for (let i = 0; i < SALES.length; i++) {
        const sale = SALES[i];
        const saleLeads = lBy[i], saleClosed = cBy[i];
        if (saleLeads === 0 && saleClosed === 0) continue;
        if (saleClosed > saleLeads) {
          console.warn(`    ⚠ ${sale.name} ${source}: closed=${saleClosed} > leads=${saleLeads}`);
        }
        const docId = `month_${period}_24_${sale.id}_${source}`;
        ops.push({
          docId,
          data: {
            period, periodType: 'month',
            year: 2026, month, branchId: '24',
            saleId: sale.id, saleName: sale.name,
            source,
            leads: saleLeads, closed: saleClosed, notClosed: saleLeads - saleClosed,
            sourceSystem: 'manual',
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: 'admin@migration',
          },
        });
      }
    }
    const chk = CHECKSUM[month];
    const okL = mLeads === chk.totalLeads ? '✓' : `✗ (${mLeads} vs ${chk.totalLeads})`;
    const okC = mClosed === chk.totalClosed ? '✓' : `✗ (${mClosed} vs ${chk.totalClosed})`;
    console.log(`  ─ T${month}: tổng L=${mLeads} [${okL}] · C=${mClosed} [${okC}]\n`);
    if (mLeads !== chk.totalLeads || mClosed !== chk.totalClosed) allOk = false;
  }

  console.log(`Tổng docs: ${ops.length}`);
  if (!allOk) {
    console.error('⚠ CHECKSUM SAI — DỪNG');
    process.exit(1);
  }
  console.log('✓ Tất cả checksum (tổng leads + tổng closed) khớp với bảng anh gửi.');

  if (APPLY) {
    const batch = db.batch();
    for (const op of ops) batch.set(db.collection('salesEntries').doc(op.docId), op.data, { merge: true });
    await batch.commit();
    console.log(`\n✅ Wrote ${ops.length} docs vào salesEntries`);
  } else {
    console.log('\n(dry-run)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
