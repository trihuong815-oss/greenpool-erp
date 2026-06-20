// M2.1 PR-3A (2026-06-20) — POST /api/sales-v2/month-locks/[branchId]/[month]/lock
//   Khoá kỳ tháng × cơ sở.
//   Role được lock: TP_KE / CEO / CHU_TICH / ADMIN. Lý do optional ở PR-3A.
//   Ghi audit log action='lock_month' (qua recordSalesAuditIfEnabled).
//   PR-3A KHÔNG enforce middleware vào tx mutation — chỉ tạo lock doc.
//   PR-3B sẽ wire assertMonthNotLocked() vào tx POST/PATCH/DELETE/submit.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isBranchId } from '@/lib/branches';
import { lockMonth, isValidMonth } from '@/lib/sales-v2/month-lock';
import { recordSalesAuditIfEnabled } from '@/lib/sales-v2/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_LOCK_ROLES = new Set(['TP_KE', 'CEO', 'CHU_TICH', 'ADMIN']);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ branchId: string; month: string }> },
) {
  try {
    const { branchId, month } = await ctx.params;
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');

    if (!ALLOWED_LOCK_ROLES.has(role)) {
      return NextResponse.json({ error: 'Chỉ TP_KE/CEO/CHU_TICH/ADMIN được khoá kỳ' }, { status: 403 });
    }
    if (!isBranchId(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    if (!isValidMonth(month)) {
      return NextResponse.json({ error: 'month không hợp lệ (YYYY-MM)' }, { status: 400 });
    }

    // Optional note — PR-3A KHÔNG bắt buộc reason khi lock.
    const body = await req.json().catch(() => null);
    const note = body?.note ? String(body.note).trim().slice(0, 500) : null;

    // Mutation chính
    const result = await lockMonth({
      branchId,
      month,
      actorUid: caller.profile.uid,
      actorName: caller.actorName,
      actorRole: role,
    });

    // M2.1 PR-2 pattern: audit SAU mutation chính. Silent + fail-soft.
    void recordSalesAuditIfEnabled({
      module: 'batch',  // lock áp cho batch tháng → coi module='batch'
      action: 'lock_month',
      branchId,
      month,
      newValue: { locked: true, lockedByName: caller.actorName },
      reason: note,
      actorUid: caller.profile.uid,
      actorName: caller.actorName,
      actorRole: role,
    }, caller.profile.uid, role);

    return NextResponse.json({
      ok: true,
      branchId: result.branchId,
      month: result.month,
      locked: result.locked,
      lockedByName: result.lockedByName,
      lockedAt: result.lockedAt?.toDate().toISOString() ?? null,
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/month-locks/lock] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
