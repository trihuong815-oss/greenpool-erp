// Import T5/2026 cho 24 NCT — full doanh số + leads + per-sale aggregate.
// Data anh gửi 2026-06-02:
//   - Sale Member (4 người): Kiên 493.255, Huyền 628.180, Hương 483.474, Lương 462.900 → 2.067.809.000
//   - Sale PT (6 người): tổng 386.000.000
//   - Leads MEMBER 5 nguồn: 929 leads / 610 closed
//
// Mapping (anh chốt 2026-06-02):
//   - Gói tháng/năm → Thẻ member bơi (cần tạo "Thẻ 2 năm")
//   - HBNC = Thang Long Kid (đã có)
//   - NLNC = Thang Long Aqua (cần tạo mới)
//   - PT BƠI = Học bơi PT (đã có)
//   - PT (386tr) = Gói PT Gym (tổng tháng)
//
// DRY-RUN: GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx tsx scripts/import-24-t5-2026.ts
// APPLY:   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx tsx scripts/import-24-t5-2026.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const BRANCH = '24';
const YEAR = 2026;
const MONTH = 5;
const PERIOD = '2026-05';

// ─── 4 Sale Member — priority phân dư leads (anh chốt T1-T4) ───
const SALES_MEMBER = [
  { id: '21tJyTuq27MTXiF1hq9phhd86V53', name: 'Nguyễn Thị Thanh Huyền',  short: 'Huyền', revT5: 628_180_000 },
  { id: 'eA4vyjj9opMNe6lSfhqdzsOYdHe2', name: 'Đoàn Trung Kiên',          short: 'Kiên',  revT5: 493_255_000 },
  { id: 'yHWyVnQTXYRtmIxdleMJ35jmi4y1', name: 'Nông Thị Thanh Hương',    short: 'Hương', revT5: 483_474_000 },
  { id: 'nnI9HmKzB0Ob5sskMPJ5CtPIE9I2', name: 'Đới Nhật Lương',          short: 'Lương', revT5: 462_900_000 },
];

// ─── 6 Sale PT ───
const SALES_PT = [
  { id: 'wE5WrCFVXlSVzubkToEt4DrJ3et1', name: 'Lò Thị Thới',         revT5: 114_750_000 },
  { id: 'c8rbqWxueWceGUfj2bYioHur3Jf1', name: 'Trần Thanh Tài',      revT5:           0 },
  { id: 'YNJbDRdVhiZga75nGceHH6VytQa2', name: 'Nguyễn Hồng Nhung',   revT5:  71_000_000 },
  { id: '66QOv3MnvWXVZaWIfWTABiTpEk63', name: 'Bùi Văn Hoạt',        revT5: 111_600_000 },
  { id: 'F6WmEN5dpRYYU4cyupH6IgmuHRg2', name: 'Hoàng Hồng Phúc',     revT5:  78_400_000 },
  { id: 'qlIQVeqIPGMm2QtlqWuiPwGSebE2', name: 'Nguyễn Hải Long',     revT5:  10_250_000 },
];

// ─── packageQuantities data (per group × package × T5) ───
// Format: [groupName, packageName, qty, revenue]
const PACKAGES: Array<[string, string, number, number]> = [
  // Thẻ member bơi (2N = mới)
  ['Thẻ member bơi', 'Thẻ 1 tháng',  42, 39_599_000],
  ['Thẻ member bơi', 'Thẻ 3 tháng',  69, 166_350_000],
  ['Thẻ member bơi', 'Thẻ 6 tháng',  14, 41_200_000],
  ['Thẻ member bơi', 'Thẻ 1 năm',    80, 391_150_000],
  ['Thẻ member bơi', 'Thẻ 2 năm',     2, 31_000_000],
  // Thẻ tích lượt
  ['Thẻ tích lượt', '30 lượt',  65, 176_750_000],
  ['Thẻ tích lượt', '60 lượt',  16, 80_760_000],
  ['Thẻ tích lượt', '200 lượt', 68, 510_950_000],
  // Thẻ học bơi (NLNC = Thang Long Aqua mới)
  ['Thẻ học bơi', 'Học bơi cơ bản người lớn', 108, 279_450_000],
  ['Thẻ học bơi', 'Học bơi cơ bản trẻ em',    143, 288_500_000],
  ['Thẻ học bơi', 'Học bơi Thang Long Kid',     5, 21_100_000],
  ['Thẻ học bơi', 'Học bơi Thang Long Aqua',    1,  5_000_000],
  ['Thẻ học bơi', 'Học bơi PT',                 6, 36_000_000],
  // Gói PT Gym — tổng PT tháng (6 sale, 5 sale có doanh thu, qty=5 đại diện)
  ['Gói PT Gym', 'PT Gym (gói tùy chỉnh)', 5, 386_000_000],
];

