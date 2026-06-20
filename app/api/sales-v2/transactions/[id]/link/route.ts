// POST /api/sales-v2/transactions/[id]/link  body { matchedTransactionId: string }
//   Kế toán chọn manual candidate cho tx 'thanh_toan_not'.
//   Validate cùng branch+phone+packageCode, atomic update target.debt + tx.matchStatus.
// Phase 4 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canAccountantReview, getScopeRole } from '@/lib/sales-v2/scope';
import { linkTransaction } from '@/lib/sales-v2/auto-match';
import { serializeTransaction } from '@/lib/sales-v2/serialize';
import { assertMonthNotLockedIfEnabled, MonthLockedError } from '@/lib/sales-v2/month-lock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    if (!canAccountantReview(caller.profile.role_code)) {
      return NextResponse.json({ error: 'Chỉ kế toán/top role được link' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const targetTxId = String(body?.matchedTransactionId ?? '').trim();
    if (!targetTxId) return NextResponse.json({ error: 'Thiếu matchedTransactionId' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const txDoc = await db.collection(COLLECTIONS.SALES_TRANSACTIONS).doc(id).get();
    if (!txDoc.exists) return NextResponse.json({ error: 'Tx không tồn tại' }, { status: 404 });
    const tx = txDoc.data() ?? {};

    const role = getScopeRole(caller.profile.role_code);
    if (role === 'accountant') {
      if (!caller.profile.facility_id || tx.branchId !== caller.profile.facility_id) {
        return NextResponse.json({ error: 'Tx không thuộc cơ sở của bạn' }, { status: 403 });
      }
    }

    // M2.1 PR-3B (2026-06-20): enforce month lock — dùng tx.branchId + tx.month
    // (tx schema có month denormalize từ batch).
    try {
      await assertMonthNotLockedIfEnabled(
        tx.branchId, String(tx.month ?? ''),
        caller.profile.uid, String(caller.profile.role_code ?? ''),
      );
    } catch (err) {
      if (err instanceof MonthLockedError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }

    const result = await linkTransaction(db, id, targetTxId, {
      uid: caller.profile.uid,
      name: caller.actorName,
    });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

    const newDoc = await db.collection(COLLECTIONS.SALES_TRANSACTIONS).doc(id).get();
    return NextResponse.json({ ok: true, transaction: serializeTransaction(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/transactions/[id]/link] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
