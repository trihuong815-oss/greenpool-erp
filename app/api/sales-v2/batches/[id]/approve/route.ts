// POST /api/sales-v2/batches/[id]/approve — kế toán duyệt batch.
//   - Validate: caller = kế toán + cùng cơ sở batch
//   - Validate: batch.status = pending_review (đã submit)
//   - Recompute totals từ transactions (transaction có thể đã được kế toán sửa)
//   - Set status=approved, reviewedAt, reviewedBy
//   - Audit log action='approve'
// Phase 3 sẽ wire: gửi noti cho Sale + trigger auto-link cho thanh_toan_not.
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

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    if (!canAccountantReview(caller.profile.role_code)) {
      return NextResponse.json({ error: 'Chỉ kế toán/quản lý mới được duyệt' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    const batchRef = db.collection(COLLECTIONS.SALES_DAILY_BATCHES).doc(id);

    const result = await db.runTransaction(async (tx) => {
      const batchSnap = await tx.get(batchRef);
      if (!batchSnap.exists) return { error: 'Không tìm thấy batch', status: 404 } as const;
      const batch = batchSnap.data() ?? {};

      // Scope: accountant cùng cơ sở; top role ok all
      const role = getScopeRole(caller.profile.role_code);
      if (role === 'accountant') {
        if (!caller.profile.facility_id || batch.branchId !== caller.profile.facility_id) {
          return { error: 'Batch không thuộc cơ sở của bạn', status: 403 } as const;
        }
      }

      if (batch.status !== 'pending_review') {
        return { error: `Batch đang ở trạng thái ${batch.status}, không thể duyệt`, status: 400 } as const;
      }

      // Recompute totals
      const txSnap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
        .where('batchId', '==', id)
        .get();
      let totalSales = 0, totalCollected = 0;
      txSnap.forEach((d) => {
        const x = d.data();
        totalSales += Number(x.packageValue ?? 0);
        totalCollected += Number(x.collectedToday ?? 0);
      });
      const totalDebt = totalSales - totalCollected;

      const now = Timestamp.now();
      tx.update(batchRef, {
        status: 'approved',
        totalTransactions: txSnap.size,
        totalSalesAmount: totalSales,
        totalCollectedAmount: totalCollected,
        totalDebtAmount: totalDebt,
        reviewedAt: now,
        reviewedBy: caller.profile.uid,
        updatedAt: now,
      });
      return { ok: true } as const;
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Audit (fire-and-forget)
    void writeSalesAudit({
      db,
      batchId: id,
      action: 'approve',
      changedBy: caller.profile.uid,
      changedByName: caller.actorName,
    });

    // TODO Phase 3: gửi noti cho Sale "Batch đã được duyệt"
    // TODO Phase 4: trigger auto-link cho thanh_toan_not transactions

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/batches/[id]/approve] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
