// POST /api/tasks/[id]/status  body: { status, progressPct?, comment? }
// Assignee + creator + admin được update tiến độ / chuyển trạng thái (pending → in_progress → done).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canUpdateTaskStatus, canReopenTask, type TaskForScope, type TaskStatus } from '@/lib/firebase/tasks-scope';

const COL = COLLECTIONS.TASKS;
// Quy trình chuẩn: pending → in_progress → done. Strict step (không skip).
// pending → cancelled, in_progress → cancelled: cho phép hủy giữa chừng.
// done → in_progress: reopen — yêu cầu quyền GD Khối / CEO / ADMIN (canReopenTask).
// cancelled → pending: restore (cùng quyền reopen).
const VALID_NEXT: Record<TaskStatus, TaskStatus[]> = {
  pending_approval: [],
  pending: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: ['in_progress'],
  rejected: [],
  cancelled: ['pending'],
};

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
    const newStatus = body?.status as TaskStatus;
    const progressPctRaw = body?.progressPct;
    const comment: string = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';

    if (!['pending', 'in_progress', 'done', 'cancelled'].includes(newStatus)) {
      return NextResponse.json({ error: 'status không hợp lệ' }, { status: 400 });
    }
    let progressPct: number | null = null;
    if (progressPctRaw !== undefined && progressPctRaw !== null) {
      const p = Number(progressPctRaw);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        return NextResponse.json({ error: 'progressPct phải số 0-100' }, { status: 400 });
      }
      progressPct = Math.round(p);
    }

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy nhiệm vụ' }, { status: 404 });
    const data = snap.data()!;
    const scope = asScope(data);
    const cur = data.status as TaskStatus;
    if (!VALID_NEXT[cur]?.includes(newStatus)) {
      return NextResponse.json({ error: `Không thể chuyển từ ${cur} → ${newStatus}` }, { status: 400 });
    }
    // Reopen (done → in_progress) hoặc restore (cancelled → pending) cần quyền cao hơn.
    const isReopen = (cur === 'done' && newStatus === 'in_progress') ||
                     (cur === 'cancelled' && newStatus === 'pending');
    const allowed = isReopen
      ? canReopenTask(caller.profile, scope)
      : canUpdateTaskStatus(caller.profile, scope);
    if (!allowed) {
      const msg = isReopen
        ? 'Chỉ GĐ Khối / CEO / ADMIN được mở lại nhiệm vụ đã đóng.'
        : 'Bạn không có quyền cập nhật trạng thái.';
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    const now = new Date();
    const patch: Record<string, any> = {
      status: newStatus,
      updatedAt: now,
      updatedBy: caller.profile.uid,
    };
    // Auto progress khi done → 100, pending → giữ nguyên
    if (newStatus === 'done') patch.progressPct = 100;
    else if (progressPct !== null) patch.progressPct = progressPct;

    await ref.update(patch);
    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      body: comment || `Chuyển trạng thái: ${cur} → ${newStatus}`,
      kind: 'status_change',
      metadata: { from: cur, to: newStatus, progressPct: patch.progressPct ?? data.progressPct ?? 0 },
      createdAt: now,
    });

    await writeAuditLog({
      action: 'update_task_status', module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: data.assigneeFacilityId ?? null,
      before: { status: cur, progressPct: data.progressPct },
      after: { status: newStatus, progressPct: patch.progressPct ?? data.progressPct },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });

    await (await import('@/lib/firebase/task-notifications')).notifyTaskStatusChanged({
      id: taskId, kind: data.kind, title: data.title,
      createdBy: data.createdBy, createdByName: data.createdByName,
      assigneeUserIds: data.assigneeUserIds ?? [],
      assigneeDeptId: data.assigneeDeptId ?? null,
      assigneeFacilityId: data.assigneeFacilityId ?? null,
      status: newStatus,
    }, { uid: caller.profile.uid, name: caller.actorName }, newStatus);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task status]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
