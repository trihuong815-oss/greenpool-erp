// Migration 2026-06-18: mark 6 gói PT đã tồn tại sang isCustomQuantity=true.
// User đã có "PT Gym" (24) + 5x "HB PT" (HM/TK/CTT/24/TT) trong DB nhưng tạo
// trước khi K3 ra → chưa có field isCustomQuantity. Sale chọn các gói này không
// thấy ô Số buổi / Đơn giá.
//
// Migration set:
//   - isCustomQuantity = true
//   - unitName = 'buổi'
//   - defaultUnitPrice = 0 (Sale tự nhập đơn giá từng khách; admin có thể chỉnh ở /packages)
//
// Audit log mỗi gói để traceability.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();

// Danh sách gói cần migrate — lấy CHÍNH XÁC theo id từ audit-pt-packages.ts (không match
// bằng regex tên để tránh dính nhầm gói khác có chữ "PT" trong tương lai).
const TARGET_IDS = [
  '0uNQGJYbEGArkC4cAXqc', // PT Gym - 24
  '5aSseqC2uqbXQ6A6sn8x', // HB PT - TK
  'ByFoP4nWXTt5oQhusBhx', // HB PT - 24
  'JpMxLkYBiOCwB7tX4V5t', // HB PT - CTT
  'j8tXFkQX5p6sRBSHh76A', // HB PT - TT
  'ufikcMKXKEAg0UtDhxuN', // HB PT - HM
];

const APPLY = process.argv.includes('--apply');
const MIGRATION_VERSION = 'pt-mark-2026-06-18';

async function main() {
  console.log(`━━━ MIGRATION: mark ${TARGET_IDS.length} gói thành PT ━━━`);
  console.log(`Mode: ${APPLY ? '🔴 APPLY (sẽ ghi)' : '🟢 DRY-RUN (chỉ in ra)'}\n`);

  let touched = 0, skipped = 0, notFound = 0;

  for (const id of TARGET_IDS) {
    const ref = db.collection('packages').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  [${id}] ❌ KHÔNG TỒN TẠI`);
      notFound++;
      continue;
    }
    const data = snap.data()!;
    const wasPT = data.isCustomQuantity === true;

    console.log(`  [${id}] "${data.name}" branch=${data.branchId}`);
    console.log(`     before: isCustomQuantity=${data.isCustomQuantity} unitName=${JSON.stringify(data.unitName)} defaultUnitPrice=${data.defaultUnitPrice}`);

    if (wasPT) {
      console.log(`     ⏭  ĐÃ là PT — bỏ qua`);
      skipped++;
      continue;
    }

    const patch = {
      isCustomQuantity: true,
      unitName: 'buổi',
      defaultUnitPrice: 0,
      updatedAt: new Date(),
      updatedBy: 'migration-script',
    };
    console.log(`     after:  isCustomQuantity=true unitName='buổi' defaultUnitPrice=0`);

    if (APPLY) {
      await ref.update(patch);
      // Audit log
      await db.collection('auditLogs').add({
        action: 'update_package',
        module: 'sales',
        userId: 'migration-script',
        branchId: data.branchId,
        before: {
          id,
          isCustomQuantity: data.isCustomQuantity ?? null,
          unitName: data.unitName ?? null,
          defaultUnitPrice: data.defaultUnitPrice ?? null,
        },
        after: { id, ...patch },
        actor_name: 'Migration script (mark PT)',
        actor_role: 'system',
        source: 'script',
        details: null,
        migrationVersion: MIGRATION_VERSION,
        createdAt: new Date(),
      });
      console.log(`     ✅ ĐÃ APPLY`);
    } else {
      console.log(`     ℹ️  DRY-RUN — không ghi`);
    }
    touched++;
    console.log();
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Touched: ${touched} | Skipped (đã PT): ${skipped} | Không tồn tại: ${notFound}`);
  if (!APPLY && touched > 0) {
    console.log(`\n⚠️ Chạy lại với --apply để ghi vào Firestore.`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
