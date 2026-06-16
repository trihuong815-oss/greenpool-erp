// GET /api/sales-v2/batches/[id] — chi tiết 1 batch.
// PATCH /api/sales-v2/batches/[id] — kế toán/Sale update fields (status, returnReason).
//   Sale: chỉ status='draft' → vô tác (recompute totals tự động qua transaction).
//   Kế toán: approve / return.
// Phase 1 chỉ care GET. Approve/return sẽ làm Phase 2.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canReadBatch } from '@/lib/sales-v2/scope';
import { serializeBatch } from '@/lib/sales-v2/serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const doc = await db.collection(COLLECTIONS.SALES_DAILY_BATCHES).doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = doc.data() ?? {};
    if (!canReadBatch(caller, { saleId: data.saleId, branchId: data.branchId })) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    return NextResponse.json({ ok: true, batch: serializeBatch(doc.id, data) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/batches/[id]] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
