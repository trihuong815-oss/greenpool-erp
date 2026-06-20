// M2.1 PR-3A (2026-06-20) — GET /api/sales-v2/month-locks?branchId=&month=
//   Trả trạng thái khoá kỳ của 1 (branchId, month).
//   Scope read: TP_KE/CEO/CHU_TICH/ADMIN all branches; QLCS_*/NV_KE chỉ branch
//   của mình (qua facility_id hoặc fallback QLCS_FACILITY).
//   PR-3A KHÔNG enforce middleware vào tx mutation — chỉ trả state để UI render.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isBranchId } from '@/lib/branches';
import { isTopAdmin, QLCS_FACILITY } from '@/lib/permissions';
import { getMonthLockState, isValidMonth } from '@/lib/sales-v2/month-lock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function canReadBranchLock(role: string, callerBranch: string | null, targetBranch: string): boolean {
  if (isTopAdmin(role) || role === 'CHU_TICH' || role === 'TP_KE') return true;
  if (role === 'GD_KD' || role === 'GD_VP') return true;
  // QLCS_X / NV_KE chỉ thấy branch mình
  if (role === 'NV_KE') return callerBranch === targetBranch;
  if (role.startsWith('QLCS_')) {
    const ownBranch = callerBranch ?? QLCS_FACILITY[role] ?? null;
    return ownBranch === targetBranch;
  }
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const qs = req.nextUrl.searchParams;
    const branchId = qs.get('branchId') ?? '';
    const month = qs.get('month') ?? '';

    if (!isBranchId(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    if (!isValidMonth(month)) {
      return NextResponse.json({ error: 'month không hợp lệ (YYYY-MM)' }, { status: 400 });
    }
    const role = String(caller.profile.role_code ?? '');
    if (!canReadBranchLock(role, caller.profile.facility_id ?? null, branchId)) {
      return NextResponse.json({ error: 'Không có quyền xem trạng thái khoá kỳ cơ sở này' }, { status: 403 });
    }

    const state = await getMonthLockState(branchId, month);
    // Convert Timestamp → ISO cho client JSON serialize an toàn
    return NextResponse.json({
      ok: true,
      branchId,
      month,
      locked: state.locked,
      lockedByName: state.lockedByName,
      lockedAt: state.lockedAt?.toDate().toISOString() ?? null,
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/month-locks] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
