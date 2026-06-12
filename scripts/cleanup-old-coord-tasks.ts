// Xoá task cũ trong collection 'tasks' (chia sẻ /giao-viec + /de-xuat + /dieu-phoi).
// Anh chốt 2026-06-12: data cũ là test, schema không khớp UI Điều phối mới.
//
// USAGE:
//   npx tsx scripts/cleanup-old-coord-tasks.ts              # DRY-RUN (mặc định)
//   npx tsx scripts/cleanup-old-coord-tasks.ts --apply      # XOÁ THẬT
//
// SAFETY:
// - Dry-run mặc định in danh sách doc + count.
// - Apply: backup từng doc vào /tmp/tasks-backup-<timestamp>.jsonl TRƯỚC khi xoá.
// - Batch delete max 400/batch.
// - Xoá luôn sub-collection comments + attachments của mỗi task.
// - In log từng doc deleted.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const APPLY = process.argv.includes('--apply');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `/tmp/tasks-backup-${ts}.jsonl`;

  console.log(`Mode: ${APPLY ? 'APPLY (xoá thật)' : 'DRY-RUN'}`);
  console.log(`Collection: tasks (chia sẻ /giao-viec + /de-xuat + /dieu-phoi)\n`);

  const snap = await db.collection('tasks').get();
  console.log(`Tổng docs: ${snap.size}\n`);

  // Phân loại theo kind
  const byKind: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  snap.docs.forEach((d) => {
    const x = d.data();
    const k = x.kind ?? '(none)';
    const s = x.status ?? '(none)';
    byKind[k] = (byKind[k] ?? 0) + 1;
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  });
  console.log('Theo kind:', byKind);
  console.log('Theo status:', byStatus);
  console.log('\nMẫu 10 docs:');
  snap.docs.slice(0, 10).forEach((d) => {
    const x = d.data();
    const date = x.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? '?';
    console.log(`  ${d.id} | ${date} | ${x.kind ?? '?'} | ${x.status ?? '?'} | ${x.title?.slice(0, 50) ?? '?'}`);
  });

  if (!APPLY) {
    console.log(`\n⚠ DRY-RUN. Chạy lại với --apply để XOÁ ${snap.size} docs.`);
    console.log(`Backup sẽ ghi vào: /tmp/tasks-backup-<ts>.jsonl`);
    return;
  }

  // APPLY mode — backup + delete
  console.log(`\n→ Backup vào ${backupPath}`);
  writeFileSync(backupPath, '');
  for (const d of snap.docs) {
    const data = d.data();
    appendFileSync(backupPath, JSON.stringify({ id: d.id, ...data }, (_k, v) => {
      // Serialize Firestore Timestamp
      if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
      return v;
    }) + '\n');
  }
  console.log(`✓ Backup ${snap.size} docs xong.`);

  // Xoá sub-collections (comments, attachments) trước rồi parent doc
  console.log(`\n→ Xoá sub-collections + docs (batch 400)...`);
  let deleted = 0;
  for (const d of snap.docs) {
    // Sub-collections phổ biến
    for (const subName of ['comments', 'attachments']) {
      const sub = await d.ref.collection(subName).get();
      if (sub.size === 0) continue;
      // Batch xoá sub-docs
      let subBatch = db.batch();
      let subCount = 0;
      for (const sd of sub.docs) {
        subBatch.delete(sd.ref);
        subCount++;
        if (subCount >= 400) {
          await subBatch.commit();
          subBatch = db.batch();
          subCount = 0;
        }
      }
      if (subCount > 0) await subBatch.commit();
    }
    await d.ref.delete();
    deleted++;
    if (deleted % 25 === 0) console.log(`  Đã xoá ${deleted}/${snap.size}...`);
  }
  console.log(`\n✓ Xoá xong ${deleted} docs. Backup tại: ${backupPath}`);
  console.log(`Nếu cần restore: tham khảo backup file (1 doc / dòng JSON).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
