// Bổ sung packageSales (per-sale __total sentinel) cho CTT T1-T4/2026.
// App lấy totalRevenue per-branch + per-sale từ packageSales (KHÔNG phải packageQuantities).
// → Phải có 5 docs __total × 4 tháng = 20 docs để dashboard hiện tổng đúng.
//
// Số tổng per tháng đọc từ packageQuantities đã import → chia đều 5 sale (dư ưu tiên Nhi → ...).
//
// DRY-RUN: GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-ctt-package-sales.ts
// APPLY:   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-ctt-package-sales.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

const BRANCH = 'CTT';
const YEAR = 2026;

// 5 sale Member CTT — priority phân dư
const SALES = [
  { id: '6c4PWUIOyqhCjD6MAuaxbiYc7oO2', name: 'Nguyễn Thị Nhi'         , short: 'Nhi'  },
  { id: 'GDvDVJqIoKb5T2Dqrm471nldE6I2', name: 'Quán Thị Hồng'          , short: 'Hồng' },
  { id: 'YAimhV38YZemx0YO1FI3CV4bO4I2', name: 'Nguyễn Thị Ngọc Thơm'   , short: 'Thơm' },
  { id: 'sia6klPIXyMUgOohl3Yqsrh4Xhr2', name: 'Nguyễn Thị Dung'        , short: 'Dung' },
  { id: 'xs80LoisQvRCUTOi7WP5JtO9iO43', name: 'Phạm Quốc Anh'          , short: 'QAnh' },
];

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

function distribute(total: number): number[] {
  // Chia đều, dư ưu tiên sale đầu danh sách
  const n = SALES.length;
  const base = Math.floor(total / n);
  const rem = total % n;
  return SALES.map((_, i) => base + (i < rem ? 1 : 0));
}

async function main() {
  console.log(APPLY ? '🚀 APPLY' : '👀 DRY-RUN');

  // Đọc packageQuantities CTT 2026 để tính tổng mỗi tháng
  const q = await db.collection('packageQuantities')
    .where('branchId', '==', BRANCH)
    .where('year', '==', YEAR)
    .get();
  const revByMonth: Record<number, number> = { 1:0, 2:0, 3:0, 4:0 };
  for (const d of q.docs) {
    const x = d.data();
    if (revByMonth[x.month] !== undefined) revByMonth[x.month] += x.revenue ?? 0;
  }
  console.log('\nTổng doanh thu CTT theo tháng (từ packageQuantities):');
  for (const m of [1,2,3,4]) console.log(`  T${m}: ${fmt(revByMonth[m])}`);

  const ops: Array<{ docId: string; data: any }> = [];
  for (const month of [1,2,3,4] as const) {
    const total = revByMonth[month];
    if (total === 0) continue;
    const split = distribute(total);
    const period = `${YEAR}-${pad2(month)}`;
    console.log(`\nT${month}: total=${fmt(total)} → ${SALES.map((s,i) => `${s.short}:${fmt(split[i])}`).join(' · ')}`);
    let chk = 0;
    for (let i = 0; i < SALES.length; i++) {
      const s = SALES[i];
      const rev = split[i];
      if (rev === 0) continue;
      chk += rev;
      ops.push({
        docId: `month_${period}_${BRANCH}_${s.id}___total`,
        data: {
          branchId: BRANCH, year: YEAR, month, period, periodType: 'month',
          saleId: s.id, saleName: s.name,
          groupId: '__total', groupName: '(Tổng)',
          packageId: '__total', packageName: '(Tổng theo sale)',
          quantity: 1, unitPrice: rev, revenue: rev,
          sourceSystem: 'manual',
          createdBy: 'import-ctt-2026', updatedBy: 'import-ctt-2026',
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
    }
    if (chk !== total) {
      console.error(`  ⚠ T${month} CHECKSUM SAI: chia=${fmt(chk)} ≠ tổng=${fmt(total)}`);
      process.exit(1);
    } else {
      console.log(`  ✓ checksum khớp ${fmt(total)}`);
    }
  }

  console.log(`\nTổng docs sẽ ghi: ${ops.length}`);
  if (APPLY) {
    const batch = db.batch();
    for (const op of ops) batch.set(db.collection('packageSales').doc(op.docId), op.data, { merge: true });
    await batch.commit();
    console.log(`✅ Đã ghi ${ops.length} packageSales __total`);
  } else {
    console.log('(dry-run)');
  }
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
