// PR-CASH1B (2026-06-23) — GET list dailyCashflowReports.
//
// GET /api/finance/cashflow-reports?date=&month=&branchId=&status=
//   - top role + THU_QUY + TP_GS: all
//   - NV_KE + QLCS: branch mình (force)

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  getReportBranchScope,
} from '@/lib/finance/cashflow-report-permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const VALID_STATUSES = new Set(['draft', 'submitted', 'sent', 'checked', 'returned', 'locked']);

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    const callerBranchId = caller.profile.facility_id ?? null;

    const scope = getReportBranchScope(role, callerBranchId);
    if (!scope.allBranches && !scope.branchId) {
      return NextResponse.json({ error: 'Không có quyền xem báo cáo thu-chi' }, { status: 403 });
    }

    const qs = req.nextUrl.searchParams;
    const date = qs.get('date');
    const month = qs.get('month');
    // PR-CASH-DATE-RANGE-UX (2026-06-24): date range thật, KHÔNG fake. Cap 31 ngày.
    const dateFrom = qs.get('dateFrom');
    const dateTo = qs.get('dateTo');
    const branchIdParam = qs.get('branchId');
    const statusParam = qs.get('status');

    if (date && !DATE_RE.test(date)) {
      return NextResponse.json({ error: 'date sai format' }, { status: 400 });
    }
    if (month && !MONTH_RE.test(month)) {
      return NextResponse.json({ error: 'month sai format' }, { status: 400 });
    }
    if (dateFrom && !DATE_RE.test(dateFrom)) {
      return NextResponse.json({ error: 'dateFrom sai format' }, { status: 400 });
    }
    if (dateTo && !DATE_RE.test(dateTo)) {
      return NextResponse.json({ error: 'dateTo sai format' }, { status: 400 });
    }
    if (dateFrom && dateTo) {
      if (dateFrom > dateTo) {
        return NextResponse.json({ error: 'dateFrom phải <= dateTo' }, { status: 400 });
      }
      const a = new Date(`${dateFrom}T12:00:00Z`).getTime();
      const b = new Date(`${dateTo}T12:00:00Z`).getTime();
      const days = Math.floor((b - a) / 86_400_000) + 1;
      if (days > 31) {
        return NextResponse.json({ error: 'Khoảng ngày tối đa là 31 ngày.' }, { status: 400 });
      }
    }
    if (statusParam && !VALID_STATUSES.has(statusParam)) {
      return NextResponse.json({ error: 'status không hợp lệ' }, { status: 400 });
    }

    let effectiveBranch: string | null = null;
    if (scope.allBranches) {
      effectiveBranch = branchIdParam || null;
    } else {
      effectiveBranch = scope.branchId;
      if (branchIdParam && branchIdParam !== scope.branchId) {
        return NextResponse.json({ error: 'Chỉ xem báo cáo cơ sở mình' }, { status: 403 });
      }
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS);
    if (effectiveBranch) q = q.where('branchId', '==', effectiveBranch);
    // Precedence: dateFrom/dateTo > date > month.
    if (dateFrom && dateTo) {
      q = q.where('date', '>=', dateFrom).where('date', '<=', dateTo);
    } else if (date) {
      q = q.where('date', '==', date);
    } else if (month) {
      q = q.where('month', '==', month);
    }
    if (statusParam) q = q.where('status', '==', statusParam);
    q = q.orderBy('date', 'desc').limit(200);

    const snap = await q.get();
    const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, count: reports.length, reports });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
