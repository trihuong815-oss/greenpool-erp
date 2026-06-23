// PR-CASH1B (2026-06-23) — GET detail dailyCashflowReports/[id].

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canReadDailyCashflowReport } from '@/lib/finance/cashflow-report-permissions';
import type { DailyCashflowReportDoc } from '@/lib/finance/cashflow-report-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    const callerBranchId = caller.profile.facility_id ?? null;

    const db = getFirebaseAdminDb();
    const doc = await db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS).doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });

    const data = doc.data() as DailyCashflowReportDoc;
    if (!canReadDailyCashflowReport(role, callerBranchId, data)) {
      return NextResponse.json({ error: 'Không có quyền xem báo cáo này' }, { status: 403 });
    }

    return NextResponse.json({ ok: true, report: { ...data, id } });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
