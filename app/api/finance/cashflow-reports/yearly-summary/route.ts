// PR-CASH1G (2026-06-23) — GET yearly summary Thu-Chi.
//
// GET /api/finance/cashflow-reports/yearly-summary?year=YYYY&branchId=...

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isBranchId, type BranchId } from '@/lib/branches';
import { getReportBranchScope } from '@/lib/finance/cashflow-report-permissions';
import { computeYearlySummary, type ReportDoc } from '@/lib/finance/cashflow-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const yearStr = qs.get('year');
    const branchIdParam = qs.get('branchId');

    if (!yearStr || !/^\d{4}$/.test(yearStr)) {
      return NextResponse.json({ error: 'year sai format (YYYY)' }, { status: 400 });
    }
    const year = Number(yearStr);

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
      if (branchIdParam && branchIdParam !== scope.branchId) {
        return NextResponse.json({ error: 'Chỉ xem được cơ sở mình' }, { status: 403 });
      }
      effectiveBranchId = scope.branchId as BranchId;
      resolvedScope = 'branch';
    }

    // Query reports cho year via range date (year-prefixed). Single-field range không cần composite.
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS)
      .where('date', '>=', `${yearStr}-01-01`)
      .where('date', '<=', `${yearStr}-12-31`)
      .limit(3000)
      .get();
    const reports: ReportDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const summary = computeYearlySummary({
      year, scope: resolvedScope, branchId: effectiveBranchId, reports,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/yearly-summary] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
