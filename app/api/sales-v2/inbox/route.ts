// GET /api/sales-v2/inbox — list batch user cần xử lý cho bell dropdown.
//   - Sale: batch của mình status=returned (cần sửa lại)
//   - Kế toán/QLCS (cùng cơ sở): batch status=pending_review
//   - TP_KE/top: batch status=pending_review (all branches)
// Trả { rows: [...] } same shape các noti endpoint khác.
// 2026-06-17 — Phase 3.4 wire bell dropdown.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { getScopeRole } from '@/lib/sales-v2/scope';
import { serializeBatch } from '@/lib/sales-v2/serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX = 10;

export async function GET(_req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = getScopeRole(caller.profile.role_code);
    if (!role) return NextResponse.json({ rows: [] });

    const db = getFirebaseAdminDb();
    // Single-field where → no composite index. Filter status client-side.
    let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.SALES_DAILY_BATCHES);
    let targetStatus: string;

    if (role === 'sale') {
      query = query.where('saleId', '==', caller.profile.uid);
      targetStatus = 'returned';
    } else if (role === 'accountant' || role === 'qlcs') {
      if (!caller.profile.facility_id) return NextResponse.json({ rows: [] });
      query = query.where('branchId', '==', caller.profile.facility_id);
      targetStatus = 'pending_review';
    } else if (role === 'top') {
      query = query.where('status', '==', 'pending_review');
      targetStatus = 'pending_review';
    } else {
      return NextResponse.json({ rows: [] });
    }

    const snap = await query.limit(200).get();
    const rows = snap.docs
      .map((d) => serializeBatch(d.id, d.data()))
      .filter((b) => b.status === targetStatus)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX);
    return NextResponse.json({ rows });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ rows: [] });
    }
    console.error('[sales-v2/inbox] GET error:', err);
    return NextResponse.json({ rows: [] });
  }
}
