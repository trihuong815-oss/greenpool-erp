// PR-CASH1F-UNLOCK (2026-06-23) — POST mở khóa báo cáo thu-chi.
//
// POST /api/finance/cashflow-reports/[id]/unlock  body: { reason }
// Transition: locked → checked. Sau unlock: mutations expense ngày đó được mở lại,
// TP_KE có thể re-lock nếu cần.
//
// Permission: TP_KE | ADMIN (KHỚP canUnlockDailyCashflowReport).
// Bắt buộc reason — không cho mở khóa âm thầm. Audit log đầy đủ.

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { canUnlockDailyCashflowReport } from '@/lib/finance/cashflow-report-permissions';
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
    if (!reason) {
      return NextResponse.json({ error: 'Bắt buộc nhập lý do mở khóa' }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy báo cáo' }, { status: 404 });

    const data = doc.data() as DailyCashflowReportDoc;

    if (data.status !== 'locked') {
      return NextResponse.json({
        error: `Chỉ mở khóa được báo cáo đang locked (hiện tại: ${data.status}).`,
      }, { status: 409 });
    }

    if (!canUnlockDailyCashflowReport(role, data)) {
      return NextResponse.json({
        error: 'Chỉ TP_KE/ADMIN được mở khóa báo cáo thu-chi.',
      }, { status: 403 });
    }

    const now = Timestamp.now();
    const trimmedReason = reason.slice(0, 500);
    await ref.update({
      status: 'checked',                          // revert về trạng thái đã kiểm tra
      unlockedBy: caller.profile.uid,
      unlockedByName: caller.actorName,
      unlockedAt: now,
      unlockReason: trimmedReason,
      // GIỮ lockedBy/lockedByName/lockedAt để trace history (audit log + 2 stamp pair)
      updatedAt: now,
    });

    void writeAuditLog({
      action: 'unlock_daily_cashflow_report', module: 'finance', userId: caller.profile.uid,
      branchId: data.branchId,
      before: {
        status: 'locked',
        lockedBy: data.lockedBy,
        lockedByName: data.lockedByName,
      },
      after: {
        status: 'checked',
        reportId: id,
        date: data.date,
        reportVersion: data.reportVersion,
        reason: trimmedReason,
      },
      actorName: caller.actorName, actorRole: role, source: 'api',
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      status: 'checked',
      unlockedAt: now.toDate().toISOString(),
      unlockedByName: caller.actorName,
      unlockReason: trimmedReason,
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/cashflow-reports/[id]/unlock] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
