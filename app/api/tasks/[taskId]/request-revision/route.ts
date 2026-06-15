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
import { canUpdateTaskStatus } from '@/lib/firebase/tasks-scope';
// Phase B.3: centralized scope helper.
import { taskScopeFromDoc as asScope } from '@/lib/firebase/tasks-serialize';

const COL = COLLECTIONS.TASKS;

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
    // Stability 2026-06-10: cho phép yêu cầu bổ sung khi đề xuất đang trong
    // chain duyệt (pending_approval) HOẶC đã đến tay recipient (pending/in_progress).
    if (data.status !== 'pending' && data.status !== 'in_progress' && data.status !== 'pending_approval') {
      return NextResponse.json({
        error: 'Đề xuất ở trạng thái này không thể yêu cầu bổ sung.',
      }, { status: 409 });
    }
    if (data.createdBy === caller.profile.uid) {
      return NextResponse.json({ error: 'Người tạo không thể tự yêu cầu bổ sung.' }, { status: 403 });
    }
    // V6.5 Audit fix (2026-06-15) — Issue 1.2: STRICT permission.
    // Trước đây `canApproveTask` chỉ check role match pattern → 3 người trong chain
    // đều có thể gọi request-revision. Giờ check CHỈ currentApprover khớp caller.
    const isInChain = data.status === 'pending_approval';
    if (isInChain) {
      // Match strict: data.currentApprover = 'user:UID' hoặc 'role:RC'
      const current = typeof data.currentApprover === 'string' ? data.currentApprover : '';
      const matchUid = current === `user:${caller.profile.uid}`;
      const matchRole = current === `role:${caller.profile.role_code}`;
      // Fallback OVERRIDE: ADMIN/CEO/CHU_TICH escalate hộ
      const isOverride = ['ADMIN', 'CEO', 'CHU_TICH'].includes(caller.profile.role_code);
      if (!matchUid && !matchRole && !isOverride) {
        return NextResponse.json({
          error: 'Chỉ người duyệt hiện tại (currentApprover) được yêu cầu bổ sung — chưa đến lượt bạn.',
        }, { status: 403 });
      }
    } else {
      if (!canUpdateTaskStatus(caller.profile, asScope(data))) {
        return NextResponse.json({ error: 'Bạn không có quyền yêu cầu bổ sung.' }, { status: 403 });
      }
    }

    const now = new Date();
    const revision = {
      uid: caller.profile.uid,
      name: caller.actorName ?? '',
      requestedAt: now.toISOString(),
      message,
    };
    const updateData: Record<string, unknown> = {
      status: 'requested_revision',
      revisionRequests: FieldValue.arrayUnion(revision),
      updatedAt: now,
      updatedBy: caller.profile.uid,
    };
    // Khi yêu cầu bổ sung trong chain → lưu vị trí pause để resume đúng cấp
    // sau khi creator bổ sung xong + gửi lại.
    if (isInChain && data.currentApprover) {
      updateData.pausedAtApprover = data.currentApprover;
    }
    await ref.update(updateData);
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

    // V6.4 P2: user vừa yêu cầu bổ sung → mark Action Required cho user → done.
    try {
      await (await import('@/lib/firebase/notifications-store')).markActionDoneForEntity(caller.profile.uid, taskId);
    } catch (e: any) {
      console.warn('[request-revision] markActionDone fail:', e?.message);
    }

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
      // V6.5 Audit fix Phase C.4 (2026-06-15) — Issue 4.2: truyền role để UI noti render
      // "GĐ KD yêu cầu bổ sung" thay vì generic "ai đó yêu cầu". Optional payload.
      { uid: caller.profile.uid, name: caller.actorName ?? '', role: caller.profile.role_code },
      message,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task request-revision]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
