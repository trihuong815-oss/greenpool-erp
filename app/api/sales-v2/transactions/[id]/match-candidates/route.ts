// GET /api/sales-v2/transactions/[id]/match-candidates
//   Trả về list candidate cho tx 'thanh_toan_not' (cùng branch+phone+packageCode+customerName, còn debt).
//   Authorization: kế toán/top (caller có thể edit batch chứa tx).
// Phase 4 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canAccountantReview, getScopeRole } from '@/lib/sales-v2/scope';
import { findMatchCandidates } from '@/lib/sales-v2/auto-match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    if (!canAccountantReview(caller.profile.role_code)) {
      return NextResponse.json({ error: 'Chỉ kế toán/top role được match' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    const txDoc = await db.collection(COLLECTIONS.SALES_TRANSACTIONS).doc(id).get();
    if (!txDoc.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const tx = txDoc.data() ?? {};

    // Scope: accountant cùng cơ sở
    const role = getScopeRole(caller.profile.role_code);
    if (role === 'accountant') {
      if (!caller.profile.facility_id || tx.branchId !== caller.profile.facility_id) {
        return NextResponse.json({ error: 'Tx không thuộc cơ sở của bạn' }, { status: 403 });
      }
    }

    if (tx.transactionType !== 'thanh_toan_not') {
      return NextResponse.json({ ok: true, candidates: [] });
    }

    const candidates = await findMatchCandidates(db, {
      id,
      branchId: String(tx.branchId ?? ''),
      phone: String(tx.phone ?? ''),
      packageCode: String(tx.packageCode ?? ''),
      customerName: String(tx.customerName ?? ''),
    });

    return NextResponse.json({ ok: true, candidates });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/transactions/[id]/match-candidates] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
