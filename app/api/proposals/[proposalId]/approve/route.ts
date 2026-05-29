// Phase 11 — Approve proposal: submitted → approved + AUTO-GENERATE TASK liên kết.
//
// Body: {
//   assigneeUserIds: string[],       // bắt buộc ít nhất 1
//   assigneeBlock: 'KD' | 'VP',      // khối của task
//   assigneeDeptId?: string,         // nếu giao cho phòng
//   assigneeFacilityId?: string,     // nếu giao cho cơ sở
//   dueDate: string,                 // ISO date — bắt buộc
//   priority: 'low'|'normal'|'high'|'urgent',
//   approverNotes?: string,
// }
//
// Quy tắc:
//   - Creator KHÔNG được tự duyệt (chặn ở canDecideProposal).
//   - Approver = role được uỷ quyền (approverRole) hoặc CEO/ADMIN.
//   - Transaction: tx.get proposal → check status='submitted' → tx.update proposal + tx.set task.
//   - Cảnh báo (audit log) nếu assignee bao gồm creatorId — không chặn (anh chốt: "Creator = Assignee được phép").

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canDecideProposal } from '@/lib/firebase/proposals-scope';
import { PROPOSAL_LIMITS, asProposalScope } from '@/lib/firebase/proposals-helpers';

const VALID_TASK_BLOCK = new Set(['KD', 'VP']);
const VALID_PRIORITY = new Set(['low', 'normal', 'high', 'urgent']);

