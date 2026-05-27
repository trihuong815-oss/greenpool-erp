// Read-only: check số nhóm + gói hiện có cho từng cơ sở.
// Mục đích: trước khi seed/cập nhật, verify admin đã tạo gì.
// Chạy: GOOGLE_APPLICATION_CREDENTIALS=... npx --yes tsx scripts/check-packages-per-branch.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) { console.error('Missing GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1); }
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

const BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;
const BRANCH_LABELS: Record<string, string> = {
  HM: 'Hoàng Mai', TK: '20 Thụy Khuê', CTT: 'CTT Mỹ Đình', '24': '24 Nguyễn Cơ Thạch', TT: 'Thanh Trì',
};

(async () => {
  console.log('\n📦 PACKAGE CATALOG — STATUS PER BRANCH\n');
  console.log('Branch'.padEnd(8), 'Tên'.padEnd(22), 'Nhóm  Gói (active/total)');
  console.log('─'.repeat(70));

  for (const branchId of BRANCHES) {
    const [grpSnap, pkgSnap] = await Promise.all([
      db.collection('packageGroups').where('branchId', '==', branchId).get(),
      db.collection('packages').where('branchId', '==', branchId).get(),
    ]);
    const totalG = grpSnap.size;
    const activeG = grpSnap.docs.filter((d) => d.data().active !== false).length;
    const totalP = pkgSnap.size;
    const activeP = pkgSnap.docs.filter((d) => d.data().active !== false).length;
    console.log(
      branchId.padEnd(8),
      (BRANCH_LABELS[branchId] ?? '').padEnd(22),
      `${activeG}/${totalG}`.padEnd(6),
      `${activeP}/${totalP}`,
    );
  }

  console.log('\n📋 DETAIL — Nhóm × Gói (active only):\n');
  for (const branchId of BRANCHES) {
    const grpSnap = await db.collection('packageGroups').where('branchId', '==', branchId).get();
    const groups = grpSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as { name: string; active?: boolean; sortOrder?: number }) }))
      .filter((g) => g.active !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    console.log(`\n— ${branchId} · ${BRANCH_LABELS[branchId]} —`);
    if (groups.length === 0) {
      console.log('  (chưa có nhóm nào)');
      continue;
    }
    for (const g of groups) {
      const pkgSnap = await db.collection('packages')
        .where('branchId', '==', branchId)
        .where('groupId', '==', g.id)
        .get();
      const pkgs = pkgSnap.docs
        .map((d) => d.data() as { name: string; defaultPrice: number; active?: boolean })
        .filter((p) => p.active !== false);
      console.log(`  • ${g.name} (${pkgs.length} gói)`);
      for (const p of pkgs) {
        console.log(`      - ${p.name}: ${p.defaultPrice.toLocaleString('vi-VN')}₫`);
      }
    }
  }
  console.log('\n✓ Done\n');
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
