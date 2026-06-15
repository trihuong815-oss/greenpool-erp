// POST /api/tasks/[taskId]/result-reject
// V6.5 Phase 1 (2026-06-15): Người duyệt kết quả trả lại.
// Pre: status === 'cho_duyet_ket_qua' + caller.uid === resultApproverUid (hoặc OVERRIDE)
// Action: status → 'cho_owner_xac_nhan' (Owner phải xử lý lại) + rejection reason

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';

const OVERRIDE = new Set(['ADMIN', 'CEO', 'CHU_TICH']);

export async function POST(req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const body = await req.json().catch(() => null);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason) return NextResponse.json({ error: 'reason bắt buộc' }, { status: 400 });
    const reasonTrim = reason.slice(0, 1000);

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.TASKS).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy task' }, { status: 404 });
    const data = snap.data() as Record<string, any>;

    const p = caller.profile;
    const isAuthorized =
      OVERRIDE.has(p.role_code) ||
      (data.resultApproverUid && data.resultApproverUid === p.uid);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Chỉ Người duyệt kết quả / ADMIN / CEO / CHU_TICH được trả lại' }, { status: 403 });
    }

    if (data.status !== 'cho_duyet_ket_qua') {
      return NextResponse.json({
        error: `Task '${data.status}', chỉ trả lại được khi 'cho_duyet_ket_qua'`,
      }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    await ref.update({
      status: 'cho_owner_xac_nhan', // owner phải xử lý lại
      resultRejectedAt: nowIso,
      resultRejectedBy: caller.profile.uid,
      resultRejectReason: reasonTrim,
      waitingForPerson: data.ownerName || 'Owner',
      waitingForContent: 'Owner xử lý lại sau khi bị trả',
      waitingSince: nowIso,
      updatedAt: new Date(),
      updatedBy: caller.profile.uid,
    });

    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      kind: 'transition',
      text: 'Người duyệt kết quả: TRẢ LẠI — Owner cần xử lý lại',
      note: reasonTrim,
      createdAt: nowIso,
    });

    await writeAuditLog({
      action: 'task_result_reject',
      module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: caller.profile.facility_id ?? null,
      before: { status: data.status },
      after: { status: 'cho_owner_xac_nhan', reason: reasonTrim },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
      instanceId: taskId,
    }).catch(() => {});

    try {
      const { notifyTaskResultDecided } = await import('@/lib/firebase/task-notifications');
      await notifyTaskResultDecided({
        id: taskId,
        kind: data.kind,
        title: data.title,
        decision: 'rejected',
        approverName: caller.actorName,
        ownerUid: data.ownerUid,
        createdBy: data.createdBy,
        reason: reasonTrim,
      });
    } catch (e: any) { console.warn('[result-reject] notify fail:', e?.message); }

    return NextResponse.json({ ok: true, status: 'cho_owner_xac_nhan' });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[result-reject]', e?.message, e?.stack);
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 });
  }
}
