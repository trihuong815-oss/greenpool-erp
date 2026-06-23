// PR-CASH1B (2026-06-23) — POST return báo cáo để bổ sung (TP_KE).
//
// POST /api/finance/cashflow-reports/[id]/return  body: { reason }
// Transition: submitted|sent|checked → returned (require reason).

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { canReturnDailyCashflowReport } from '@/lib/finance/cashflow-report-permissions';
import type { DailyCashflowReportDoc } from '@/lib/finance/cashflow-report-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');

    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    const reason = String(body.reason ?? '').trim();
    if (!reason) return NextResponse.json({ error: 'Bắt buộc nhập lý do trả lại' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });

    const data = doc.data() as DailyCashflowReportDoc;
    if (!canReturnDailyCashflowReport(role, data)) {
      return NextResponse.json({
        error: 'Chỉ TP_KE/ADMIN được trả lại báo cáo, và chỉ với báo cáo submitted/sent/checked',
      }, { status: 403 });
    }

    const now = Timestamp.now();
    await ref.update({
      status: 'returned',
      returnedBy: caller.profile.uid,
      returnedByName: caller.actorName,
      returnedAt: now,
      returnReason: reason.slice(0, 500),
      updatedAt: now,
    });

    void writeAuditLog({
      action: 'return_daily_cashflow_report', module: 'finance', userId: caller.profile.uid,
      branchId: data.branchId,
      before: { status: data.status },
      after: { status: 'returned', reason: reason.slice(0, 500) },
      actorName: caller.actorName, actorRole: role, source: 'api',
    }).catch(() => {});

    return NextResponse.json({ ok: true, status: 'returned' });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/cashflow-reports/[id]/return] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
