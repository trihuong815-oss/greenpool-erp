// Import T1-T5/2026 cho TT (Thanh Trì) — full doanh số per gói + per sale + leads T5.
// Data anh gửi 2026-06-02 (3 bảng: gói × 5 tháng, per-sale × 5 tháng, nguồn T5).
//
// Checksum verified trước khi viết:
//   T1=404.565 · T2=367.897 · T3=1.064.625 · T4=2.215.345 · T5=3.002.220
//   Year=7.054.652.000 (sum per-sale = sum per-package) ✓
//
// DRY-RUN: GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx tsx scripts/import-tt-2026.ts
// APPLY:   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx tsx scripts/import-tt-2026.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const BRANCH = 'TT';
const YEAR = 2026;

// ─── 5 Sale Member TT — order = priority phân dư leads (theo bảng anh gửi) ───
const SALES = [
  { id: 'DE2pJjR5DQZ8w7ZsvKSfqvb2gaJ3', name: 'Lê Nhật Linh',           short: 'Linh',  rev: { 1: 103_909_000, 2: 86_624_000,  3: 271_080_000, 4: 501_395_000, 5: 731_125_000 } },
  { id: 'MtoOFU7hMSXDxLQtyTvx0FK6zPQ2', name: 'Nguyễn Quỳnh Chi',       short: 'Q.Chi', rev: { 1:  75_710_000, 2: 63_179_000,  3: 200_845_000, 4: 306_905_000, 5: 560_075_000 } },
  { id: 'JzIeFZrq2sO61W2SXSdhJCdXP4h1', name: 'Nguyễn Hữu Quân',        short: 'Quân',  rev: { 1:  72_097_000, 2: 71_331_000,  3: 164_350_000, 4: 503_275_000, 5: 608_275_000 } },
  { id: 'C84p9DcZlSMVm6jq046KisaMtn83', name: 'Nguyễn Thị Mai Anh',     short: 'M.Anh', rev: { 1:  78_199_000, 2: 84_230_000,  3: 264_460_000, 4: 453_195_000, 5: 700_885_000 } },
  { id: 'bOehQMAGzme57x15sgnQ2Lx33Ma2', name: 'Vũ Thị Hương Giang',     short: 'Giang', rev: { 1:  74_650_000, 2: 62_533_000,  3: 163_890_000, 4: 450_575_000, 5: 401_860_000 } },
];

// ─── Mapping tên gói (bảng anh gửi) → group + package trong DB TT ───
const PKG_MAP: Record<string, { group: string; name: string }> = {
  '1t':   { group: 'Thẻ member bơi', name: 'Thẻ 1 tháng' },
  '2t':   { group: 'Thẻ member bơi', name: 'thẻ 2 tháng' },     // lowercase chuẩn DB
  '3t':   { group: 'Thẻ member bơi', name: 'Thẻ 3 tháng' },
  '6t':   { group: 'Thẻ member bơi', name: 'Thẻ 6 tháng' },
  '1y':   { group: 'Thẻ member bơi', name: 'Thẻ 1 năm' },
  '2y':   { group: 'Thẻ member bơi', name: 'Thẻ 2 năm' },
  '30l':  { group: 'Thẻ tích lượt',  name: '30 lượt' },
  '60l':  { group: 'Thẻ tích lượt',  name: '60 lượt' },
  '120l': { group: 'Thẻ tích lượt',  name: '120 lượt' },
  '240l': { group: 'Thẻ tích lượt',  name: '240 lượt' },
  'hbcbte': { group: 'Thẻ học bơi', name: 'Học bơi cơ bản trẻ em' },
  'hbcbnl': { group: 'Thẻ học bơi', name: 'Học bơi cơ bản người lớn' },
  'clcnl':  { group: 'Thẻ học bơi', name: 'Học bơi chất lượng cao NL' },
  'clcte':  { group: 'Thẻ học bơi', name: 'Học bơi chất lượng cao TE' },
  'hbnc':   { group: 'Thẻ học bơi', name: 'Học bơi Thang Long Kid' },   // anh confirm HBNC = Kid
  'pt':     { group: 'Thẻ học bơi', name: 'Học bơi PT' },
};

