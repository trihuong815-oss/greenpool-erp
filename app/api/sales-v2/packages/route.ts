// GET /api/sales-v2/packages — list packages active của 1 branch (autocomplete cho Sale nhập).
// Authorization: Sale lấy theo branch của chính mình (ignore param ?branchId);
// kế toán/QLCS/top có thể truyền ?branchId tuỳ ý.
// Phase 1 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canSaleEnter, getScopeRole } from '@/lib/sales-v2/scope';
import { listPackagesForBranch } from '@/lib/sales-v2/packages';
import { isBranchId, type BranchId } from '@/lib/branches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = getScopeRole(caller.profile.role_code);
    if (!role) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    // Sale: luôn dùng branch của mình
    let branchId: BranchId | null = null;
    if (canSaleEnter(caller.profile.role_code)) {
      const b = caller.profile.facility_id;
      if (!b || !isBranchId(b)) {
        return NextResponse.json({ error: 'Tài khoản Sale chưa được gán cơ sở' }, { status: 400 });
      }
      branchId = b;
    } else {
      const qb = req.nextUrl.searchParams.get('branchId');
      if (!qb || !isBranchId(qb)) {
        return NextResponse.json({ error: 'Thiếu hoặc sai branchId' }, { status: 400 });
      }
      branchId = qb;
    }

    const packages = await listPackagesForBranch(branchId);
    return NextResponse.json({ ok: true, branchId, packages });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/packages] GET error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
