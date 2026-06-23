// PR-CASH1G (2026-06-23) — GET export Excel báo cáo Thu-Chi.
//
// GET /api/finance/cashflow-reports/export?mode=daily&date=&branchId=
// GET /api/finance/cashflow-reports/export?mode=monthly&month=&branchId=
// GET /api/finance/cashflow-reports/export?mode=yearly&year=&branchId=
//
// Permission scope: reuse getReportBranchScope.
// NV_SALE → 403. NV_KE/QLCS → own branch only.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { isBranchId, BRANCH_BY_ID, type BranchId } from '@/lib/branches';
import { getReportBranchScope } from '@/lib/finance/cashflow-report-permissions';
import { computeMonthlySummary, computeYearlySummary, type ReportDoc } from '@/lib/finance/cashflow-summary';
import {
  buildDailyWorkbook,
  buildMonthlyWorkbook,
  buildYearlyWorkbook,
  buildExportFilename,
} from '@/lib/finance/cashflow-export-excel';
import { buildCashflowReportId } from '@/lib/finance/cashflow-report-types';
import type { BranchDailyExpenseDoc } from '@/lib/finance/expense-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    const callerBranchId = caller.profile.facility_id ?? null;

    const scope = getReportBranchScope(role, callerBranchId);
    if (!scope.allBranches && !scope.branchId) {
      return NextResponse.json({ error: 'Không có quyền xuất báo cáo thu-chi' }, { status: 403 });
    }

    const qs = req.nextUrl.searchParams;
    const mode = qs.get('mode') as 'daily' | 'monthly' | 'yearly' | null;
    const branchIdParam = qs.get('branchId');

    if (mode !== 'daily' && mode !== 'monthly' && mode !== 'yearly') {
      return NextResponse.json({ error: 'mode phải là daily|monthly|yearly' }, { status: 400 });
    }

    // Resolve effective branch
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
        return NextResponse.json({ error: 'Chỉ xuất được cơ sở mình' }, { status: 403 });
      }
      effectiveBranchId = scope.branchId as BranchId;
      resolvedScope = 'branch';
    }

    const db = getFirebaseAdminDb();
    let buffer: ArrayBuffer | Uint8Array;
    let filename: string;

    if (mode === 'daily') {
      const date = qs.get('date');
      if (!date || !DATE_RE.test(date)) return NextResponse.json({ error: 'date sai format' }, { status: 400 });
      if (!effectiveBranchId) return NextResponse.json({ error: 'daily mode phải chỉ định branchId' }, { status: 400 });

      const reportRef = db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS).doc(buildCashflowReportId(effectiveBranchId, date));
      const reportDoc = await reportRef.get();
      const report = reportDoc.exists ? { id: reportDoc.id, ...(reportDoc.data() as any) } : null;

      const expSnap = await db.collection(COLLECTIONS.BRANCH_DAILY_EXPENSES)
        .where('branchId', '==', effectiveBranchId)
        .where('date', '==', date)
        .orderBy('createdAt', 'desc')
        .limit(500)
        .get();
      const expenses: Array<BranchDailyExpenseDoc & { id: string }> =
        expSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      const branchName = BRANCH_BY_ID[effectiveBranchId]?.name ?? effectiveBranchId;
      buffer = (await buildDailyWorkbook({
        report, expenses, date, branchId: effectiveBranchId, branchName,
      })) as ArrayBuffer;
      filename = buildExportFilename({ mode: 'daily', date, branchId: effectiveBranchId });
    } else if (mode === 'monthly') {
      const month = qs.get('month');
      if (!month || !MONTH_RE.test(month)) return NextResponse.json({ error: 'month sai format' }, { status: 400 });

      const snap = await db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS)
        .where('month', '==', month)
        .limit(1000)
        .get();
      const reports: ReportDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      const summary = computeMonthlySummary({ month, scope: resolvedScope, branchId: effectiveBranchId, reports });
      buffer = (await buildMonthlyWorkbook(summary)) as ArrayBuffer;
      filename = buildExportFilename({ mode: 'monthly', month, branchId: effectiveBranchId });
    } else {
      const yearStr = qs.get('year');
      if (!yearStr || !/^\d{4}$/.test(yearStr)) return NextResponse.json({ error: 'year sai format' }, { status: 400 });
      const year = Number(yearStr);

      const snap = await db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS)
        .where('date', '>=', `${yearStr}-01-01`)
        .where('date', '<=', `${yearStr}-12-31`)
        .limit(3000)
        .get();
      const reports: ReportDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      const summary = computeYearlySummary({ year, scope: resolvedScope, branchId: effectiveBranchId, reports });
      buffer = (await buildYearlyWorkbook(summary)) as ArrayBuffer;
      filename = buildExportFilename({ mode: 'yearly', year, branchId: effectiveBranchId });
    }

    void writeAuditLog({
      action: 'export_cashflow_excel', module: 'finance', userId: caller.profile.uid,
      branchId: effectiveBranchId ?? null,
      before: null,
      after: { mode, filename, scope: resolvedScope },
      actorName: caller.actorName, actorRole: role, source: 'api',
    }).catch(() => {});

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/export] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
