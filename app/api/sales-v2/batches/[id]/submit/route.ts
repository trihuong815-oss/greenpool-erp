// POST /api/sales-v2/batches/[id]/submit — Sale bấm "Gửi đối chiếu ngày".
// - Recompute totals từ transactions
// - Set status='pending_review' + submittedAt + submittedBy
// - Validate: caller là Sale owner + batch đang draft/returned + có ít nhất 1 transaction
// Phase 3 sẽ wire notification engine.
// Phase 1 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canSaleEnter } from '@/lib/sales-v2/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    if (!canSaleEnter(caller.profile.role_code)) {
      return NextResponse.json({ error: 'Chỉ tài khoản Sale mới được gửi đối chiếu' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    const batchRef = db.collection(COLLECTIONS.SALES_DAILY_BATCHES).doc(id);

    const result = await db.runTransaction(async (tx) => {
      const batchSnap = await tx.get(batchRef);
      if (!batchSnap.exists) {
        return { error: 'Không tìm thấy batch', status: 404 } as const;
      }
      const batch = batchSnap.data() ?? {};
      if (batch.saleId !== caller.profile.uid) {
        return { error: 'Không phải batch của bạn', status: 403 } as const;
      }
      if (batch.status !== 'draft' && batch.status !== 'returned') {
        return { error: `Batch đang ở trạng thái ${batch.status}, không thể gửi`, status: 400 } as const;
      }

      // Recompute totals từ transactions
      const txSnap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
        .where('batchId', '==', id)
        .get();
      if (txSnap.empty) {
        return { error: 'Chưa có giao dịch nào', status: 400 } as const;
      }
      let totalSales = 0, totalCollected = 0;
      txSnap.forEach((d) => {
        const x = d.data();
        totalSales += Number(x.packageValue ?? 0);
        totalCollected += Number(x.collectedToday ?? 0);
      });
      const totalDebt = totalSales - totalCollected;

      const now = Timestamp.now();
      tx.update(batchRef, {
        status: 'pending_review',
        totalTransactions: txSnap.size,
        totalSalesAmount: totalSales,
        totalCollectedAmount: totalCollected,
        totalDebtAmount: totalDebt,
        submittedAt: now,
        submittedBy: caller.profile.uid,
        // clear return reason nếu trước đây bị return rồi resubmit
        returnedAt: null,
        returnReason: null,
        updatedAt: now,
      });
      return { ok: true } as const;
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // TODO Phase 3: gửi notification cho kế toán cơ sở
    // import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
    // await sendNotificationEvent({ type: 'sales_batch_submitted', ... });
    void FieldValue; // silence unused import warning (sẽ dùng Phase 2)

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/batches/[id]/submit] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
