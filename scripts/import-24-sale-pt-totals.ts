// Import per-sale __total revenue cho 6 Sale PT của cơ sở 24 NCT, T1-T4/2026.
// Pattern theo scripts/import-24-sale-totals.ts. Skip cell empty (không tạo doc revenue=0).
// Lookup uid bằng email convention seed-sale-pt-24nct.ts (.24.pt@greenpool.vn).
//
// DRY-RUN:  GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-24-sale-pt-totals.ts
// APPLY:    GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-24-sale-pt-totals.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) initializeApp({
  credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
});
const db = getFirestore();
const auth = getAuth();
const APPLY = process.argv.includes('--apply');

function slugify(name: string): string {
  return name
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
}
function emailFor(name: string): string {
  return `${slugify(name)}.24.pt@greenpool.vn`;
}

// 6 Sale PT (theo bảng anh gửi 2026-05-30). Doanh số tính bằng VND.
// Bỏ T5 — user yêu cầu chỉ nhập đến T4.
const SALES = [
  { name: 'Lò Thị Thới',        rev: { 1: 113_450_000, 2: 0,           3: 144_450_000, 4: 111_400_000 } },
  { name: 'Trần Thanh Tài',     rev: { 1:  48_750_000, 2: 0,           3:  19_000_000, 4:           0 } },
  { name: 'Nguyễn Hồng Nhung',  rev: { 1:  61_250_000, 2:   4_000_000, 3:  84_850_000, 4:   6_250_000 } },
  { name: 'Bùi Văn Hoạt',       rev: { 1: 120_000_000, 2:   4_000_000, 3: 173_350_000, 4: 118_800_000 } },
  { name: 'Hoàng Hồng Phúc',    rev: { 1:  63_250_000, 2: 0,           3:  87_500_000, 4:  45_000_000 } },
  { name: 'Nguyễn Hải Long',    rev: { 1:           0, 2: 0,           3:           0, 4:   8_250_000 } },
];

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY' : '👀 DRY RUN — dùng --apply');
  console.log('Branch: 24 NCT · Year: 2026 · Months: 1-4 · 6 Sale PT\n');

  // Lookup uid theo email
  const resolved: { uid: string; name: string; rev: Record<number, number> }[] = [];
  for (const s of SALES) {
    const email = emailFor(s.name);
    try {
      const u = await auth.getUserByEmail(email);
      resolved.push({ uid: u.uid, name: s.name, rev: s.rev });
    } catch {
      console.error(`✗ Không tìm thấy user ${email} — bỏ qua`);
    }
  }
  console.log(`Resolved ${resolved.length}/${SALES.length} users\n`);

  const ops: Array<{ docId: string; data: Record<string, unknown> }> = [];
  for (const month of [1, 2, 3, 4] as const) {
    console.log(`━━━ T${month} ━━━`);
    let total = 0;
    for (const sale of resolved) {
      const revenue = sale.rev[month] ?? 0;
      if (revenue <= 0) continue;   // skip cell empty
      const period = `2026-${pad2(month)}`;
      const docId = `month_${period}_24_${sale.uid}___total`;
      ops.push({
        docId,
        data: {
          unitPrice: revenue, branchId: '24', period, quantity: 1,
          updatedBy: 'admin@migration',
          saleId: sale.uid, year: 2026, sourceSystem: 'manual',
          groupId: '__total', packageId: '__total',
          saleName: sale.name,
          groupName: '(Tổng)', packageName: '(Tổng theo sale)',
          revenue, periodType: 'month', month,
          // Tag PT để query/report dễ phân biệt (denorm cho audit)
          saleRoleId: 'NV_SALE_PT',
          createdBy: 'admin@migration',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      console.log(`  ${sale.name.padEnd(22)} ${fmt(revenue).padStart(15)}đ`);
      total += revenue;
    }
    console.log(`  ─ Tổng T${month}: ${fmt(total)}đ\n`);
  }

  console.log(`Tổng docs sẽ ghi: ${ops.length}`);

  if (APPLY) {
    const batch = db.batch();
    for (const op of ops) batch.set(db.collection('packageSales').doc(op.docId), op.data, { merge: true });
    await batch.commit();
    console.log(`✅ Wrote ${ops.length} docs vào collection packageSales`);
  } else {
    console.log('(dry run — chạy lại với --apply)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
