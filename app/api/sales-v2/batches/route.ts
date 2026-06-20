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
import type { BatchStatus, SalesDailyBatch } from '@/lib/types/sales-v2';
import { isFlagEnabled } from '@/lib/feature-flags/server';

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
    let batches = snap.docs
      .map((d) => serializeBatch(d.id, d.data()))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    // 2026-06-17: KHÔNG show batch draft + 0 GD (orphan/placeholder Sale chưa nhập).
    // Sale tự thấy batch của mình ở /nhap. Kế toán/QLCS/top không cần xem batch trống.
    // EXCEPT: nếu Sale tự gọi (role=sale) thì vẫn show draft của mình ở /nhap (qua API
    // get-or-create riêng, không qua endpoint này).
    batches = batches.filter((b) => !(b.status === 'draft' && b.totalTransactions === 0));

    // M2.1 PR-4 (2026-06-20): enrich submitterRoleType — flag-gated.
    // Flag OFF → KHÔNG fetch users → 0 extra read → response y PR-3B.
    // Flag ON → batch fetch users.roleId qua chunk 30, derive 'sale'|'qlcs'|'other'.
    const role_code = String(caller.profile.role_code ?? '');
    const flagOn = await isFlagEnabled('SALES_V2_QLCS_BADGE', caller.profile.uid, role_code);
    if (flagOn && batches.length > 0) {
      batches = await enrichSubmitterRoleType(db, batches);
    }

    return NextResponse.json({ ok: true, batches });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/batches] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

/** M2.1 PR-4 (2026-06-20) — Derive submitterRoleType từ users.roleId của saleId.
 *  Batch fetch users qua chunk 30 (Firestore 'in' limit) + cache trong Map.
 *  Fail-safe: user delete / lookup lỗi → 'other'. KHÔNG throw. */
async function enrichSubmitterRoleType(
  db: FirebaseFirestore.Firestore,
  batches: SalesDailyBatch[],
): Promise<SalesDailyBatch[]> {
  // Gom unique saleIds
  const uids = Array.from(new Set(batches.map((b) => b.saleId).filter(Boolean)));
  if (uids.length === 0) return batches;

  const roleByUid = new Map<string, string>();
  try {
    // Chunk 30 (Firestore 'in' limit). Worst case 7 chunks cho 200 unique uids.
    for (let i = 0; i < uids.length; i += 30) {
      const chunk = uids.slice(i, i + 30);
      const refs = chunk.map((u) => db.collection(COLLECTIONS.USERS).doc(u));
      const snaps = await db.getAll(...refs);
      snaps.forEach((s) => {
        if (!s.exists) return;
        const u = s.data() ?? {};
        roleByUid.set(s.id, String(u.roleId ?? ''));
      });
    }
  } catch (e: any) {
    console.warn('[sales-v2/batches] enrich users fail (silent fallback):', e?.message);
    // Trả về batches nguyên — undefined submitterRoleType. UI tự ẩn badge.
    return batches;
  }

  return batches.map((b) => {
    const role = roleByUid.get(b.saleId) ?? '';
    let kind: 'sale' | 'qlcs' | 'other' = 'other';
    if (role === 'NV_SALE' || role === 'NV_SALE_PT') kind = 'sale';
    else if (role.startsWith('QLCS_')) kind = 'qlcs';
    return { ...b, submitterRoleType: kind };
  });
}
