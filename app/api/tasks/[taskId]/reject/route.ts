// POST /api/tasks/[id]/reject  body: { reason }
// GĐ Khối nhận hoặc CEO từ chối task pending_approval → status = 'rejected'.

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
      // V6.5 Audit fix Phase C.5 (2026-06-15) — Issue 4.3: reset currentApprover
      // tránh drawer hiển thị stale state "đang chờ ai đó duyệt" sau khi đã reject.
      currentApprover: null,
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

    // V6.4 P2: user vừa reject → mark mọi noti Action Required cho entity này của user → done.
    try {
      await (await import('@/lib/firebase/notifications-store')).markActionDoneForEntity(caller.profile.uid, taskId);
    } catch (e: any) {
      console.warn('[task reject] markActionDone fail:', e?.message);
    }

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
