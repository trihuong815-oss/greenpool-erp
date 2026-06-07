// POST /api/tasks/[id]/approve  body: { comment? }
// GĐ Khối nhận hoặc CEO approve task pending_approval → status = 'pending'.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canApproveTask } from '@/lib/firebase/tasks-scope';
// Phase B.3: centralized scope helper.
import { taskScopeFromDoc as asScope } from '@/lib/firebase/tasks-serialize';

const COL = COLLECTIONS.TASKS;

export async function POST(req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const comment: string = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy nhiệm vụ' }, { status: 404 });
    const data = snap.data()!;
    if (!canApproveTask(caller.profile, asScope(data))) {
      return NextResponse.json({ error: 'Bạn không có quyền duyệt nhiệm vụ này' }, { status: 403 });
    }

    const now = new Date();

    // Phase 12 multi-step approval cho kind='proposal':
    //   - Nếu approvalChain có nhiều cấp → ghi nhận approval của cấp hiện tại + chuyển currentApprover sang cấp tiếp theo
    //   - Khi hết chain → status='pending', đến tay recipient
    // Legacy (kind='assignment' hoặc proposal không có chain): chuyển thẳng pending như cũ.
    const chain: string[] = Array.isArray(data.approvalChain) ? data.approvalChain : [];
    const completed: Array<Record<string, unknown>> = Array.isArray(data.approvalsCompleted) ? data.approvalsCompleted : [];
    const currentIdx = completed.length;
    const isMultiStep = chain.length > 0;
    const nextApprover = isMultiStep && currentIdx + 1 < chain.length ? chain[currentIdx + 1] : null;

    const newApprovalStep = {
      role: caller.profile.role_code,
      uid: caller.profile.uid,
      name: caller.actorName ?? '',
      decidedAt: now.toISOString(),
      decision: 'approved' as const,
      notes: comment || '',
    };

    const update: Record<string, unknown> = {
      updatedAt: now,
      updatedBy: caller.profile.uid,
    };
    if (isMultiStep) {
      update.approvalsCompleted = [...completed, newApprovalStep];
      if (nextApprover) {
        // Còn cấp tiếp → giữ pending_approval, chuyển currentApprover
        update.status = 'pending_approval';
        update.currentApprover = nextApprover;
        // approvalRequiredFrom = role nếu nextApprover là role-key; null nếu user-key
        update.approvalRequiredFrom = nextApprover.startsWith('role:')
          ? nextApprover.slice(5)
          : (nextApprover.startsWith('user:') ? null : nextApprover);
      } else {
        // Hết chain → đến recipient
        update.status = 'pending';
        update.currentApprover = null;
        update.approvalRequiredFrom = null;
        update.approvedBy = caller.profile.uid;
        update.approvedAt = now;
      }
    } else {
      // Legacy single-step
      update.status = 'pending';
      update.approvedBy = caller.profile.uid;
      update.approvedAt = now;
    }

    await ref.update(update);
    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      body: comment || (nextApprover ? `Đã duyệt — chuyển ${nextApprover} duyệt tiếp` : 'Đã duyệt'),
      kind: 'approval',
      createdAt: now,
    });

    await writeAuditLog({
      action: 'approve_task', module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: data.assigneeFacilityId ?? null,
      before: { status: data.status, currentApprover: data.currentApprover ?? null },
      after: { status: update.status, currentApprover: update.currentApprover ?? null },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });

    // Phase 13.14: truyền currentApprover mới sau khi update (= next chain entry hoặc null nếu hết chain)
    try {
      await (await import('@/lib/firebase/task-notifications')).notifyTaskApproved({
        id: taskId, kind: data.kind, title: data.title,
        createdBy: data.createdBy, createdByName: data.createdByName,
        assigneeUserIds: data.assigneeUserIds ?? [],
        assigneeDeptId: data.assigneeDeptId ?? null,
        assigneeFacilityId: data.assigneeFacilityId ?? null,
        status: (update.status ?? 'pending') as string,
        currentApprover: (update.currentApprover ?? null) as string | null,
        approvalRequiredFrom: (update.approvalRequiredFrom ?? null) as string | null,
      }, caller.actorName);
    } catch (e: any) {
      console.warn('[task approve] notifyTaskApproved fail:', e?.message);
    }

    return NextResponse.json({ ok: true, nextApprover, status: update.status });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task approve]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
