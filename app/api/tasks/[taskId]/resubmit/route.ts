// POST /api/tasks/[taskId]/resubmit
// V6.4 (2026-06-12): creator gửi LẠI đề xuất đã bị từ chối — RESET chuỗi duyệt.
//   - Chỉ kind='proposal' status='rejected' mới resubmit được.
//   - Chỉ creator (createdBy === uid) được thực hiện.
//   - Reset: approvalsCompleted=[], currentApprover=chain[0], status='pending_approval',
//     approvedBy=null, approvedAt=null, rejectionReason=null, pausedAtApprover=null.
//   - Body optional: { note?: string } — ghi vào timeline ("Gửi lại sau khi điều chỉnh").
// Khác /status (resubmit từ requested_revision): kia chỉ tiếp tục TẠI pausedAtApprover, giữ approvalsCompleted.
// Endpoint này dành cho rejected — START LẠI từ đầu chain.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';

const COL = COLLECTIONS.TASKS;

export async function POST(req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const note: string = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : '';

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy đề xuất' }, { status: 404 });
    const data = snap.data()!;

    if (data.kind !== 'proposal') {
      return NextResponse.json({ error: 'Chỉ đề xuất mới được gửi lại.' }, { status: 400 });
    }
    if (data.status !== 'rejected') {
      return NextResponse.json({
        error: 'Chỉ đề xuất đã bị từ chối mới có thể gửi lại. Nếu chỉ bổ sung, dùng "Gửi lại bổ sung".',
      }, { status: 409 });
    }
    if (data.createdBy !== caller.profile.uid) {
      return NextResponse.json({ error: 'Chỉ người tạo được gửi lại đề xuất bị từ chối.' }, { status: 403 });
    }

    const chain: string[] = Array.isArray(data.approvalChain) ? data.approvalChain : [];
    if (chain.length === 0) {
      return NextResponse.json({
        error: 'Đề xuất không có chuỗi duyệt — không thể gửi lại tự động. Tạo đề xuất mới.',
      }, { status: 409 });
    }

    const now = new Date();
    const update: Record<string, unknown> = {
      status: 'pending_approval',
      approvalsCompleted: [],
      currentApprover: chain[0],
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      pausedAtApprover: null,
      updatedAt: now,
      updatedBy: caller.profile.uid,
    };
    await ref.update(update);

    const nextApproverDisplay = await (await import('@/lib/firebase/approver-name'))
      .resolveApproverName(chain[0]);
    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      body: (note ? `Gửi lại sau điều chỉnh: ${note}` : 'Gửi lại sau điều chỉnh')
        + ` — chờ ${nextApproverDisplay} duyệt`,
      kind: 'resubmit',
      createdAt: now,
    });

    await writeAuditLog({
      action: 'resubmit_task',
      module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: data.assigneeFacilityId ?? null,
      before: { status: 'rejected', approvalsCompleted: (data.approvalsCompleted ?? []).length },
      after: { status: 'pending_approval', currentApprover: chain[0], chainLen: chain.length },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    // Notify approver đầu chain — dùng helper riêng cho RESUBMIT (body chuẩn xác,
    // KHÔNG nói "đã duyệt" như notifyTaskApproved).
    try {
      await (await import('@/lib/firebase/task-notifications')).notifyTaskResubmitted(
        {
          id: taskId, kind: data.kind, title: data.title,
          createdBy: data.createdBy, createdByName: data.createdByName,
          assigneeUserIds: data.assigneeUserIds ?? [],
          assigneeDeptId: data.assigneeDeptId ?? null,
          assigneeFacilityId: data.assigneeFacilityId ?? null,
          status: 'pending_approval',
          currentApprover: chain[0],
        },
        { uid: caller.profile.uid, name: caller.actorName ?? '' },
        note,
      );
    } catch (e: any) {
      console.warn('[task resubmit] notify fail:', e?.message);
    }

    return NextResponse.json({ ok: true, currentApprover: chain[0] });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task resubmit]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
