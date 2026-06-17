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
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { markActionDoneForEntity } from '@/lib/firebase/notifications-store';
import { fmtDateVi } from '@/lib/sales-v2/recipients';
import { runAutoMatchForBatch } from '@/lib/sales-v2/auto-match';

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

      // V6 2026-06-17: validate TẤT CẢ tx có reviewStatus='approved'
      const txSnap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
        .where('batchId', '==', id)
        .get();
      if (txSnap.empty) {
        return { error: 'Batch không có giao dịch', status: 400 } as const;
      }
      let totalSales = 0, totalCollected = 0;
      let pendingCount = 0, rejectedCount = 0;
      txSnap.forEach((d) => {
        const x = d.data();
        totalSales += Number(x.packageValue ?? 0);
        totalCollected += Number(x.collectedToday ?? 0);
        const rs = x.reviewStatus ?? 'pending';
        if (rs === 'pending') pendingCount++;
        else if (rs === 'rejected') rejectedCount++;
      });
      if (pendingCount > 0) {
        return { error: `Còn ${pendingCount} giao dịch chưa review`, status: 400 } as const;
      }
      if (rejectedCount > 0) {
        return { error: `Có ${rejectedCount} giao dịch bị đánh dấu lỗi — phải Trả lại Sale thay vì Duyệt`, status: 400 } as const;
      }
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

    // Audit BUG-1 fix 2026-06-17: mark noti của caller (kế toán) done — clear badge sidebar.
    void markActionDoneForEntity(caller.profile.uid, id);

    // V6.5 Notification (Phase 3 wire): gửi cho Sale "Batch đã duyệt"
    try {
      const batchSnap = await batchRef.get();
      const batch = batchSnap.data() ?? {};
      if (batch.saleId && batch.saleId !== caller.profile.uid) {
        await sendNotificationEvent({
          type: 'sales_batch_approved',
          module: 'sales',
          entityId: id,
          entityCode: batch.date,
          title: `Bảng doanh số ${fmtDateVi(batch.date)} đã đối chiếu ✓`,
          message: `${caller.actorName} đã duyệt ${batch.totalTransactions} giao dịch (DS ${Number(batch.totalSalesAmount ?? 0).toLocaleString()}đ)`,
          // BUG-2 audit fix: /tong-ket chưa build (Phase 5) → tạm trỏ /nhap với date param
          linkUrl: `/doanh-so-v2/nhap?date=${encodeURIComponent(batch.date)}`,
          recipients: [batch.saleId],
          priority: 'normal',
          pushTag: `sales-batch-${id}`,
        });
      }
    } catch (e: any) {
      console.warn('[sales-v2/approve] noti send fail:', e?.message);
    }

    // V6 Phase 4 (2026-06-17): trigger auto-link cho tx thanh_toan_not.
    // Chạy fire-and-forget, không block response. Kết quả trả về stats.
    let matchStats = { matched: 0, needsReview: 0, noMatch: 0 };
    try {
      matchStats = await runAutoMatchForBatch(db, id, {
        uid: caller.profile.uid,
        name: caller.actorName,
      });
    } catch (e: any) {
      console.warn('[approve] auto-match fail:', e?.message);
    }

    return NextResponse.json({ ok: true, autoMatch: matchStats });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/batches/[id]/approve] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
