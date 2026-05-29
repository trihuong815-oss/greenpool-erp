// Phase 11 — POST /api/tasks/[id]/submit-completion
// Assignee submit báo cáo hoàn thành. Task chuyển in_progress → waiting_approval.
// Sau đó manager khác phải approve qua /approve-completion để chuyển sang done.
//
// Body: { completionReport: string (1-5000 ký tự), completionAttachments?: Array<{name,url,size}> }

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canSubmitCompletion, type TaskForScope, type TaskStatus } from '@/lib/firebase/tasks-scope';

const COL = COLLECTIONS.TASKS;
const MAX_REPORT = 5000;

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

    const report = typeof body?.completionReport === 'string' ? body.completionReport.trim() : '';
    if (!report || report.length > MAX_REPORT) {
      return NextResponse.json({ error: `Báo cáo hoàn thành bắt buộc, 1-${MAX_REPORT} ký tự.` }, { status: 400 });
    }
    const attachments = Array.isArray(body?.completionAttachments) ? body.completionAttachments.slice(0, 20) : [];

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy nhiệm vụ' }, { status: 404 });
    const data = snap.data()!;
    const cur = data.status as TaskStatus;

    if (cur !== 'in_progress') {
      return NextResponse.json({
        error: 'Chỉ submit hoàn thành được khi nhiệm vụ đang "Đang làm".',
      }, { status: 409 });
    }
    if (!canSubmitCompletion(caller.profile, asScope(data))) {
      return NextResponse.json({ error: 'Chỉ người được giao mới gửi báo cáo hoàn thành.' }, { status: 403 });
    }

    const now = new Date();
    await ref.update({
      status: 'waiting_approval',
      submittedAt: now,
      completionReport: report,
      completionAttachments: attachments,
      progressPct: 100,
      updatedAt: now,
      updatedBy: caller.profile.uid,
    });
    await writeAuditLog({
      action: 'submit_task_completion', module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: data.assigneeFacilityId ?? data.branchId ?? null,
      before: { status: cur }, after: { status: 'waiting_approval', completionReport: report },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task submit-completion]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
