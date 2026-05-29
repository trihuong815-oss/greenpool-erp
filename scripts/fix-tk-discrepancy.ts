// Fix 2 con số sai theo bảng chuẩn user gửi 2026-05-29:
// 1. packageQuantity T4 HBCBNL: 197.775.000 → 198.275.000 (+500K)
// 2. packageSales __total T3 Đồng Thị Lan Hương: 505.688.000 → 503.688.000 (-2M)
//
// Sau khi sửa, mọi tháng (T1-T4) đều có per-sale = per-package:
// T3: 1.405.266.000 · T4: 1.583.075.000
//
// Run:
//   npx --yes tsx scripts/fix-tk-discrepancy.ts           # dry run
//   npx --yes tsx scripts/fix-tk-discrepancy.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

function fmt(n: number): string { return n.toLocaleString('vi-VN') + 'đ'; }

interface FixOp {
  collection: 'packageQuantities' | 'packageSales';
  docId: string;
  label: string;
  expectOldRevenue: number;
  newRevenue: number;
  alsoFields?: Record<string, unknown>;
}

const FIXES: FixOp[] = [
  {
    collection: 'packageQuantities',
    docId: '2026_04_TK_yO71o3F0DZ9VsnGFVggv',  // T4 / TK / Học bơi cơ bản người lớn
    label: 'T4 HBCBNL',
    expectOldRevenue: 197_775_000,
    newRevenue: 198_275_000,
  },
  {
    collection: 'packageSales',
    docId: 'month_2026-03_TK_eJVGPWO0RKZMebdWWxrxsW3y1F82___total',  // T3 / TK / Đồng Thị Lan Hương / __total
    label: 'T3 Đồng Thị Lan Hương (per-sale __total)',
    expectOldRevenue: 505_688_000,
    newRevenue: 503_688_000,
    // packageSales __total docs có cả unitPrice = revenue (quantity=1)
    alsoFields: { unitPrice: 503_688_000 },
  },
];

async function main() {
  console.log(APPLY ? '🚀 APPLY mode' : '👀 DRY RUN — dùng --apply');
  console.log('');

  // Step 1: Verify trạng thái hiện tại trước khi đổi
  let allOk = true;
  const updates: Array<{ op: FixOp; ref: FirebaseFirestore.DocumentReference }> = [];

  for (const op of FIXES) {
    const ref = db.collection(op.collection).doc(op.docId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.error(`  ❌ ${op.label}: doc KHÔNG TỒN TẠI (${op.collection}/${op.docId})`);
      allOk = false;
      continue;
    }
    const data = snap.data() ?? {};
    const cur = Number(data.revenue ?? 0);
    if (cur !== op.expectOldRevenue) {
      console.error(`  ❌ ${op.label}: revenue hiện tại=${fmt(cur)} KHÔNG khớp expected old=${fmt(op.expectOldRevenue)} → có thể đã sửa rồi hoặc data khác. STOP.`);
      allOk = false;
      continue;
    }
    console.log(`  ✓ ${op.label.padEnd(45)} cũ=${fmt(cur).padStart(20)} → mới=${fmt(op.newRevenue).padStart(20)} (Δ ${fmt(op.newRevenue - cur)})`);
    updates.push({ op, ref });
  }

  if (!allOk) {
    console.error('\n⛔ Có lỗi — không thực thi.');
    process.exit(1);
  }

  console.log(`\n${APPLY ? 'Apply' : 'Sẽ apply'} ${updates.length} updates.`);

  if (APPLY) {
    const batch = db.batch();
    for (const { op, ref } of updates) {
      const patch: Record<string, unknown> = {
        revenue: op.newRevenue,
        updatedAt: new Date(),
        updatedBy: 'admin@fix-discrepancy',
        ...(op.alsoFields ?? {}),
      };
      batch.update(ref, patch);
    }
    await batch.commit();
    console.log(`✅ Apply xong ${updates.length} updates`);
  } else {
    console.log('(dry run — chưa thay đổi)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
