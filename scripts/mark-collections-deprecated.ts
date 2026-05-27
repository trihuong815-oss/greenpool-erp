// Thêm doc __deprecation_notice vào 5 collection cũ làm marker.
// KHÔNG xóa data thật — chỉ thêm 1 doc đặc biệt cảnh báo.
// Idempotent: skip nếu __deprecation_notice đã tồn tại.
//
// Chạy:
//   npx --yes tsx scripts/mark-collections-deprecated.ts          (dry-run)
//   npx --yes tsx scripts/mark-collections-deprecated.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const APPLY = process.argv.includes('--apply');
const MARKER_DOC_ID = '__deprecation_notice';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

interface Marker {
  collection: string;
  deprecatedAtPhase: string;
  replacedBy: string;
  reason: string;
}

const MARKERS: Marker[] = [
  { collection: 'profiles',           deprecatedAtPhase: '4',   replacedBy: 'users',      reason: 'Rename khi migrate sang Firebase Auth + schema mới (roleId/branchId/status).' },
  { collection: 'facilities',         deprecatedAtPhase: '1.5', replacedBy: 'branches',   reason: 'Rename theo canonical schema thống nhất.' },
  { collection: 'checklistInstances', deprecatedAtPhase: '1.5', replacedBy: 'checklists', reason: 'Rename theo canonical schema thống nhất.' },
  { collection: 'checklistTemplates', deprecatedAtPhase: '1.5', replacedBy: 'templates',  reason: 'Rename theo canonical schema thống nhất.' },
  { collection: 'checklistAuditLogs', deprecatedAtPhase: '1.5', replacedBy: 'auditLogs',  reason: 'Rename + chuẩn hóa format (action/module/userId/branchId/before/after/createdAt).' },
];

async function main() {
  console.log(`=== Mark deprecated ===`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const now = new Date();
  let written = 0, exists = 0;

  for (const m of MARKERS) {
    const ref = db.collection(m.collection).doc(MARKER_DOC_ID);
    const snap = await ref.get();
    if (snap.exists) {
      exists++;
      console.log(`  ~ ${m.collection.padEnd(22)} đã có ${MARKER_DOC_ID}, skip.`);
      continue;
    }
    console.log(`  + ${m.collection.padEnd(22)} → replacedBy=${m.replacedBy} (phase ${m.deprecatedAtPhase})`);
    if (APPLY) {
      await ref.set({
        _deprecated: true,
        _deprecatedAt: now,
        _deprecatedAtPhase: m.deprecatedAtPhase,
        _replacedBy: m.replacedBy,
        _reason: m.reason,
        _note: 'CHỈ đọc — collection này đã deprecated. Code production KHÔNG còn ref. Sẽ drop sau khi Firebase chạy ổn vài ngày. Tham khảo [[firebase-data-model]].',
        _markedBy: 'mark-collections-deprecated.ts',
      });
    }
    written++;
  }

  console.log(`\nKết quả: written=${written} exists=${exists}`);
  if (!APPLY) console.log(`→ Dry-run xong. Re-run với --apply.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('LỖI:', e); process.exit(1); });
