// POST /api/sales-v2/transactions/[id]/review  body { status: 'approved'|'rejected'|'pending', reason?: string }
//   - Kế toán/top tick ✓/✗ per row
//   - Validate caller có quyền edit (cùng cơ sở hoặc top), batch ở pending_review
//   - rejected → bắt buộc reason
//   - Audit log action='edit_field' field='reviewStatus'
// V6 (2026-06-17) — per-row review workflow.

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canEditTransaction } from '@/lib/sales-v2/scope';
import { writeSalesAudit } from '@/lib/sales-v2/audit';
import { serializeTransaction } from '@/lib/sales-v2/serialize';
import { assertMonthNotLockedIfEnabled, MonthLockedError } from '@/lib/sales-v2/month-lock';
import type { TxReviewStatus } from '@/lib/types/sales-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUS = new Set<TxReviewStatus>(['pending', 'approved', 'rejected']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
    }
    const status = body.status as TxReviewStatus;
    const reason = body.reason ? String(body.reason).trim().slice(0, 500) : null;

    if (!VALID_STATUS.has(status)) {
      return NextResponse.json({ error: 'Status không hợp lệ' }, { status: 400 });
    }
    if (status === 'rejected' && !reason) {
      return NextResponse.json({ error: 'Phải nhập lý do khi đánh dấu lỗi' }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const txRef = db.collection(COLLECTIONS.SALES_TRANSACTIONS).doc(id);
    const txDoc = await txRef.get();
    if (!txDoc.exists) return NextResponse.json({ error: 'Không tìm thấy giao dịch' }, { status: 404 });
    const tx = txDoc.data() ?? {};

    const batchDoc = await db.collection(COLLECTIONS.SALES_DAILY_BATCHES).doc(tx.batchId).get();
    if (!batchDoc.exists) return NextResponse.json({ error: 'Batch không tồn tại' }, { status: 404 });
    const batch = batchDoc.data() ?? {};

    if (!canEditTransaction(caller, { saleId: batch.saleId, branchId: batch.branchId, status: batch.status })) {
      return NextResponse.json({ error: 'Không có quyền review' }, { status: 403 });
    }
    // Sale không được review tx của mình
    if (batch.saleId === caller.profile.uid) {
      return NextResponse.json({ error: 'Sale không thể tự review batch của mình' }, { status: 403 });
    }

    // M2.1 PR-3B (2026-06-20): enforce month lock — flag-gated.
    try {
      await assertMonthNotLockedIfEnabled(
        batch.branchId, String(batch.month ?? tx.month ?? ''),
        caller.profile.uid, String(caller.profile.role_code ?? ''),
      );
    } catch (err) {
      if (err instanceof MonthLockedError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }

    const now = Timestamp.now();
    const oldStatus = tx.reviewStatus ?? 'pending';
    await txRef.update({
      reviewStatus: status,
      rejectReason: status === 'rejected' ? reason : null,
      reviewedAt: status === 'pending' ? null : now,
      reviewedBy: status === 'pending' ? null : caller.profile.uid,
      updatedAt: now,
    });

    // Audit log
    if (oldStatus !== status) {
      void writeSalesAudit({
        db,
        batchId: tx.batchId,
        transactionId: id,
        action: 'edit_field',
        field: 'reviewStatus',
        oldValue: oldStatus,
        newValue: status,
        changedBy: caller.profile.uid,
        changedByName: caller.actorName,
        reason: status === 'rejected' ? reason : undefined,
      });
    }

    const newDoc = await txRef.get();
    return NextResponse.json({ ok: true, transaction: serializeTransaction(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/transactions/[id]/review] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
