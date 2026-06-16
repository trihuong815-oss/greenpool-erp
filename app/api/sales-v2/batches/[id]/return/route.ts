// POST /api/sales-v2/batches/[id]/return  body: { reason: string }
//   - Kế toán trả lại Sale sửa → status=returned + returnReason + returnedAt
//   - Validate: caller = kế toán + cùng cơ sở
//   - Validate: batch.status = pending_review
//   - Audit log action='return'
// Phase 3 sẽ wire: gửi noti cho Sale "Batch bị trả lại — lý do ..."
// Phase 2 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canAccountantReview, getScopeRole } from '@/lib/sales-v2/scope';
import { writeSalesAudit } from '@/lib/sales-v2/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    if (!canAccountantReview(caller.profile.role_code)) {
      return NextResponse.json({ error: 'Chỉ kế toán/quản lý mới được trả lại' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const reason = String(body?.reason ?? '').trim().slice(0, 500);
    if (!reason) return NextResponse.json({ error: 'Phải nhập lý do trả lại' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const batchRef = db.collection(COLLECTIONS.SALES_DAILY_BATCHES).doc(id);

    const result = await db.runTransaction(async (tx) => {
      const batchSnap = await tx.get(batchRef);
      if (!batchSnap.exists) return { error: 'Không tìm thấy batch', status: 404 } as const;
      const batch = batchSnap.data() ?? {};

      const role = getScopeRole(caller.profile.role_code);
      if (role === 'accountant') {
        if (!caller.profile.facility_id || batch.branchId !== caller.profile.facility_id) {
          return { error: 'Batch không thuộc cơ sở của bạn', status: 403 } as const;
        }
      }

      if (batch.status !== 'pending_review') {
        return { error: `Batch đang ở trạng thái ${batch.status}, không thể trả lại`, status: 400 } as const;
      }

      const now = Timestamp.now();
      tx.update(batchRef, {
        status: 'returned',
        returnedAt: now,
        returnReason: reason,
        updatedAt: now,
        // Giữ submittedAt/reviewedAt để có lịch sử
      });
      return { ok: true } as const;
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    void writeSalesAudit({
      db,
      batchId: id,
      action: 'return',
      changedBy: caller.profile.uid,
      changedByName: caller.actorName,
      reason,
    });

    // TODO Phase 3: gửi noti cho Sale "Bảng bị trả lại: <reason>"

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/batches/[id]/return] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