// ─── DATA per gói × tháng: [qty, revenue] (0 thì skip) ───
type Cell = [qty: number, rev: number];
const DATA: Record<number, Record<string, Cell>> = {
  1: {
    '1t':     [7,    5_395_000],
    '2t':     [115,  115_000_000],
    '1y':     [2,    14_500_000],
    '30l':    [4,    6_650_000],
    '60l':    [2,    6_220_000],
    '120l':   [2,    13_300_000],
    'hbcbte': [35,   49_250_000],
    'hbcbnl': [83,   137_250_000],
    'clcnl':  [1,    5_500_000],
    'clcte':  [1,    5_000_000],
    'hbnc':   [10,   46_500_000],
  },
  2: {
    '1t':     [80,   35_987_000],
    '1y':     [30,   142_630_000],
    '30l':    [4,    15_200_000],
    '60l':    [2,    7_220_000],
    '120l':   [2,    32_385_000],
    'hbcbte': [35,   19_800_000],
    'hbcbnl': [83,   99_425_000],
    'hbnc':   [10,   15_250_000],
  },
  3: {
    '1t':     [182,  93_500_000],
    '3t':     [1,    2_500_000],
    '1y':     [35,   159_100_000],
    '30l':    [46,   68_100_000],
    '60l':    [12,   32_920_000],
    '120l':   [39,   114_905_000],
    '240l':   [16,   118_200_000],
    'hbcbte': [119,  126_500_000],
    'hbcbnl': [241,  289_300_000],
    'clcnl':  [1,    5_600_000],
    'hbnc':   [13,   42_800_000],
    'pt':     [4,    11_200_000],
  },
  4: {
    '1t':     [84,   81_200_000],
    '3t':     [7,    19_200_000],
    '1y':     [41,   261_540_000],
    '30l':    [114,  180_025_000],
    '60l':    [51,   183_680_000],
    '120l':   [51,   300_550_000],
    '240l':   [35,   408_100_000],
    'hbcbte': [132,  250_900_000],
    'hbcbnl': [191,  415_600_000],
    'clcnl':  [3,    14_900_000],
    'hbnc':   [27,   69_350_000],
    'pt':     [6,    30_300_000],
  },
  5: {
    '1t':     [81,   101_300_000],
    '3t':     [30,   61_750_000],
    '1y':     [23,   150_900_000],
    '30l':    [171,  279_200_000],
    '60l':    [60,   216_400_000],
    '120l':   [57,   314_900_000],
    '240l':   [80,   906_350_000],
    'hbcbte': [175,  412_850_000],
    'hbcbnl': [175,  476_200_000],
    'clcnl':  [1,    5_500_000],
    'clcte':  [4,    22_500_000],
    'hbnc':   [36,   50_170_000],
    'pt':     [3,    4_200_000],
  },
};

// ─── Leads T5 (anh chỉ gửi T5 — các tháng trước skip) ───
// FACE + HOTLINE = MKT (convention các cơ sở khác)
type Source = 'MKT' | 'Walk-in' | 'Renew' | 'Referral' | 'Sale';
const LEADS_T5: Record<Source, { leads: number; closed: number }> = {
  MKT:        { leads: 664 + 12, closed: 83 + 5 },          // FACE + HOTLINE
  'Walk-in':  { leads: 165,      closed: 136 },
  Renew:      { leads: 39,       closed: 39 },
  Referral:   { leads: 666,      closed: 647 },
  Sale:       { leads: 0,        closed: 0 },                // ĐI THỊ TRƯỜNG = 0
};
const CHECKSUM_LEADS = { totalLeads: 1546, totalClosed: 910 };

// ─── Checksum revenue per tháng (anh gửi tổng per-sale) ───
const CHECKSUM_REV: Record<number, number> = {
  1: 404_565_000,
  2: 367_897_000,
  3: 1_064_625_000,
  4: 2_215_345_000,
  5: 3_002_220_000,
};

