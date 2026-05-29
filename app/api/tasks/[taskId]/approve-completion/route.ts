// Phase 11 — POST /api/tasks/[id]/approve-completion
// Manager duyệt báo cáo hoàn thành. Task chuyển waiting_approval → done.
// Hoặc reject completion: waiting_approval → in_progress (assignee phải làm lại + submit lại).
//
// Body: { decision: 'approve' | 'reject', approverNotes?: string }
//
// Quy tắc: creator + assignee KHÔNG được tự duyệt completion (canApproveCompletion check).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canApproveCompletion, type TaskForScope, type TaskStatus } from '@/lib/firebase/tasks-scope';

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
    const decision = String(body?.decision ?? '');
    if (decision !== 'approve' && decision !== 'reject') {
      return NextResponse.json({ error: 'decision phải là approve hoặc reject.' }, { status: 400 });
    }
    const notes = typeof body?.approverNotes === 'string' ? body.approverNotes.trim().slice(0, 1000) : '';

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy nhiệm vụ' }, { status: 404 });
    const data = snap.data()!;
    const cur = data.status as TaskStatus;
    if (cur !== 'waiting_approval') {
      return NextResponse.json({ error: 'Nhiệm vụ không ở trạng thái chờ duyệt hoàn thành.' }, { status: 409 });
    }
    if (!canApproveCompletion(caller.profile, asScope(data))) {
      return NextResponse.json({
        error: 'Bạn không có quyền duyệt hoàn thành (người tạo + người làm không được tự duyệt).',
      }, { status: 403 });
    }

    const now = new Date();
    const patch: Record<string, unknown> = {
      updatedAt: now,
      updatedBy: caller.profile.uid,
      completionApproverId: caller.profile.uid,
      completionApproverName: caller.actorName ?? '',
      completionApproverNotes: notes,
      completionDecidedAt: now,
    };
    if (decision === 'approve') {
      patch.status = 'done';
      patch.completedAt = now;
    } else {
      // Reject completion: trả về in_progress để assignee làm lại
      patch.status = 'in_progress';
      patch.submittedAt = null;       // reset cờ submitted
    }
    await ref.update(patch);

    // Nếu task có proposalId — đồng bộ trạng thái thực hiện về proposal (denorm để báo cáo)
    if (data.proposalId && decision === 'approve') {
      try {
        await db.collection(COLLECTIONS.PROPOSALS).doc(data.proposalId).update({
          generatedTaskStatus: 'done',
          generatedTaskDoneAt: now,
          updatedAt: now,
        });
      } catch (linkErr) {
        // Không chặn task done nếu update proposal lỗi — log để admin biết
        console.warn('[approve-completion] link proposal update failed:', linkErr);
      }
    }

    await writeAuditLog({
      action: decision === 'approve' ? 'approve_task_completion' : 'reject_task_completion',
      module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: data.assigneeFacilityId ?? data.branchId ?? null,
      before: { status: cur },
      after: { status: patch.status, notes },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task approve-completion]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
