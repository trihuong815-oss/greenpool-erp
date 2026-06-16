// Sales v2 — audit log helpers (kế toán edit/approve/return).
// Phase 2 (2026-06-17).

import 'server-only';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase/collections';

type AuditAction = 'edit_field' | 'approve' | 'return' | 'auto_match' | 'manual_link';

export interface WriteAuditInput {
  db: Firestore;
  batchId: string;
  transactionId?: string | null;
  action: AuditAction;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  changedBy: string;       // uid
  changedByName: string;
  reason?: string | null;
}

/** Fire-and-forget — log audit không block flow business. */
export async function writeSalesAudit(input: WriteAuditInput): Promise<void> {
  try {
    await input.db.collection(COLLECTIONS.SALES_AUDIT_LOGS).add({
      batchId: input.batchId,
      transactionId: input.transactionId ?? null,
      action: input.action,
      field: input.field ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      changedBy: input.changedBy,
      changedByName: input.changedByName,
      changedAt: Timestamp.now(),
      reason: input.reason ?? null,
    });
  } catch (e: any) {
    console.warn('[sales-v2/audit] write fail:', e?.message);
  }
}

/** Batch ghi log nhiều field 1 lúc (vd kế toán "Sửa & Duyệt" patch N field cùng lần). */
export async function writeSalesAuditBatch(
  db: Firestore,
  batchId: string,
  transactionId: string | null,
  fieldChanges: Array<{ field: string; oldValue: unknown; newValue: unknown }>,
  actor: { uid: string; name: string },
  reason?: string,
): Promise<void> {
  if (fieldChanges.length === 0) return;
  try {
    const col = db.collection(COLLECTIONS.SALES_AUDIT_LOGS);
    const batch = db.batch();
    const now = Timestamp.now();
    for (const ch of fieldChanges) {
      batch.set(col.doc(), {
        batchId,
        transactionId,
        action: 'edit_field',
        field: ch.field,
        oldValue: ch.oldValue ?? null,
        newValue: ch.newValue ?? null,
        changedBy: actor.uid,
        changedByName: actor.name,
        changedAt: now,
        reason: reason ?? null,
      });
    }
    await batch.commit();
  } catch (e: any) {
    console.warn('[sales-v2/audit] batch write fail:', e?.message);
  }
}