// ─── Helpers ───
function distribute(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rem = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }
function pad2(n: number): string { return n.toString().padStart(2, '0'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY' : '👀 DRY-RUN');
  console.log('Branch: TT (Thanh Trì) · Year: ' + YEAR + ' · 5 sale Member\n');

  // ─── A. Verify checksum ───
  console.log('━━━ CHECKSUM (per-sale total vs per-package total) ━━━');
  let allOk = true;
  for (const m of [1, 2, 3, 4, 5]) {
    const sumSales = SALES.reduce((s, x) => s + (x.rev[m as 1] ?? 0), 0);
    const sumPkgs = Object.values(DATA[m]).reduce((s, [, r]) => s + r, 0);
    const expect = CHECKSUM_REV[m];
    const ok = sumSales === expect && sumPkgs === expect;
    if (!ok) allOk = false;
    console.log(`  T${m}: per-sale=${fmt(sumSales).padStart(13)} · per-pkg=${fmt(sumPkgs).padStart(13)} · expect=${fmt(expect).padStart(13)} ${ok ? '✓' : '✗'}`);
  }
  const sumLeads = Object.values(LEADS_T5).reduce((s, v) => s + v.leads, 0);
  const sumClosed = Object.values(LEADS_T5).reduce((s, v) => s + v.closed, 0);
  console.log(`  Leads T5: ${sumLeads}/${CHECKSUM_LEADS.totalLeads} ${sumLeads === CHECKSUM_LEADS.totalLeads ? '✓' : '✗'}`);
  console.log(`  Closed T5: ${sumClosed}/${CHECKSUM_LEADS.totalClosed} ${sumClosed === CHECKSUM_LEADS.totalClosed ? '✓' : '✗'}`);
  if (sumLeads !== CHECKSUM_LEADS.totalLeads || sumClosed !== CHECKSUM_LEADS.totalClosed) allOk = false;
  if (!allOk) {
    console.error('\n⚠ CHECKSUM SAI — DỪNG');
    process.exit(1);
  }
  console.log('✓ Tất cả checksum khớp\n');

  // ─── B. Lookup group + package IDs ───
  const groupSnap = await db.collection('packageGroups').where('branchId','==',BRANCH).get();
  const groupMap = new Map<string, string>();
  for (const d of groupSnap.docs) groupMap.set(d.data().name, d.id);
  const pkgSnap = await db.collection('packages').where('branchId','==',BRANCH).get();
  const pkgMap = new Map<string, string>();
  for (const d of pkgSnap.docs) {
    const x = d.data();
    pkgMap.set(`${x.groupId}::${x.name}`, d.id);
  }

  for (const [k, { group, name }] of Object.entries(PKG_MAP)) {
    const gid = groupMap.get(group);
    if (!gid) throw new Error(`Group "${group}" không tồn tại trong TT!`);
    const pid = pkgMap.get(`${gid}::${name}`);
    if (!pid) throw new Error(`Package "${name}" trong group "${group}" không tồn tại trong TT! (key=${k})`);
  }
  console.log('✓ Tất cả 16 packages map vào schema DB TT có sẵn (không cần tạo mới)\n');

  // ─── C. Build packageQuantities ops ───
  const qtyOps: Array<{ docId: string; data: any }> = [];
  console.log('━━━ packageQuantities ops ━━━');
  let totalQty = 0, totalRev = 0;
  for (const m of [1, 2, 3, 4, 5]) {
    let monthQty = 0, monthRev = 0;
    for (const [k, [qty, rev]] of Object.entries(DATA[m])) {
      const { group, name } = PKG_MAP[k];
      const gid = groupMap.get(group)!;
      const pid = pkgMap.get(`${gid}::${name}`)!;
      const docId = `${YEAR}_${pad2(m)}_${BRANCH}_${pid}`;
      qtyOps.push({
        docId,
        data: {
          branchId: BRANCH, year: YEAR, month: m, period: `${YEAR}-${pad2(m)}`,
          groupId: gid, groupName: group,
          packageId: pid, packageName: name,
          quantity: qty, revenue: rev,
          sourceSystem: 'manual',
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'import-tt-2026',
        },
      });
      monthQty += qty;
      monthRev += rev;
    }
    totalQty += monthQty; totalRev += monthRev;
    console.log(`  T${m}: ${Object.keys(DATA[m]).length} packages · qty=${monthQty} · rev=${fmt(monthRev)}`);
  }
  console.log(`  TỔNG NĂM: ${qtyOps.length} docs · qty=${totalQty} · rev=${fmt(totalRev)}`);

  // ─── D. Build packageSales __total ops (per-sale per-month) ───
  const salesOps: Array<{ docId: string; data: any }> = [];
  console.log('\n━━━ packageSales __total ops ━━━');
  for (const m of [1, 2, 3, 4, 5]) {
    for (const s of SALES) {
      const rev = s.rev[m as 1] ?? 0;
      if (rev === 0) continue;
      salesOps.push({
        docId: `month_${YEAR}-${pad2(m)}_${BRANCH}_${s.id}___total`,
        data: {
          branchId: BRANCH, year: YEAR, month: m, period: `${YEAR}-${pad2(m)}`, periodType: 'month',
          saleId: s.id, saleName: s.name,
          groupId: '__total', groupName: '(Tổng)',
          packageId: '__total', packageName: '(Tổng theo sale)',
          quantity: 1, unitPrice: rev, revenue: rev,
          sourceSystem: 'manual',
          createdBy: 'import-tt-2026', updatedBy: 'import-tt-2026',
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
    }
  }
  console.log(`  ${salesOps.length} docs (5 sale × 5 tháng = 25 max)`);

  // ─── E. Build salesEntries ops (T5 only — anh chỉ gửi T5) ───
  console.log('\n━━━ salesEntries ops (T5 leads, chia đều 5 sale) ━━━');
  const leadOps: Array<{ docId: string; data: any }> = [];
  for (const [source, { leads, closed }] of Object.entries(LEADS_T5) as Array<[Source, { leads: number; closed: number }]>) {
    if (leads === 0 && closed === 0) continue;
    const lBy = distribute(leads, SALES.length);
    const cBy = distribute(closed, SALES.length);
    const line = SALES.map((s, i) => `${s.short}:${lBy[i]}/${cBy[i]}`).join(' · ');
    console.log(`  ${source.padEnd(10)} L=${String(leads).padStart(4)} C=${String(closed).padStart(4)} → ${line}`);
    for (let i = 0; i < SALES.length; i++) {
      const s = SALES[i];
      if (lBy[i] === 0 && cBy[i] === 0) continue;
      if (cBy[i] > lBy[i]) console.warn(`    ⚠ ${s.short} ${source}: closed=${cBy[i]} > leads=${lBy[i]}`);
      leadOps.push({
        docId: `month_${YEAR}-05_${BRANCH}_${s.id}_${source}`,
        data: {
          period: `${YEAR}-05`, periodType: 'month',
          year: YEAR, month: 5, branchId: BRANCH,
          saleId: s.id, saleName: s.name,
          source,
          leads: lBy[i], closed: cBy[i], notClosed: lBy[i] - cBy[i],
          sourceSystem: 'manual',
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'import-tt-2026',
        },
      });
    }
  }

  console.log(`\n━━━ TỔNG OPS: ${qtyOps.length} packageQuantities · ${salesOps.length} packageSales · ${leadOps.length} salesEntries ━━━`);

  if (!APPLY) {
    console.log('\n(dry-run — KHÔNG ghi DB. Re-run với --apply để áp dụng.)');
    return;
  }

  // ─── F. APPLY ───
  const CHUNK = 400;
  for (let i = 0; i < qtyOps.length; i += CHUNK) {
    const b = db.batch();
    for (const op of qtyOps.slice(i, i + CHUNK)) b.set(db.collection('packageQuantities').doc(op.docId), op.data, { merge: true });
    await b.commit();
  }
  console.log(`✓ Ghi ${qtyOps.length} packageQuantities`);
  for (let i = 0; i < salesOps.length; i += CHUNK) {
    const b = db.batch();
    for (const op of salesOps.slice(i, i + CHUNK)) b.set(db.collection('packageSales').doc(op.docId), op.data, { merge: true });
    await b.commit();
  }
  console.log(`✓ Ghi ${salesOps.length} packageSales __total`);
  for (let i = 0; i < leadOps.length; i += CHUNK) {
    const b = db.batch();
    for (const op of leadOps.slice(i, i + CHUNK)) b.set(db.collection('salesEntries').doc(op.docId), op.data, { merge: true });
    await b.commit();
  }
  console.log(`✓ Ghi ${leadOps.length} salesEntries`);

  // ─── G. Verify ───
  console.log('\n━━━ VERIFY ━━━');
  const verifyQ = await db.collection('packageQuantities').where('branchId','==',BRANCH).where('year','==',YEAR).get();
  let qSum = 0;
  const qByMonth: Record<number, number> = {};
  for (const d of verifyQ.docs) {
    const x = d.data();
    qSum += x.revenue ?? 0;
    qByMonth[x.month] = (qByMonth[x.month] ?? 0) + (x.revenue ?? 0);
  }
  for (const m of [1,2,3,4,5]) console.log(`  T${m}: ${fmt(qByMonth[m] ?? 0).padStart(15)} ${qByMonth[m] === CHECKSUM_REV[m] ? '✓' : '✗'}`);
  console.log(`  YEAR: ${fmt(qSum)} ${qSum === Object.values(CHECKSUM_REV).reduce((s,v)=>s+v,0) ? '✓' : '✗'}`);

  const verifyS = await db.collection('packageSales').where('branchId','==',BRANCH).where('year','==',YEAR).get();
  let sSum = 0; for (const d of verifyS.docs) sSum += d.data().revenue ?? 0;
  console.log(`  packageSales year sum: ${fmt(sSum)} ${sSum === qSum ? '✓ KHỚP Q' : '✗'}`);

  const verifyE = await db.collection('salesEntries').where('branchId','==',BRANCH).where('year','==',YEAR).get();
  let l = 0, c = 0; for (const d of verifyE.docs) { l += d.data().leads ?? 0; c += d.data().closed ?? 0; }
  console.log(`  salesEntries T5: ${verifyE.size} docs · leads=${l}/${CHECKSUM_LEADS.totalLeads} · closed=${c}/${CHECKSUM_LEADS.totalClosed}`);

  console.log('\n✅ DONE');
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