export async function POST(req: NextRequest, ctx: { params: Promise<{ proposalId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { proposalId } = await ctx.params;
    const body = await req.json();

    // Validate input
    const assigneeUserIds = Array.isArray(body?.assigneeUserIds)
      ? body.assigneeUserIds.filter((x: unknown) => typeof x === 'string' && x.length > 0)
      : [];
    if (assigneeUserIds.length === 0) {
      return NextResponse.json({ error: 'Phải chọn ít nhất 1 người thực hiện.' }, { status: 400 });
    }
    const assigneeBlock = String(body?.assigneeBlock ?? '');
    if (!VALID_TASK_BLOCK.has(assigneeBlock)) {
      return NextResponse.json({ error: 'assigneeBlock phải là KD hoặc VP.' }, { status: 400 });
    }
    const assigneeDeptId = typeof body?.assigneeDeptId === 'string' && body.assigneeDeptId.trim() ? body.assigneeDeptId.trim() : null;
    const assigneeFacilityId = typeof body?.assigneeFacilityId === 'string' && body.assigneeFacilityId.trim() ? body.assigneeFacilityId.trim() : null;
    const priority = String(body?.priority ?? 'normal');
    if (!VALID_PRIORITY.has(priority)) {
      return NextResponse.json({ error: 'priority không hợp lệ.' }, { status: 400 });
    }
    const dueDateStr = typeof body?.dueDate === 'string' ? body.dueDate : '';
    if (!dueDateStr) {
      return NextResponse.json({ error: 'Phải chọn dueDate (hạn hoàn thành).' }, { status: 400 });
    }
    // Parse dueDate ép VN tz để tránh lệch giờ (xem pattern lead-activities)
    let dueDate: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)) dueDate = new Date(`${dueDateStr}T23:59:59+07:00`);
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(dueDateStr)) dueDate = new Date(`${dueDateStr}+07:00`);
    else dueDate = new Date(dueDateStr);
    if (Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: 'dueDate không hợp lệ.' }, { status: 400 });
    }

    const approverNotes = typeof body?.approverNotes === 'string' ? body.approverNotes.trim().slice(0, PROPOSAL_LIMITS.NOTES) : '';

    // Transaction: lock proposal + tạo task + link 2 chiều
    const db = getFirebaseAdminDb();
    const propRef = db.collection(COLLECTIONS.PROPOSALS).doc(proposalId);
    const taskRef = db.collection(COLLECTIONS.TASKS).doc(); // auto id
    const now = new Date();

    let creatorIsAssignee = false;
    const proposalSnapshot: {
      branchId: string | null;
      title: string;
      creatorId: string;
      creatorName: string;
      approverRole: string;
    } = { branchId: null, title: '', creatorId: '', creatorName: '', approverRole: '' };

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(propRef);
        if (!snap.exists) throw new Error('not-found');
        const data = snap.data()!;
        proposalSnapshot.branchId = data.branchId ?? null;
        proposalSnapshot.title = data.title ?? '';
        proposalSnapshot.creatorId = data.creatorId ?? '';
        proposalSnapshot.creatorName = data.creatorName ?? '';
        proposalSnapshot.approverRole = data.approverRole ?? '';

        // Permission check trong tx — chặn creator tự duyệt
        if (!canDecideProposal(caller.profile, asProposalScope(data))) {
          throw new Error('forbidden');
        }
        if (data.status !== 'submitted') throw new Error('wrong-status');

        creatorIsAssignee = assigneeUserIds.includes(data.creatorId);

        // 1) Update proposal: status=approved + link sang task
        tx.update(propRef, {
          status: 'approved',
          approverId: caller.profile.uid,
          approverName: caller.actorName ?? '',
          approverRoleResolved: caller.actorRole ?? '',
          approvedAt: now,
          decidedAt: now,
          approverNotes,
          generatedTaskId: taskRef.id,
          updatedAt: now,
        });

        // 2) Tạo task mới
        const taskDoc = {
          // Discriminator + flow mới
          kind: 'general' as const,             // kind='general' = task sinh từ proposal (không qua pending_approval)
          status: 'pending' as const,           // flow mới: pending → in_progress → waiting_approval → done
          // Link 2 chiều về proposal
          proposalId,
          proposalTitle: data.title,
          // Nội dung copy từ proposal
          title: `Thực hiện đề xuất: ${data.title}`,
          description: data.description,
          // Assignee do approver chỉ định
          assigneeUserIds,
          assigneeBlock,
          assigneeDeptId,
          assigneeFacilityId,
          priority,
          dueDate,
          // Audit
          createdBy: caller.profile.uid,
          createdByName: caller.actorName ?? '',
          createdByRole: caller.actorRole ?? '',
          createdByBlock: assigneeBlock,         // block của approver = block task
          branchId: data.branchId ?? null,
          departmentId: data.departmentId ?? null,
          progressPct: 0,
          startedAt: null,
          submittedAt: null,
          completedAt: null,
          completionReport: null,
          completionAttachments: [],
          completionApproverId: null,
          completionApproverName: null,
          attachments: data.attachments ?? [],
          approvalRequiredFrom: null,            // flow mới không dùng field này
          createdAt: now,
          updatedAt: now,
          updatedBy: caller.profile.uid,
        };
        tx.set(taskRef, taskDoc);
      });
    } catch (txErr: any) {
      const msg = String(txErr?.message ?? '');
      if (msg === 'not-found') return NextResponse.json({ error: 'Không tìm thấy đề xuất.' }, { status: 404 });
      if (msg === 'forbidden') {
        return NextResponse.json({
          error: 'Bạn không có quyền duyệt đề xuất này (creator không được tự duyệt).',
        }, { status: 403 });
      }
      if (msg === 'wrong-status') {
        return NextResponse.json({
          error: 'Đề xuất không ở trạng thái chờ duyệt (có thể đã được duyệt hoặc từ chối).',
        }, { status: 409 });
      }
      throw txErr;
    }

    // Audit log proposal approval
    await writeAuditLog({
      action: 'approve_proposal', module: 'proposals',
      userId: caller.profile.uid,
      branchId: proposalSnapshot.branchId,
      before: { status: 'submitted' },
      after: { status: 'approved', generatedTaskId: taskRef.id, approverNotes },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    // Audit log task generation (riêng để truy vết)
    await writeAuditLog({
      action: 'generate_task_from_proposal', module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: proposalSnapshot.branchId,
      before: null,
      after: {
        taskId: taskRef.id, proposalId,
        assigneeUserIds, dueDate: dueDate.toISOString(), priority,
        creatorIsAssignee,   // flag để báo cáo
      },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    // Push notification — creator + assignees mới của task
    await (await import('@/lib/firebase/proposals-notifications')).notifyProposalApproved(
      {
        id: proposalId,
        title: proposalSnapshot.title,
        approverRole: proposalSnapshot.approverRole,
        creatorId: proposalSnapshot.creatorId,
        creatorName: proposalSnapshot.creatorName,
      },
      caller.actorName ?? 'Người duyệt',
      taskRef.id,
      assigneeUserIds,
    );

    return NextResponse.json({
      ok: true,
      taskId: taskRef.id,
      warning: creatorIsAssignee
        ? 'Người đề xuất cũng là một trong những người được giao thực hiện. Quy trình vẫn yêu cầu manager khác duyệt completion.'
        : null,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[proposal approve]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
