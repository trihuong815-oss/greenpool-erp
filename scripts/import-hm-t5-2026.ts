// Import Hoàng Mai (HM) tháng 5/2026 — 3 collections:
//   1. packageSales (per sale __total) — doanh số 5 sale
//   2. packageQuantities (per package) — SL + DT theo gói
//   3. salesEntries (per sale × source) — leads chia đều 5 sale (Hoa first)
//
// Anh chốt 2026-06-04:
//   - "tt nốt": SL ĐÃ ghi tháng trước → tháng này SL = số đầu - tt nốt; DT full
//   - HOTLINE → gộp vào MKT
//   - "90;120 lượt" → gộp vào 120 lượt
//   - HBNC gộp tất vào Thang Long Kid
//   - Bảo lưu + Chuyển nhượng → KHÔNG nhập
//   - Lead chia đều 5 sale, dư ưu tiên Hoa
//
// Run dry: GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx tsx scripts/import-hm-t5-2026.ts
// Run apply: ... npx tsx scripts/import-hm-t5-2026.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./secrets/firebase-admin-sa.json', 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const BRANCH = 'HM';
const YEAR = 2026;
const MONTH = 5;
const PERIOD = '2026-05';

// ─── Sale staff HM (Hoa first cho ưu tiên dư) ───
const SALES = [
  { id: '0cpQyEfwtmRd5IRBT0KaeG7Q6W23', name: 'Ngô Thị Hoa',       short: 'Hoa',   revT5: 1_500_090_000 },
  { id: 'mvzmQBSK1XW4v0QZ7cHAYvncPx13', name: 'Ngọc Thị Linh',     short: 'Linh',  revT5: 1_029_326_000 },
  { id: 'a34JerXCxCh8g3zvWLYScteiZxJ2', name: 'Nguyễn Thị Thúy',   short: 'Thúy',  revT5:   769_940_000 },
  { id: 'VRgOZpfxjJU5Etn1QPsbWWLcf3A2', name: 'Đoàn Công Duy',     short: 'Duy',   revT5:   860_337_000 },
  { id: 'xhJIOyYlu3SeNMexIqQLOcTsrPN2', name: 'Nguyễn Phương Nam', short: 'Nam',   revT5:   750_156_000 },
];
const CHECKSUM_REV = 4_909_849_000;

// ─── Packages T5 (qty đã trừ tt nốt, rev full) ───
// Format: groupName, packageName, qty, rev
const PACKAGES_DATA = [
  // I. Thẻ tháng (group "Thẻ member bơi" + 1 dạng "Thẻ 2 tháng" thuộc group undefined)
  { group: 'Thẻ member bơi', name: 'Thẻ 1 tháng',  qty: 42, rev:  57_500_000 },
  { group: 'Thẻ member bơi', name: 'Thẻ 3 tháng',  qty:  5, rev:  15_500_000 },
  { group: 'Thẻ member bơi', name: 'Thẻ 1 năm',    qty: 52, rev: 396_500_000 }, // 56-4 tt nốt
  // II. Tích lượt (group "Thẻ tích lượt")
  { group: 'Thẻ tích lượt',  name: '30 lượt',      qty: 257, rev:    551_500_000 }, // 261-4 tt nốt
  { group: 'Thẻ tích lượt',  name: '60 lượt',      qty:  80, rev:    329_825_000 }, // 84-4 tt nốt
  { group: 'Thẻ tích lượt',  name: '120 lượt',     qty: 200, rev:  1_421_850_000 }, // 227-27 tt nốt, gộp 90;120 vào 120
  // III. Học bơi (group "Thẻ học bơi")
  { group: 'Thẻ học bơi',    name: 'Học bơi cơ bản trẻ em',  qty: 323, rev: 776_060_000 }, // 329-6 tt nốt
  { group: 'Thẻ học bơi',    name: 'Học bơi cơ bản người lớn', qty: 263, rev: 777_200_000 }, // 274-11 tt nốt
  { group: 'Thẻ học bơi',    name: 'Học bơi Thang Long Kid', qty: 204, rev: 562_414_000 }, // 211-7 tt nốt — gộp HBNC vào Kid
  { group: 'Thẻ học bơi',    name: 'Học bơi PT',             qty:  13, rev:  21_500_000 },
];
const CHECKSUM_PKG_REV = PACKAGES_DATA.reduce((s, p) => s + p.rev, 0);