// ─── salesEntries (leads, anh gửi MEMBER only) ───
type Source = 'MKT' | 'Walk-in' | 'Renew' | 'Referral' | 'Sale';
// FACE + HOTLINE gộp = MKT (convention T1-T4)
const LEADS: Record<Source, { leads: number; closed: number }> = {
  MKT:        { leads: 366 + 19,  closed: 50 + 19 },     // FACE + HOTLINE
  'Walk-in':  { leads: 37,        closed: 37 },
  Renew:      { leads: 274,       closed: 271 },
  Referral:   { leads: 199,       closed: 199 },
  Sale:       { leads: 34,        closed: 34 },          // ĐI THỊ TRƯỜNG
};

// Checksum anh gửi
const CHECKSUM_LEADS = { totalLeads: 929, totalClosed: 610 };
const CHECKSUM_REV_MEMBER = 2_067_809_000;
const CHECKSUM_REV_PT = 386_000_000;

// ─── Helpers ───
function distribute(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rem = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY' : '👀 DRY-RUN');
  console.log(`Branch: 24 NCT · Period: ${PERIOD}\n`);

  // ─── A. Verify checksum trước khi ghi ───
  const sumMember = SALES_MEMBER.reduce((s, x) => s + x.revT5, 0);
  const sumPT = SALES_PT.reduce((s, x) => s + x.revT5, 0);
  const sumPackages = PACKAGES.filter(p => p[0] !== 'Gói PT Gym').reduce((s, p) => s + p[3], 0);
  const sumPTPackage = PACKAGES.filter(p => p[0] === 'Gói PT Gym').reduce((s, p) => s + p[3], 0);
  console.log('━━━ CHECKSUM ━━━');
  console.log(`Sum per-sale Member:   ${fmt(sumMember)} ${sumMember === CHECKSUM_REV_MEMBER ? '✓' : '✗ EXPECT ' + fmt(CHECKSUM_REV_MEMBER)}`);
  console.log(`Sum packages Member:   ${fmt(sumPackages)} ${sumPackages === CHECKSUM_REV_MEMBER ? '✓' : '✗'}`);
  console.log(`Sum per-sale PT:       ${fmt(sumPT)} ${sumPT === CHECKSUM_REV_PT ? '✓' : '✗ EXPECT ' + fmt(CHECKSUM_REV_PT)}`);
  console.log(`Sum package PT Gym:    ${fmt(sumPTPackage)} ${sumPTPackage === CHECKSUM_REV_PT ? '✓' : '✗'}`);
  const sumLeads = Object.values(LEADS).reduce((s, v) => s + v.leads, 0);
  const sumClosed = Object.values(LEADS).reduce((s, v) => s + v.closed, 0);
  console.log(`Leads total:           ${sumLeads} ${sumLeads === CHECKSUM_LEADS.totalLeads ? '✓' : '✗ EXPECT ' + CHECKSUM_LEADS.totalLeads}`);
  console.log(`Closed total:          ${sumClosed} ${sumClosed === CHECKSUM_LEADS.totalClosed ? '✓' : '✗ EXPECT ' + CHECKSUM_LEADS.totalClosed}`);
  const allOk =
    sumMember === CHECKSUM_REV_MEMBER &&
    sumPackages === CHECKSUM_REV_MEMBER &&
    sumPT === CHECKSUM_REV_PT &&
    sumPTPackage === CHECKSUM_REV_PT &&
    sumLeads === CHECKSUM_LEADS.totalLeads &&
    sumClosed === CHECKSUM_LEADS.totalClosed;
  if (!allOk) {
    console.error('\n⚠ CHECKSUM SAI — DỪNG, không ghi DB');
    process.exit(1);
  }
  console.log('✓ Tất cả checksum khớp\n');

  // ─── B. Lookup group + package IDs, tạo mới nếu cần ───
  console.log('━━━ Lookup groups + packages ━━━');
  const groupSnap = await db.collection('packageGroups').where('branchId','==',BRANCH).get();
  const groupMap = new Map<string, string>();      // groupName → groupId
  for (const d of groupSnap.docs) groupMap.set(d.data().name, d.id);
  const pkgSnap = await db.collection('packages').where('branchId','==',BRANCH).get();
  const pkgMap = new Map<string, string>();        // `${groupId}::${packageName}` → packageId
  for (const d of pkgSnap.docs) {
    const x = d.data();
    pkgMap.set(`${x.groupId}::${x.name}`, d.id);
  }

  // Tạo package mới nếu chưa có (Thẻ 2 năm + Thang Long Aqua)
  const ops: Array<{ ref: FirebaseFirestore.DocumentReference; data: any; label: string }> = [];
  const now = Timestamp.now();
  for (const [groupName, pkgName] of PACKAGES) {
    const gid = groupMap.get(groupName);
    if (!gid) throw new Error(`Group "${groupName}" không tồn tại cho 24 NCT!`);
    const key = `${gid}::${pkgName}`;
    if (pkgMap.has(key)) continue;
    const ref = db.collection('packages').doc();
    pkgMap.set(key, ref.id);
    ops.push({
      ref,
      data: {
        branchId: BRANCH, groupId: gid, groupName, name: pkgName,
        sortOrder: 0, active: true, defaultPrice: 0,
        createdBy: 'import-24-t5', updatedBy: 'import-24-t5',
        createdAt: now, updatedAt: now,
      },
      label: `+ NEW package "${pkgName}" trong "${groupName}"`,
    });
  }
  for (const op of ops) console.log(' ', op.label);
  if (ops.length === 0) console.log('  Không cần tạo package mới');

  // ─── C. Build packageQuantities ops ───
  console.log('\n━━━ packageQuantities ops ━━━');
  const qtyOps: Array<{ docId: string; data: any }> = [];
  for (const [groupName, pkgName, qty, revenue] of PACKAGES) {
    const gid = groupMap.get(groupName)!;
    const pid = pkgMap.get(`${gid}::${pkgName}`)!;
    const docId = `${YEAR}_${String(MONTH).padStart(2,'0')}_${BRANCH}_${pid}`;
    qtyOps.push({
      docId,
      data: {
        branchId: BRANCH, year: YEAR, month: MONTH, period: PERIOD,
        groupId: gid, groupName, packageId: pid, packageName: pkgName,
        quantity: qty, revenue,
        sourceSystem: 'manual',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'import-24-t5',
      },
    });
    console.log(`  ${groupName.padEnd(20)} | ${pkgName.padEnd(35)} | qty=${String(qty).padStart(4)} · rev=${fmt(revenue).padStart(15)}`);
  }

  // ─── D. Build packageSales __total per sale (Member + PT) ───
  console.log('\n━━━ packageSales __total ops (per-sale aggregate) ━━━');
  const salesOps: Array<{ docId: string; data: any }> = [];
  for (const s of SALES_MEMBER) {
    if (s.revT5 === 0) continue;
    salesOps.push({
      docId: `month_${PERIOD}_${BRANCH}_${s.id}___total`,
      data: {
        branchId: BRANCH, year: YEAR, month: MONTH, period: PERIOD, periodType: 'month',
        saleId: s.id, saleName: s.name,
        groupId: '__total', groupName: '(Tổng)',
        packageId: '__total', packageName: '(Tổng theo sale)',
        quantity: 1, unitPrice: s.revT5, revenue: s.revT5,
        sourceSystem: 'manual',
        createdBy: 'import-24-t5', updatedBy: 'import-24-t5',
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
    console.log(`  Member ${s.short.padEnd(8)} → ${fmt(s.revT5)}`);
  }
  for (const s of SALES_PT) {
    if (s.revT5 === 0) {
      console.log(`  PT     ${s.name.padEnd(28)} → 0 (skip)`);
      continue;
    }
    salesOps.push({
      docId: `month_${PERIOD}_${BRANCH}_${s.id}___total`,
      data: {
        branchId: BRANCH, year: YEAR, month: MONTH, period: PERIOD, periodType: 'month',
        saleId: s.id, saleName: s.name, saleRoleId: 'NV_SALE_PT',
        groupId: '__total', groupName: '(Tổng)',
        packageId: '__total', packageName: '(Tổng theo sale)',
        quantity: 1, unitPrice: s.revT5, revenue: s.revT5,
        sourceSystem: 'manual',
        createdBy: 'import-24-t5', updatedBy: 'import-24-t5',
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
    console.log(`  PT     ${s.name.padEnd(28)} → ${fmt(s.revT5)}`);
  }

  // ─── E. Build salesEntries ops (leads — Member only) ───
  console.log('\n━━━ salesEntries ops (leads MEMBER, chia đều 4 sale) ━━━');
  const leadOps: Array<{ docId: string; data: any }> = [];
  for (const [source, { leads, closed }] of Object.entries(LEADS) as Array<[Source, { leads: number; closed: number }]>) {
    if (leads === 0 && closed === 0) continue;
    const lBy = distribute(leads, SALES_MEMBER.length);
    const cBy = distribute(closed, SALES_MEMBER.length);
    const distLine = SALES_MEMBER.map((s, i) => `${s.short}:${lBy[i]}/${cBy[i]}`).join(' · ');
    console.log(`  ${source.padEnd(10)} L=${String(leads).padStart(4)} C=${String(closed).padStart(4)} → ${distLine}`);
    for (let i = 0; i < SALES_MEMBER.length; i++) {
      const s = SALES_MEMBER[i];
      if (lBy[i] === 0 && cBy[i] === 0) continue;
      if (cBy[i] > lBy[i]) console.warn(`    ⚠ ${s.short} ${source}: closed=${cBy[i]} > leads=${lBy[i]}`);
      leadOps.push({
        docId: `month_${PERIOD}_${BRANCH}_${s.id}_${source}`,
        data: {
          period: PERIOD, periodType: 'month',
          year: YEAR, month: MONTH, branchId: BRANCH,
          saleId: s.id, saleName: s.name,
          source,
          leads: lBy[i], closed: cBy[i], notClosed: lBy[i] - cBy[i],
          sourceSystem: 'manual',
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'import-24-t5',
        },
      });
    }
  }

  // ─── F. APPLY ───
  console.log(`\n━━━ TỔNG OPS: ${ops.length} package mới · ${qtyOps.length} packageQuantities · ${salesOps.length} packageSales __total · ${leadOps.length} salesEntries ━━━`);
  if (!APPLY) {
    console.log('\n(dry-run — KHÔNG ghi DB. Re-run với --apply để áp dụng.)');
    return;
  }

  // 1. Tạo packages mới
  if (ops.length > 0) {
    const b = db.batch();
    for (const op of ops) b.set(op.ref, op.data);
    await b.commit();
    console.log(`✓ Ghi ${ops.length} packages mới`);
  }
  // 2. packageQuantities
  const CHUNK = 400;
  for (let i = 0; i < qtyOps.length; i += CHUNK) {
    const b = db.batch();
    for (const op of qtyOps.slice(i, i + CHUNK)) b.set(db.collection('packageQuantities').doc(op.docId), op.data, { merge: true });
    await b.commit();
  }
  console.log(`✓ Ghi ${qtyOps.length} packageQuantities`);
  // 3. packageSales __total
  for (let i = 0; i < salesOps.length; i += CHUNK) {
    const b = db.batch();
    for (const op of salesOps.slice(i, i + CHUNK)) b.set(db.collection('packageSales').doc(op.docId), op.data, { merge: true });
    await b.commit();
  }
  console.log(`✓ Ghi ${salesOps.length} packageSales __total`);
  // 4. salesEntries
  for (let i = 0; i < leadOps.length; i += CHUNK) {
    const b = db.batch();
    for (const op of leadOps.slice(i, i + CHUNK)) b.set(db.collection('salesEntries').doc(op.docId), op.data, { merge: true });
    await b.commit();
  }
  console.log(`✓ Ghi ${leadOps.length} salesEntries`);

  // 5. Verify
  console.log('\n━━━ VERIFY sau APPLY ━━━');
  const verifyQ = await db.collection('packageQuantities')
    .where('branchId','==',BRANCH).where('year','==',YEAR).where('month','==',MONTH).get();
  let revSum = 0, qtySum = 0;
  for (const d of verifyQ.docs) { revSum += d.data().revenue ?? 0; qtySum += d.data().quantity ?? 0; }
  console.log(`packageQuantities T5: ${verifyQ.size} docs · qty=${qtySum} · rev=${fmt(revSum)}`);
  const verifyS = await db.collection('packageSales')
    .where('branchId','==',BRANCH).where('year','==',YEAR).where('month','==',MONTH).get();
  let salesSum = 0;
  for (const d of verifyS.docs) salesSum += d.data().revenue ?? 0;
  console.log(`packageSales T5:      ${verifyS.size} docs · rev=${fmt(salesSum)}`);
  const verifyE = await db.collection('salesEntries')
    .where('branchId','==',BRANCH).where('year','==',YEAR).where('month','==',MONTH).get();
  let leadsS = 0, closedS = 0;
  for (const d of verifyE.docs) { leadsS += d.data().leads ?? 0; closedS += d.data().closed ?? 0; }
  console.log(`salesEntries T5:      ${verifyE.size} docs · leads=${leadsS} · closed=${closedS}`);

  console.log('\n✅ DONE');
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
