// PR-CASH1F (2026-06-23) — POST khóa báo cáo thu-chi.
//
// POST /api/finance/cashflow-reports/[id]/lock
// Transition: checked → locked
// Sau khóa: chặn mọi mutation expense + submit/check/return cho (branchId, date).
//
// Permission: TP_KE | ADMIN. Status report bắt buộc 'checked'.

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { canLockDailyCashflowReport } from '@/lib/finance/cashflow-report-permissions';
import type { DailyCashflowReportDoc } from '@/lib/finance/cashflow-report-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });

    const data = doc.data() as DailyCashflowReportDoc;

    if (data.status === 'locked') {
      return NextResponse.json({ error: 'Báo cáo đã được khóa trước đó.' }, { status: 409 });
    }

    if (!canLockDailyCashflowReport(role, data)) {
      // Phân biệt 2 lý do:
      const isAuthorizedRole = role === 'TP_KE' || role === 'ADMIN';
      const msg = isAuthorizedRole
        ? 'Chỉ được khóa báo cáo đã kiểm tra (status=checked).'
        : 'Chỉ TP_KE/ADMIN được khóa báo cáo thu-chi.';
      return NextResponse.json({ error: msg }, { status: isAuthorizedRole ? 400 : 403 });
    }

    const now = Timestamp.now();
    await ref.update({
      status: 'locked',
      lockedBy: caller.profile.uid,
      lockedByName: caller.actorName,
      lockedAt: now,
      updatedAt: now,
    });

    void writeAuditLog({
      action: 'lock_daily_cashflow_report', module: 'finance', userId: caller.profile.uid,
      branchId: data.branchId,
      before: { status: data.status },
      after: { status: 'locked', reportId: id, date: data.date, reportVersion: data.reportVersion },
      actorName: caller.actorName, actorRole: role, source: 'api',
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      status: 'locked',
      lockedAt: now.toDate().toISOString(),
      lockedByName: caller.actorName,
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/cashflow-reports/[id]/lock] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
