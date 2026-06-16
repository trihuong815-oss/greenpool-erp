// POST /api/sales-v2/batches/today — get-or-create batch hôm nay của Sale đăng nhập.
// Idempotent: nếu đã có batch (bất kỳ status) → trả về batch đó.
// Authorization: chỉ Sale (NV_SALE / NV_SALE_PT).
// Phase 1 (2026-06-17).

import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { resolveSaleContext } from '@/lib/sales-v2/scope';
import { serializeBatch, todayInVN, monthFromDate } from '@/lib/sales-v2/serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const caller = await getAuthedCaller();
    const ctx = await resolveSaleContext(caller);
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: 403 });

    const date = todayInVN();
    const month = monthFromDate(date);
    const db = getFirebaseAdminDb();
    const col = db.collection(COLLECTIONS.SALES_DAILY_BATCHES);

    // Doc id deterministic = ${saleId}_${date} → idempotent lookup không cần composite index.
    const docId = `${ctx.saleId}_${date}`;
    const ref = col.doc(docId);
    const existing = await ref.get();
    if (existing.exists) {
      return NextResponse.json({ ok: true, batch: serializeBatch(existing.id, existing.data() ?? {}), created: false });
    }

    // Create new batch (draft)
    const now = Timestamp.now();
    const data = {
      date,
      month,
      branchId: ctx.branchId,
      branchName: ctx.branchName,
      saleId: ctx.saleId,
      saleName: ctx.saleName,
      status: 'draft' as const,
      totalTransactions: 0,
      totalSalesAmount: 0,
      totalCollectedAmount: 0,
      totalDebtAmount: 0,
      submittedAt: null,
      submittedBy: null,
      reviewedAt: null,
      reviewedBy: null,
      returnedAt: null,
      returnReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);
    return NextResponse.json({ ok: true, batch: serializeBatch(ref.id, data), created: true });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/batches/today] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
