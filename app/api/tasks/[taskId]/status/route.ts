// POST /api/tasks/[id]/status  body: { status, progressPct?, comment? }
// Assignee + creator + admin được update tiến độ / chuyển trạng thái (pending → in_progress → done).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canUpdateTaskStatus, canReopenTask, type TaskStatus } from '@/lib/firebase/tasks-scope';
// Phase B.3: centralized scope helper.
import { taskScopeFromDoc as asScope } from '@/lib/firebase/tasks-serialize';

const COL = COLLECTIONS.TASKS;
// Quy trình:
//   pending → in_progress (recipient bắt đầu, kèm expectedCompletionDate nếu kind='proposal')
//   in_progress → done (hoàn thành) hoặc → cancelled
//   in_progress → requested_revision (recipient yêu cầu creator bổ sung — qua route riêng /request-revision)
//   requested_revision → pending (creator bổ sung xong, gửi lại — đến tay recipient)
//   done → in_progress: reopen (chỉ GD Khối / CEO / ADMIN)
//   cancelled → pending: restore
const VALID_NEXT: Record<TaskStatus, TaskStatus[]> = {
  pending_approval: [],
  pending: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  requested_revision: ['pending', 'cancelled'],
  done: ['in_progress'],
  rejected: [],
  cancelled: ['pending'],
};

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
    // Resubmit sau bổ sung (requested_revision → pending): CHỈ creator được làm
    // (recipient không được tự đánh dấu creator đã bổ sung xong).
    //
    // Phase B.7 phase 2 audit (2026-06-07): resubmit KHÔNG re-evaluate approval.
    // State machine: requested_revision chỉ đến từ in_progress (line 17 spec),
    // tức task đã được duyệt ít nhất 1 lần. Bổ sung chỉ là tinh chỉnh content,
    // không cần GĐ duyệt lại. Nếu future cần re-approval (vd cross-block, đổi
    // cost) → handle riêng ở /request-revision route hoặc tạo task mới.
    const isResubmit = cur === 'requested_revision' && newStatus === 'pending';
    const allowed = isReopen
      ? canReopenTask(caller.profile, scope)
      : isResubmit
        ? (data.createdBy === caller.profile.uid || caller.profile.role_code === 'ADMIN')
        : canUpdateTaskStatus(caller.profile, scope);
    if (!allowed) {
      const msg = isReopen
        ? 'Chỉ GĐ Khối / CEO / ADMIN được mở lại nhiệm vụ đã đóng.'
        : isResubmit
          ? 'Chỉ người tạo đề xuất được gửi lại sau khi bổ sung.'
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

    // Stability 2026-06-10: nếu resubmit từ requested_revision của PROPOSAL +
    // có pausedAtApprover (yêu cầu bổ sung từ approver trong chain) → quay
    // lại đúng cấp đó để tiếp tục duyệt. KHÔNG để creator bypass approval.
    if (isResubmit && data.kind === 'proposal' && data.pausedAtApprover) {
      patch.status = 'pending_approval';
      patch.currentApprover = data.pausedAtApprover;
      patch.pausedAtApprover = null;
    }

    // Phase 12 — Đề xuất v2: recipient bắt đầu → bắt buộc nhập dự kiến hoàn thành
    if (newStatus === 'in_progress' && data.kind === 'proposal') {
      const exp = typeof body?.expectedCompletionDate === 'string' ? body.expectedCompletionDate.trim() : '';
      if (!exp) {
        return NextResponse.json({
          error: 'Đề xuất khi chuyển "Đang thực hiện" bắt buộc nhập "Dự kiến hoàn thành".',
        }, { status: 400 });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
        return NextResponse.json({ error: 'expectedCompletionDate phải định dạng YYYY-MM-DD' }, { status: 400 });
      }
      patch.expectedCompletionDate = exp;
    }

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

    // Stability 2026-06-10: khi creator RESUBMIT proposal sau bổ sung → push noti
    // tới approver đang chờ (pausedAtApprover trước khi clear) — "Đã bổ sung, mời duyệt".
    if (isResubmit && data.kind === 'proposal' && data.pausedAtApprover && patch.currentApprover) {
      try {
        const pushModule = await import('@/lib/firebase/push-notifications');
        await pushModule.pushToApproverEntries([patch.currentApprover as string], {
          title: `📝 Đề xuất đã được bổ sung — chờ duyệt`,
          body: `${caller.actorName ?? data.createdByName ?? 'Người tạo'} vừa bổ sung "${data.title}". Mời bạn duyệt lại.`,
          link: `/giao-viec?taskId=${taskId}`,
          tag: `task-${taskId}`,
          data: { taskId, kind: 'task_resubmitted_after_revision' },
        });
      } catch (e: any) {
        console.warn('[status route] push resubmit fail:', e?.message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task status]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
