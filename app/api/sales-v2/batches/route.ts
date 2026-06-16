// GET /api/sales-v2/batches?status=pending_review&branchId=X&date=YYYY-MM-DD&limit=100
//   - Kế toán/QLCS xem batch của cơ sở mình
//   - Top role (ADMIN/CEO/GD) xem toàn bộ
//   - Sale: chỉ batch của mình (auto scope, ignore branchId param)
//   - Default sort: updatedAt desc
// Phase 2 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { getScopeRole } from '@/lib/sales-v2/scope';
import { serializeBatch } from '@/lib/sales-v2/serialize';
import { isBranchId } from '@/lib/branches';
import type { BatchStatus } from '@/lib/types/sales-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUS = new Set<BatchStatus>(['draft', 'pending_review', 'approved', 'returned', 'locked']);
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = getScopeRole(caller.profile.role_code);
    if (!role) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const statusFilter = qs.get('status');
    const branchFilter = qs.get('branchId');
    const dateFilter = qs.get('date'); // YYYY-MM-DD exact match
    const limit = Math.min(Number(qs.get('limit') ?? 100), MAX_LIMIT);

    const db = getFirebaseAdminDb();
    let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.SALES_DAILY_BATCHES);

    // Scope by role
    if (role === 'sale') {
      query = query.where('saleId', '==', caller.profile.uid);
    } else if (role === 'accountant' || role === 'qlcs') {
      if (!caller.profile.facility_id) {
        return NextResponse.json({ error: 'Tài khoản chưa được gán cơ sở' }, { status: 400 });
      }
      query = query.where('branchId', '==', caller.profile.facility_id);
    } else if (role === 'top' && branchFilter && isBranchId(branchFilter)) {
      query = query.where('branchId', '==', branchFilter);
    }

    if (statusFilter && VALID_STATUS.has(statusFilter as BatchStatus)) {
      query = query.where('status', '==', statusFilter);
    }
    if (dateFilter && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
      query = query.where('date', '==', dateFilter);
    }

    // Sort client-side để tránh composite index (~200 docs).
    const snap = await query.limit(limit).get();
    const batches = snap.docs
      .map((d) => serializeBatch(d.id, d.data()))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return NextResponse.json({ ok: true, batches });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/batches] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
