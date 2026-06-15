// POST /api/tasks/[taskId]/result-approve
// V6.5 Phase 1 (2026-06-15): Người duyệt kết quả OK (resultApprover).
// Pre: status === 'cho_duyet_ket_qua' + caller.uid === resultApproverUid (hoặc OWNER_OVERRIDE)
// Action: status → 'hoan_thanh' + resultApprovedAt/By

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
    const body = await req.json().catch(() => ({}));
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : '';

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
      return NextResponse.json({ error: 'Chỉ Người duyệt kết quả / ADMIN / CEO / CHU_TICH được duyệt' }, { status: 403 });
    }

    if (data.status !== 'cho_duyet_ket_qua') {
      return NextResponse.json({
        error: `Task '${data.status}', chỉ duyệt được khi 'cho_duyet_ket_qua'`,
      }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    await ref.update({
      status: 'hoan_thanh',
      resultApprovedAt: nowIso,
      resultApprovedBy: caller.profile.uid,
      resultApproveNote: note || null,
      completedAt: nowIso,
      waitingForPerson: null,
      waitingForContent: null,
      waitingSince: nowIso,
      updatedAt: new Date(),
      updatedBy: caller.profile.uid,
    });

    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      kind: 'transition',
      text: 'Người duyệt kết quả: ĐỒNG Ý — Đã hoàn thành',
      note: note || null,
      createdAt: nowIso,
    });

    await writeAuditLog({
      action: 'task_result_approve',
      module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: caller.profile.facility_id ?? null,
      before: { status: data.status },
      after: { status: 'hoan_thanh' },
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
        decision: 'approved',
        approverName: caller.actorName,
        ownerUid: data.ownerUid,
        createdBy: data.createdBy,
      });
    } catch (e: any) { console.warn('[result-approve] notify fail:', e?.message); }

    return NextResponse.json({ ok: true, status: 'hoan_thanh' });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[result-approve]', e?.message, e?.stack);
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 });
  }
}
