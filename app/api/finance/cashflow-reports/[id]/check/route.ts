// PR-CASH1B (2026-06-23) — POST mark report as checked (TP_KE).
//
// POST /api/finance/cashflow-reports/[id]/check  body: { note? }
// Transition: submitted|sent → checked
// KHÔNG phải duyệt chi — chỉ kiểm tra báo cáo thu-chi (chốt wording).

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { canCheckDailyCashflowReport } from '@/lib/finance/cashflow-report-permissions';
import type { DailyCashflowReportDoc } from '@/lib/finance/cashflow-report-types';
// PR-CASH1E (2026-06-23): noti người nộp + NV_KE branch sau khi check.
import { notifyDailyCashflowChecked } from '@/lib/firebase/finance-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });

    const data = doc.data() as DailyCashflowReportDoc;
    if (!canCheckDailyCashflowReport(role, data)) {
      return NextResponse.json({
        error: 'Chỉ TP_KE/ADMIN được đánh dấu Đã kiểm tra, và chỉ với báo cáo submitted/sent',
      }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { note?: string };
    const note = body.note ? String(body.note).trim().slice(0, 500) : null;

    const now = Timestamp.now();
    await ref.update({
      status: 'checked',
      checkedBy: caller.profile.uid,
      checkedByName: caller.actorName,
      checkedAt: now,
      checkNote: note,
      updatedAt: now,
    });

    void writeAuditLog({
      action: 'check_daily_cashflow_report', module: 'finance', userId: caller.profile.uid,
      branchId: data.branchId,
      before: { status: data.status },
      after: { status: 'checked', note },
      actorName: caller.actorName, actorRole: role, source: 'api',
    }).catch(() => {});

    // PR-CASH1E: noti người nộp + NV_KE branch — informational (không action_required).
    void notifyDailyCashflowChecked({
      reportId: id,
      reportVersion: data.reportVersion,
      date: data.date,
      branchId: data.branchId,
      branchName: data.branchName,
      submittedByUid: data.submittedBy ?? null,
      checkedByName: caller.actorName,
      checkNote: note,
    }).catch((e) => console.warn('[finance/check] daily_cashflow_checked notification failed:', e?.message));

    return NextResponse.json({ ok: true, status: 'checked' });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/cashflow-reports/[id]/check] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
