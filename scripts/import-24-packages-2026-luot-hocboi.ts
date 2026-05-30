// Import packageQuantities cho 24 NCT T1-T4/2026 — Tích lượt + Học bơi.
// Bảng anh gửi 2026-05-30. HBNC = Học Thang Long Kid (DB tên đầy đủ).
// Pattern theo import-24-packages-2026-pt.ts. Có checksum tổng SL + tổng DT mỗi tháng.
//
// DRY-RUN:  GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-24-packages-2026-luot-hocboi.ts
// APPLY:    GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx --yes tsx scripts/import-24-packages-2026-luot-hocboi.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// ─── PACKAGE MAP (24 NCT) — verified bằng scripts/find-24-packages.ts ───
const PKG = {
  // Nhóm Tích lượt
  L30:    { id: 'sLOi0UGjkjkX7dTFq3t2', name: '30 lượt',                groupId: 'h7zD48WmZXBHdVwBiyGb', groupName: 'Thẻ tích lượt' },
  L60:    { id: 'tXygK6Bpq24YIW3c9XuT', name: '60 lượt',                groupId: 'h7zD48WmZXBHdVwBiyGb', groupName: 'Thẻ tích lượt' },
  L200:   { id: 'YfUO81o3LdQxEvvKwl8z', name: '200 lượt',               groupId: 'h7zD48WmZXBHdVwBiyGb', groupName: 'Thẻ tích lượt' },
  // Nhóm Học bơi
  HBCBNL: { id: 'cWM1aeilZJR8t1P1MFiG', name: 'Học bơi cơ bản người lớn', groupId: 'HvAshZmfXslRP3GXDS8k', groupName: 'Thẻ học bơi' },
  HBCBTE: { id: '0ThBDggo4SgAmcnvwq9M', name: 'Học bơi cơ bản trẻ em',  groupId: 'HvAshZmfXslRP3GXDS8k', groupName: 'Thẻ học bơi' },
  HBNC:   { id: 'MOhfdHt9Ebg9ZLYgO3YP', name: 'Học bơi Thang Long Kid', groupId: 'HvAshZmfXslRP3GXDS8k', groupName: 'Thẻ học bơi' },
  PT_BOI: { id: 'ByFoP4nWXTt5oQhusBhx', name: 'Học bơi PT',             groupId: 'HvAshZmfXslRP3GXDS8k', groupName: 'Thẻ học bơi' },
} as const;
type PkgKey = keyof typeof PKG;

interface Cell { qty: number; rev: number }
// Bảng anh gửi (cell "-" → skip, không ghi doc)
const DATA: Record<number, Partial<Record<PkgKey, Cell>>> = {
  1: {
    L30:    { qty:  3, rev:   8_550_000 },
    L60:    { qty:  2, rev:  10_260_000 },
    L200:   { qty: 11, rev:  73_150_000 },
    HBCBNL: { qty:104, rev: 157_775_000 },
    HBCBTE: { qty: 28, rev:  43_550_000 },
  },
  2: {
    L30:    { qty:  3, rev:   8_150_000 },
    L200:   { qty: 10, rev:  79_800_000 },
    HBCBNL: { qty: 58, rev:  92_575_000 },
    HBCBTE: { qty: 10, rev:  10_500_000 },
  },
  3: {
    L30:    { qty: 16, rev:  40_500_000 },
    L60:    { qty:  8, rev:  41_040_000 },
    L200:   { qty: 56, rev: 389_625_000 },
    HBCBNL: { qty:135, rev: 289_200_000 },
    HBCBTE: { qty: 69, rev: 138_250_000 },
    HBNC:   { qty:  2, rev:   9_400_000 },
  },
  4: {
    L30:    { qty: 40, rev: 108_450_000 },
    L60:    { qty: 10, rev:  39_100_000 },
    L200:   { qty: 67, rev: 454_275_000 },
    HBCBNL: { qty: 70, rev: 180_850_000 },
    HBCBTE: { qty: 54, rev: 128_925_000 },
    HBNC:   { qty:  1, rev:   5_800_000 },
    PT_BOI: { qty:  1, rev:   6_000_000 },
  },
};

// Checksum tự tính từ data, verify với "TỔNG" — bảng anh không có cột TỔNG nhưng em tổng đầy đủ
const CHECKSUM: Record<number, { qty: number; rev: number }> = {
  1: { qty: 148, rev:   293_285_000 },
  2: { qty:  81, rev:   191_025_000 },
  3: { qty: 286, rev:   908_015_000 },
  4: { qty: 243, rev:   923_400_000 },
};

function pad2(n: number): string { return n.toString().padStart(2, '0'); }
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

async function main() {
  console.log(APPLY ? '🚀 APPLY' : '👀 DRY-RUN — dùng --apply');
  console.log('Branch: 24 NCT · Year: 2026 · Tích lượt (30/60/200) + Học bơi (HBCBNL/HBCBTE/HBNC/PT_BOI)\n');

  const ops: Array<{ docId: string; data: Record<string, unknown> }> = [];
  let allOk = true;

  for (const month of [1, 2, 3, 4] as const) {
    console.log(`━━━ T${month} ━━━`);
    let mQty = 0, mRev = 0, mDocs = 0;
    for (const [k, cell] of Object.entries(DATA[month] ?? {}) as [PkgKey, Cell][]) {
      const p = PKG[k];
      mQty += cell.qty;
      mRev += cell.rev;
      if (cell.qty === 0 && cell.rev === 0) {
        console.log(`  ${k.padEnd(7)} skip (cell 0)`);
        continue;
      }
      const docId = `2026_${pad2(month)}_24_${p.id}`;
      ops.push({
        docId,
        data: {
          year: 2026, month, branchId: '24',
          groupId: p.groupId, groupName: p.groupName,
          packageId: p.id, packageName: p.name,
          quantity: cell.qty, revenue: cell.rev,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'admin@migration',
        },
      });
      mDocs++;
      console.log(`  ${k.padEnd(7)} qty=${cell.qty.toString().padStart(4)} rev=${fmt(cell.rev).padStart(15)}đ → ${p.name}`);
    }
    const chk = CHECKSUM[month];
    const okQty = mQty === chk.qty ? '✓' : `✗ (tính=${mQty} vs ${chk.qty})`;
    const okRev = mRev === chk.rev ? '✓' : `✗ (tính=${fmt(mRev)} vs ${fmt(chk.rev)})`;
    console.log(`  ─ T${month}: ${mDocs} docs · qty=${mQty} [${okQty}] · rev=${fmt(mRev)}đ [${okRev}]\n`);
    if (mQty !== chk.qty || mRev !== chk.rev) allOk = false;
  }

  console.log(`Tổng docs: ${ops.length}`);
  if (!allOk) {
    console.error('⚠ CHECKSUM SAI — NGỪNG. Kiểm tra lại số.');
    process.exit(1);
  }
  console.log('✓ Checksum khớp.');

  if (APPLY) {
    const batch = db.batch();
    for (const op of ops) batch.set(db.collection('packageQuantities').doc(op.docId), op.data, { merge: true });
    await batch.commit();
    console.log(`✅ Wrote ${ops.length} docs vào packageQuantities`);
  } else {
    console.log('(dry-run)');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
