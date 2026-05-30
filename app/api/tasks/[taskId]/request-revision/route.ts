// POST /api/tasks/[id]/request-revision
// Recipient (người nhận đề xuất) yêu cầu creator bổ sung trước khi thực hiện.
// Status: in_progress → requested_revision.
// Body: { message: string (1-1000 ký tự) }
// Quyền: chỉ assignee (user/dept/facility) — không cho creator tự gửi.

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canUpdateTaskStatus, type TaskForScope } from '@/lib/firebase/tasks-scope';

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
    const body = await req.json();
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1000) : '';
    if (!message) {
      return NextResponse.json({ error: 'Phải nhập nội dung yêu cầu bổ sung.' }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy nhiệm vụ' }, { status: 404 });
    const data = snap.data()!;

    // Chỉ áp dụng cho đề xuất (kind='proposal')
    if (data.kind !== 'proposal') {
      return NextResponse.json({ error: 'Chỉ áp dụng cho đề xuất.' }, { status: 400 });
    }
    // Chỉ ở trạng thái pending hoặc in_progress mới cho yêu cầu bổ sung
    if (data.status !== 'pending' && data.status !== 'in_progress') {
      return NextResponse.json({
        error: 'Chỉ yêu cầu bổ sung khi đề xuất đã đến tay người nhận (pending/in_progress).',
      }, { status: 409 });
    }
    // Quyền: chỉ assignee (recipient), không cho creator tự gửi
    if (data.createdBy === caller.profile.uid) {
      return NextResponse.json({ error: 'Người tạo không thể tự yêu cầu bổ sung — chỉ người nhận mới thực hiện.' }, { status: 403 });
    }
    if (!canUpdateTaskStatus(caller.profile, asScope(data))) {
      return NextResponse.json({ error: 'Bạn không có quyền yêu cầu bổ sung trên đề xuất này.' }, { status: 403 });
    }

    const now = new Date();
    const revision = {
      uid: caller.profile.uid,
      name: caller.actorName ?? '',
      requestedAt: now.toISOString(),
      message,
    };
    await ref.update({
      status: 'requested_revision',
      revisionRequests: FieldValue.arrayUnion(revision),
      updatedAt: now,
      updatedBy: caller.profile.uid,
    });
    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      body: `Yêu cầu bổ sung: ${message}`,
      kind: 'revision_request',
      createdAt: now,
    });

    await writeAuditLog({
      action: 'request_revision_task', module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: data.assigneeFacilityId ?? null,
      before: { status: data.status },
      after: { status: 'requested_revision', message },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });

    // Push noti cho creator — biết cần bổ sung gì
    await (await import('@/lib/firebase/task-notifications')).notifyTaskRevisionRequested(
      {
        id: taskId, kind: data.kind, title: data.title,
        createdBy: data.createdBy, createdByName: data.createdByName,
        assigneeUserIds: data.assigneeUserIds ?? [],
        assigneeDeptId: data.assigneeDeptId ?? null,
        assigneeFacilityId: data.assigneeFacilityId ?? null,
        status: 'requested_revision',
      },
      { uid: caller.profile.uid, name: caller.actorName ?? '' },
      message,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task request-revision]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