// ─── Leads (source mapping: HOTLINE → MKT; FACE → MKT; WALK-IN → Walk-in; RENEW → Renew; REFER → Referral; ĐI THỊ TRƯỜNG → Sale) ───
const LEADS = {
  MKT:        { leads: 429 + 109, closed: 70 + 16 }, // FACE + HOTLINE
  'Walk-in':  { leads: 205,       closed: 88 },
  Renew:      { leads: 951,       closed: 868 },
  Referral:   { leads: 337,       closed: 263 },
  Sale:       { leads: 109,       closed: 63 },
} as const;
type Source = keyof typeof LEADS;
const CHECKSUM_LEADS = Object.values(LEADS).reduce((s, v) => ({ leads: s.leads + v.leads, closed: s.closed + v.closed }), { leads: 0, closed: 0 });

// ─── Helpers ───
function distribute(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rem = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY-RUN mode');
  console.log(`Branch: ${BRANCH} · Period: ${PERIOD}\n`);

  // ─── A. Verify checksums data ───
  const saleRevSum = SALES.reduce((s, x) => s + x.revT5, 0);
  console.log('━━━ Checksums ━━━');
  console.log(`Doanh số 5 sale = ${fmt(saleRevSum)} · target ${fmt(CHECKSUM_REV)} · ${saleRevSum === CHECKSUM_REV ? '✓' : '❌'}`);
  console.log(`Doanh thu packages = ${fmt(CHECKSUM_PKG_REV)} · cần match ${fmt(CHECKSUM_REV)} · ${CHECKSUM_PKG_REV === CHECKSUM_REV ? '✓' : '❌'}`);
  console.log(`Leads tổng = ${CHECKSUM_LEADS.leads} · target 2140 · ${CHECKSUM_LEADS.leads === 2140 ? '✓' : '❌'}`);
  console.log(`Closed tổng = ${CHECKSUM_LEADS.closed} · target 1368 · ${CHECKSUM_LEADS.closed === 1368 ? '✓' : '❌'}`);
  if (saleRevSum !== CHECKSUM_REV || CHECKSUM_PKG_REV !== CHECKSUM_REV) {
    console.error('\n❌ Checksum FAIL — dừng để tránh sai sót');
    process.exit(1);
  }
  console.log();

  // ─── B. Build package map (groupName + packageName → packageId + groupId) ───
  const pkgsSnap = await db.collection('packages').where('branchId', '==', BRANCH).get();
  const grpsSnap = await db.collection('packageGroups').where('branchId', '==', BRANCH).get();
  const grpName = new Map<string, string>();
  for (const g of grpsSnap.docs) grpName.set(g.id, g.data().name);
  const pkgMap = new Map<string, { pkgId: string; gid: string; gname: string }>();
  for (const p of pkgsSnap.docs) {
    const x = p.data();
    const gname = grpName.get(x.groupId) ?? '?';
    pkgMap.set(`${gname}::${x.name}`, { pkgId: p.id, gid: x.groupId, gname });
  }
  console.log(`Loaded ${pkgsSnap.size} packages · ${grpsSnap.size} groups`);

  // ─── C. Build packageQuantities ops ───
  console.log('\n━━━ packageQuantities ops ━━━');
  const qtyOps: Array<{ docId: string; data: any }> = [];
  for (const p of PACKAGES_DATA) {
    const found = pkgMap.get(`${p.group}::${p.name}`);
    if (!found) {
      console.error(`❌ Package KHÔNG TÌM THẤY: ${p.group} :: ${p.name}`);
      process.exit(1);
    }
    qtyOps.push({
      docId: `${YEAR}_${String(MONTH).padStart(2, '0')}_${BRANCH}_${found.pkgId}`,
      data: {
        branchId: BRANCH, year: YEAR, month: MONTH, period: PERIOD,
        groupId: found.gid, groupName: found.gname,
        packageId: found.pkgId, packageName: p.name,
        quantity: p.qty, revenue: p.rev,
        sourceSystem: 'manual',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'import-hm-t5',
      },
    });
    console.log(`  ${found.gname.padEnd(20)} | ${p.name.padEnd(30)} | qty=${String(p.qty).padStart(4)} · rev=${fmt(p.rev).padStart(15)}`);
  }

  // ─── D. Build packageSales __total per sale ───
  console.log('\n━━━ packageSales __total ops ━━━');
  const salesOps: Array<{ docId: string; data: any }> = [];
  for (const s of SALES) {
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
        createdBy: 'import-hm-t5', updatedBy: 'import-hm-t5',
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
    console.log(`  ${s.short.padEnd(6)} → ${fmt(s.revT5)}`);
  }

  // ─── E. Build salesEntries (leads chia đều 5 sale, dư ưu tiên Hoa first) ───
  console.log('\n━━━ salesEntries ops (leads chia đều) ━━━');
  const leadOps: Array<{ docId: string; data: any }> = [];
  for (const [source, { leads, closed }] of Object.entries(LEADS) as Array<[Source, { leads: number; closed: number }]>) {
    if (leads === 0 && closed === 0) continue;
    const lBy = distribute(leads, SALES.length);
    const cBy = distribute(closed, SALES.length);
    const distLine = SALES.map((s, i) => `${s.short}:${lBy[i]}/${cBy[i]}`).join(' · ');
    console.log(`  ${source.padEnd(10)} L=${String(leads).padStart(4)} C=${String(closed).padStart(4)} → ${distLine}`);
    for (let i = 0; i < SALES.length; i++) {
      const s = SALES[i];
      if (lBy[i] === 0 && cBy[i] === 0) continue;
      if (cBy[i] > lBy[i]) console.warn(`    ⚠ ${s.short} ${source}: closed=${cBy[i]} > leads=${lBy[i]} — sẽ giới hạn closed=leads`);
      const finalClosed = Math.min(cBy[i], lBy[i]);
      leadOps.push({
        docId: `month_${PERIOD}_${BRANCH}_${s.id}_${source}`,
        data: {
          period: PERIOD, periodType: 'month',
          year: YEAR, month: MONTH, branchId: BRANCH,
          saleId: s.id, saleName: s.name,
          source,
          leads: lBy[i], closed: finalClosed, notClosed: lBy[i] - finalClosed,
          sourceSystem: 'manual',
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'import-hm-t5',
        },
      });
    }
  }

  console.log(`\n━━━ TỔNG OPS: ${qtyOps.length} packageQuantities · ${salesOps.length} packageSales · ${leadOps.length} salesEntries ━━━`);

  if (!APPLY) {
    console.log('\n👀 Dry-run xong. Chạy --apply để ghi.');
    return;
  }

  // ─── F. Write ───
  console.log('\n━━━ APPLY ━━━');
  const CHUNK = 400;
  // 1. packageQuantities
  for (let i = 0; i < qtyOps.length; i += CHUNK) {
    const b = db.batch();
    for (const op of qtyOps.slice(i, i + CHUNK)) b.set(db.collection('packageQuantities').doc(op.docId), op.data, { merge: true });
    await b.commit();
  }
  console.log(`✓ Ghi ${qtyOps.length} packageQuantities`);
  // 2. packageSales
  for (let i = 0; i < salesOps.length; i += CHUNK) {
    const b = db.batch();
    for (const op of salesOps.slice(i, i + CHUNK)) b.set(db.collection('packageSales').doc(op.docId), op.data, { merge: true });
    await b.commit();
  }
  console.log(`✓ Ghi ${salesOps.length} packageSales __total`);
  // 3. salesEntries
  for (let i = 0; i < leadOps.length; i += CHUNK) {
    const b = db.batch();
    for (const op of leadOps.slice(i, i + CHUNK)) b.set(db.collection('salesEntries').doc(op.docId), op.data, { merge: true });
    await b.commit();
  }
  console.log(`✓ Ghi ${leadOps.length} salesEntries`);

  // ─── G. Verify ───
  console.log('\n━━━ VERIFY ━━━');
  const vQ = await db.collection('packageQuantities')
    .where('branchId', '==', BRANCH).where('year', '==', YEAR).where('month', '==', MONTH).get();
  let revQ = 0, qtyQ = 0;
  for (const d of vQ.docs) { revQ += d.data().revenue ?? 0; qtyQ += d.data().quantity ?? 0; }
  console.log(`packageQuantities: ${vQ.size} docs · qty=${qtyQ} · rev=${fmt(revQ)}`);

  const vS = await db.collection('packageSales')
    .where('branchId', '==', BRANCH).where('year', '==', YEAR).where('month', '==', MONTH).get();
  let revS = 0;
  for (const d of vS.docs) revS += d.data().revenue ?? 0;
  console.log(`packageSales:      ${vS.size} docs · rev=${fmt(revS)}`);

  const vE = await db.collection('salesEntries')
    .where('branchId', '==', BRANCH).where('year', '==', YEAR).where('month', '==', MONTH).get();
  let leadsE = 0, closedE = 0;
  for (const d of vE.docs) { leadsE += d.data().leads ?? 0; closedE += d.data().closed ?? 0; }
  console.log(`salesEntries:      ${vE.size} docs · leads=${leadsE} · closed=${closedE}`);

  // Invariant: revQ === revS === CHECKSUM_REV
  console.log();
  console.log(`Invariant rev: packages=${fmt(revQ)} sales=${fmt(revS)} target=${fmt(CHECKSUM_REV)} → ${revQ === CHECKSUM_REV && revS === CHECKSUM_REV ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Invariant leads: db=${leadsE} target=2140 → ${leadsE === 2140 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Invariant closed: db=${closedE} target=1368 → ${closedE === 1368 ? '✅ PASS' : '❌ FAIL'}`);

  console.log('\n✅ DONE');
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
