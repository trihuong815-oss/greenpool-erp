// Milestone 2.1 PR-1 (2026-06-20) — Foundation helper ghi audit log Doanh số V2.
// CHƯA wire vào API mutation nào (PR-2 sẽ wire). PR-1 chỉ define + export sẵn.
//
// Pattern dùng (PR-2):
//   import { recordSalesAudit } from '@/lib/sales-v2/audit-log';
//   await ref.update(updates);
//   await recordSalesAudit({
//     module: 'transaction', action: 'edit_field',
//     transactionId: tx.id, batchId: tx.batchId,
//     branchId: tx.branchId, month: tx.month,
//     field: 'collectedToday', oldValue: oldVal, newValue: newVal,
//     actorUid: caller.profile.uid,
//     actorName: caller.actorName,
//     actorRole: caller.profile.role_code,
//   });
//
// Retention: vĩnh viễn / tối thiểu 10 năm. KHÔNG có deleteSalesAudit() helper.
// Fail-soft: helper KHÔNG throw — nếu Firestore lỗi thì console.error + nuốt.
// Tránh vì sao: 1 audit fail không được phá mutation chính.

import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type {
  RecordSalesAuditInput,
  SalesAuditLogDoc,
  SalesAuditAction,
} from '@/lib/types/sales-audit';

/** Action yêu cầu non-empty reason — caller phải đảm bảo trước khi gọi.
 *  Helper sẽ console.warn nếu nhận action này mà reason rỗng (giúp debug PR-2 wire sai). */
const REASON_REQUIRED_ACTIONS: ReadonlySet<SalesAuditAction> = new Set([
  'unlock_month',
  'override_approved',
  'return_batch',
  'reject_program',
]);

/** Ghi 1 entry vào salesAuditLogs. Fire-and-forget — KHÔNG throw.
 *  Trả Promise<string | null> = docId nếu thành công, null nếu fail. */
export async function recordSalesAudit(input: RecordSalesAuditInput): Promise<string | null> {
  // Validate required reason (chỉ warn, không throw — fail-soft).
  if (REASON_REQUIRED_ACTIONS.has(input.action) && !input.reason?.trim()) {
    console.warn('[sales-audit] action "%s" thường bắt buộc reason nhưng caller không truyền', input.action);
  }

  try {
    const db = getFirebaseAdminDb();
    const doc: SalesAuditLogDoc = {
      module: input.module,
      batchId: input.batchId ?? null,
      transactionId: input.transactionId ?? null,
      programId: input.programId ?? null,
      action: input.action,
      field: input.field ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      branchId: input.branchId,
      month: input.month,
      changedBy: input.actorUid,
      changedByName: input.actorName,
      changedByRole: input.actorRole,
      changedAt: Timestamp.now(),
      reason: input.reason?.trim() || null,
      ip: input.ip ?? null,
    };
    const ref = await db.collection(COLLECTIONS.SALES_AUDIT_LOGS).add(doc);
    return ref.id;
  } catch (err) {
    console.error('[sales-audit] write fail (swallowed):', {
      module: input.module,
      action: input.action,
      branchId: input.branchId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Diff 2 object → array các field changed, dùng để log nhiều edit_field entries
 *  trong 1 lần PATCH. Caller chịu trách nhiệm filter field nào audit-worthy.
 *
 *  Vd:
 *    const changes = diffFields(oldTx, newTx, ['collectedToday','packageValue','note']);
 *    await Promise.all(changes.map(c => recordSalesAudit({
 *      ...baseCtx, action: 'edit_field',
 *      field: c.field, oldValue: c.oldValue, newValue: c.newValue,
 *    })));
 */
export interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export function diffFields<T extends Record<string, unknown>>(
  oldDoc: T | null | undefined,
  newDoc: T,
  watchFields: ReadonlyArray<keyof T & string>,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of watchFields) {
    const oldVal = oldDoc?.[field] ?? null;
    const newVal = newDoc?.[field] ?? null;
    // Shallow compare — đủ cho primitive + null. Object/array compare cần stringify.
    const oldKey = typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal);
    const newKey = typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal);
    if (oldKey !== newKey) {
      diffs.push({ field, oldValue: oldVal, newValue: newVal });
    }
  }
  return diffs;
}

/** Re-export FieldValue cho convenience — caller có thể dùng FieldValue.serverTimestamp()
 *  nếu cần ghi audit với client time (rare). */
export { FieldValue };

// ─── M2.1 PR-2 (2026-06-20) — Feature-flag wrapper cho mutation API ────────

/** Wrapper: chỉ ghi audit nếu feature flag `SALES_V2_AUDIT_LOG` enabled cho user.
 *  Fail-safe: cả flag check + audit write đều nuốt lỗi → KHÔNG phá flow chính.
 *
 *  Usage trong mutation API:
 *    await recordSalesAuditIfEnabled(input, caller.profile.uid, caller.profile.role_code);
 *
 *  Khi flag tắt (Firestore doc featureFlags/SALES_V2_AUDIT_LOG enabled=false):
 *    → no-op, không ghi audit, không tốn Firestore write.
 */
export async function recordSalesAuditIfEnabled(
  input: RecordSalesAuditInput,
  uid: string,
  roleCode: string,
): Promise<string | null> {
  try {
    // Import lazy để tránh circular dep + tránh load feature-flag infra ở build time
    const { isFlagEnabled } = await import('@/lib/feature-flags/server');
    const enabled = await isFlagEnabled('SALES_V2_AUDIT_LOG', uid, roleCode);
    if (!enabled) return null;
    return await recordSalesAudit(input);
  } catch (err) {
    console.warn('[sales-audit] recordSalesAuditIfEnabled fail (swallowed):', {
      action: input.action,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
