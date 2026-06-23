// PR-CASH1G (2026-06-23) — GET monthly summary Thu-Chi.
//
// GET /api/finance/cashflow-reports/monthly-summary?month=YYYY-MM&branchId=...
//
// Permission scope (reuse getReportBranchScope):
//   - TOP_READ + THU_QUY/TP_GS/TP_KE/ADMIN/CEO/CHU_TICH/GD_KD/GD_VP: scope=system
//     hoặc nếu branchId param truyền → scope=branch lọc branch đó.
//   - NV_KE + QLCS_*: branch own only. Nếu branchId param khác → 403.
//   - NV_SALE: 403.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isBranchId, type BranchId } from '@/lib/branches';
import { getReportBranchScope } from '@/lib/finance/cashflow-report-permissions';
import { computeMonthlySummary, type ReportDoc } from '@/lib/finance/cashflow-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    const callerBranchId = caller.profile.facility_id ?? null;

    const scope = getReportBranchScope(role, callerBranchId);
    if (!scope.allBranches && !scope.branchId) {
      return NextResponse.json({ error: 'Không có quyền xem tổng hợp thu-chi' }, { status: 403 });
    }

    const qs = req.nextUrl.searchParams;
    const month = qs.get('month');
    const branchIdParam = qs.get('branchId');

    if (!month || !MONTH_RE.test(month)) {
      return NextResponse.json({ error: 'month sai format (YYYY-MM)' }, { status: 400 });
    }

    // Resolve effective branch (scope=branch ⇒ chỉ branchId của user; scope=system ⇒ optional filter).
    let effectiveBranchId: BranchId | null = null;
    let resolvedScope: 'system' | 'branch';
    if (scope.allBranches) {
      if (branchIdParam) {
        if (!isBranchId(branchIdParam)) {
          return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
        }
        effectiveBranchId = branchIdParam;
        resolvedScope = 'branch';
      } else {
        resolvedScope = 'system';
      }
    } else {
      // branch-scoped role
      if (branchIdParam && branchIdParam !== scope.branchId) {
        return NextResponse.json({ error: 'Chỉ xem được cơ sở mình' }, { status: 403 });
      }
      effectiveBranchId = scope.branchId as BranchId;
      resolvedScope = 'branch';
    }

    // Query dailyCashflowReports theo month — single-field equality, không cần composite.
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS)
      .where('month', '==', month)
      .limit(1000)
      .get();

    const reports: ReportDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const summary = computeMonthlySummary({
      month,
      scope: resolvedScope,
      branchId: effectiveBranchId,
      reports,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/monthly-summary] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
