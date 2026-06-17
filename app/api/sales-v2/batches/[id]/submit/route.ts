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
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { markActionDoneForEntity } from '@/lib/firebase/notifications-store';
import { resolveAccountantsByBranch, fmtDateVi } from '@/lib/sales-v2/recipients';
import { branchName } from '@/lib/branches';

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

      // Recompute totals từ transactions + reset reviewStatus về pending
      const txSnap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
        .where('batchId', '==', id)
        .get();
      if (txSnap.empty) {
        return { error: 'Chưa có giao dịch nào', status: 400 } as const;
      }
      // V6 2026-06-17: validate SĐT tất cả tx hợp lệ (10 số bắt đầu 0) trước khi submit
      const invalidPhones: string[] = [];
      let totalSales = 0, totalCollected = 0;
      txSnap.forEach((d) => {
        const x = d.data();
        totalSales += Number(x.packageValue ?? 0);
        totalCollected += Number(x.collectedToday ?? 0);
        const phone = String(x.phone ?? '');
        if (!/^0\d{9}$/.test(phone)) {
          invalidPhones.push(String(x.customerName ?? '?'));
        }
      });
      if (invalidPhones.length > 0) {
        const sample = invalidPhones.slice(0, 3).join(', ');
        const more = invalidPhones.length > 3 ? `... (+${invalidPhones.length - 3})` : '';
        return {
          error: `Có ${invalidPhones.length} giao dịch SĐT chưa hợp lệ (cần 10 số bắt đầu 0): ${sample}${more}`,
          status: 400,
        } as const;
      }
      const totalDebt = totalSales - totalCollected;

      // V6 2026-06-17 (revised): CHỈ reset tx có reviewStatus='rejected' về 'pending'.
      // Tx 'approved' giữ approved → kế toán không cần review lại.
      // Tx 'pending' giữ pending (chưa review).
      // → Sale chỉ phải sửa các tx bị từ chối; kế toán chỉ review các tx pending mới.
      const now = Timestamp.now();
      txSnap.forEach((d) => {
        const x = d.data();
        const rs = x.reviewStatus ?? 'pending';
        if (rs === 'rejected') {
          tx.update(d.ref, {
            reviewStatus: 'pending',
            rejectReason: null,
            reviewedAt: null,
            reviewedBy: null,
            updatedAt: now,
          });
        }
      });

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

    // Audit BUG-1 fix: Sale resubmit batch returned → mark noti returned của Sale done
    void markActionDoneForEntity(caller.profile.uid, id);

    // V6.5 Notification (Phase 3 wire 2026-06-17): gửi cho kế toán cơ sở
    void FieldValue; // silence import
    try {
      // Re-fetch batch để có thông tin sau update
      const batchSnap = await batchRef.get();
      const batch = batchSnap.data() ?? {};
      const branchId = String(batch.branchId ?? '');
      const accountantUids = await resolveAccountantsByBranch(branchId);
      if (accountantUids.length > 0) {
        await sendNotificationEvent({
          type: 'sales_batch_submitted',
          module: 'sales',
          entityId: id,
          entityCode: batch.date,
          title: `${batch.saleName} gửi đối chiếu ${fmtDateVi(batch.date)}`,
          message: `${batch.totalTransactions} giao dịch · DS ${Number(batch.totalSalesAmount ?? 0).toLocaleString()}đ — cần đối chiếu (${branchName(branchId)})`,
          linkUrl: '/doanh-so-v2/doi-chieu',
          recipients: accountantUids,
          priority: 'high',
          pushTag: `sales-batch-${id}`,
        });
      }
    } catch (e: any) {
      console.warn('[sales-v2/submit] noti send fail:', e?.message);
      // KHÔNG fail flow nếu noti lỗi — Sale vẫn submit thành công
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/batches/[id]/submit] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
