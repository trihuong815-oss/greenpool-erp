// POST /api/tasks/[id]/reject  body: { reason }
// GĐ Khối nhận hoặc CEO từ chối task pending_approval → status = 'rejected'.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canApproveTask, type TaskForScope } from '@/lib/firebase/tasks-scope';

const COL = COLLECTIONS.TASKS;

function asScope(d: Record<string, any>): TaskForScope {
  return {
    createdBy: d.createdBy,
    createdByBlock: d.createdByBlock,
    assigneeBlock: d.assigneeBlock,
    assigneeDeptId: d.assigneeDeptId ?? null,
    assigneeFacilityId: d.assigneeFacilityId ?? null,
    assigneeUserIds: Array.isArray(d.assigneeUserIds) ? d.assigneeUserIds : [],
    status: d.status,
    approvalRequiredFrom: d.approvalRequiredFrom ?? null,
  };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const reason: string = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
    if (!reason) return NextResponse.json({ error: 'Lý do từ chối bắt buộc' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy nhiệm vụ' }, { status: 404 });
    const data = snap.data()!;
    if (!canApproveTask(caller.profile, asScope(data))) {
      return NextResponse.json({ error: 'Bạn không có quyền duyệt nhiệm vụ này' }, { status: 403 });
    }

    const now = new Date();
    await ref.update({
      status: 'rejected',
      rejectionReason: reason,
      approvedBy: caller.profile.uid,
      approvedAt: now,
      updatedAt: now,
      updatedBy: caller.profile.uid,
    });
    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      body: `Từ chối: ${reason}`,
      kind: 'rejection',
      metadata: { reason },
      createdAt: now,
    });

    await writeAuditLog({
      action: 'reject_task', module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: data.assigneeFacilityId ?? null,
      before: { status: data.status },
      after: { status: 'rejected', reason },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });

    await (await import('@/lib/firebase/task-notifications')).notifyTaskRejected({
      id: taskId, kind: data.kind, title: data.title,
      createdBy: data.createdBy, createdByName: data.createdByName,
      assigneeUserIds: data.assigneeUserIds ?? [],
      assigneeDeptId: data.assigneeDeptId ?? null,
      assigneeFacilityId: data.assigneeFacilityId ?? null,
      status: 'rejected',
    }, caller.actorName, reason);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task reject]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
