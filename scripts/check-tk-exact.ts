import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();

const PKG_ORDER = [
  'Học bơi cơ bản trẻ em', 'Học bơi cơ bản người lớn',
  '15 lượt', '30 lượt', '60 lượt',
  'Thẻ 1 tháng', 'thẻ 2 tháng', 'Thẻ 3 tháng',
  'Thẻ 1 năm', 'Thẻ 2 năm',
  'Học bơi Thang Long Kid',
];

const EXPECT: Record<string, Record<number, { qty: number; rev: number }>> = {
  'Học bơi cơ bản trẻ em':     { 1:{qty:10, rev:15_600_000}, 2:{qty:10, rev:15_000_000}, 3:{qty:51, rev:62_320_000}, 4:{qty:47, rev:141_910_000} },
  'Học bơi cơ bản người lớn':  { 1:{qty:44, rev:74_440_000}, 2:{qty:56, rev:55_850_000}, 3:{qty:75, rev:152_681_000}, 4:{qty:54, rev:197_775_000} },
  '15 lượt':                   { 1:{qty:0, rev:0}, 2:{qty:1, rev:1_500_000}, 3:{qty:0, rev:0}, 4:{qty:5, rev:7_500_000} },
  '30 lượt':                   { 1:{qty:46, rev:115_200_000}, 2:{qty:1, rev:1_700_000}, 3:{qty:2, rev:5_700_000}, 4:{qty:13, rev:24_640_000} },
  '60 lượt':                   { 1:{qty:1, rev:2_900_000}, 2:{qty:31, rev:85_700_000}, 3:{qty:139, rev:356_200_000}, 4:{qty:224, rev:665_930_000} },
  'Thẻ 1 tháng':               { 1:{qty:77, rev:56_183_000}, 2:{qty:0, rev:700_000}, 3:{qty:103, rev:80_165_000}, 4:{qty:0, rev:1_400_000} },
  'thẻ 2 tháng':               { 1:{qty:0, rev:0}, 2:{qty:162, rev:156_900_000}, 3:{qty:0, rev:50_900_000}, 4:{qty:0, rev:0} },
  'Thẻ 3 tháng':               { 1:{qty:0, rev:0}, 2:{qty:0, rev:0}, 3:{qty:0, rev:0}, 4:{qty:40, rev:130_550_000} },
  'Thẻ 1 năm':                 { 1:{qty:29, rev:261_300_000}, 2:{qty:26, rev:200_800_000}, 3:{qty:187, rev:667_900_000}, 4:{qty:33, rev:398_970_000} },
  'Thẻ 2 năm':                 { 1:{qty:0, rev:0}, 2:{qty:3, rev:48_000_000}, 3:{qty:6, rev:25_200_000}, 4:{qty:1, rev:5_500_000} },
  'Học bơi Thang Long Kid':    { 1:{qty:1, rev:6_300_000}, 2:{qty:0, rev:0}, 3:{qty:3, rev:4_200_000}, 4:{qty:6, rev:8_400_000} },
};

function fmt(n: number): string { return n.toLocaleString('vi-VN').padStart(15); }

async function main() {
  // Fetch all docs cho TK 2026
  const snap = await db.collection('packageQuantities').where('branchId','==','TK').where('year','==',2026).get();
  const map: Record<string, Record<number, { qty: number; rev: number; pkgName: string }>> = {};
  for (const d of snap.docs) {
    const x = d.data();
    const n = x.packageName ?? '?';
    map[n] ??= {};
    map[n][x.month] = { qty: x.quantity ?? 0, rev: x.revenue ?? 0, pkgName: n };
  }

  console.log('═══════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`${'Gói (bảng anh)'.padEnd(28)} ${'T1 qty/rev'.padEnd(20)} ${'T2 qty/rev'.padEnd(20)} ${'T3 qty/rev'.padEnd(20)} ${'T4 qty/rev'.padEnd(20)}`);
  console.log('───────────────────────────────────────────────────────────────────────────────────────────');

  let allOk = true;
  const months = [1, 2, 3, 4];
  for (const pkgName of PKG_ORDER) {
    const expect = EXPECT[pkgName];
    const actual = map[pkgName] ?? {};
    const cells: string[] = [];
    for (const m of months) {
      const e = expect[m];
      const a = actual[m];
      if (e.qty === 0 && e.rev === 0) {
        if (!a) cells.push('  -/-              '); // expected nothing, none stored
        else { cells.push(`✗ ${a.qty}/${fmt(a.rev)}`); allOk = false; }
      } else {
        if (!a) { cells.push(`✗ MISSING`); allOk = false; }
        else if (a.qty === e.qty && a.rev === e.rev) cells.push(`✓ ${a.qty}/${fmt(a.rev)}`);
        else { cells.push(`✗ ${a.qty}/${fmt(a.rev)} (expect ${e.qty}/${fmt(e.rev)})`); allOk = false; }
      }
    }
    console.log(`${pkgName.padEnd(28)} ${cells[0].padEnd(20)} ${cells[1].padEnd(20)} ${cells[2].padEnd(20)} ${cells[3].padEnd(20)}`);
  }
  console.log('───────────────────────────────────────────────────────────────────────────────────────────');
  console.log(allOk ? '✅ TẤT CẢ KHỚP BẢNG ANH 100%' : '⚠ CÓ ENTRY KHÔNG KHỚP');
}
main().catch(console.error);
