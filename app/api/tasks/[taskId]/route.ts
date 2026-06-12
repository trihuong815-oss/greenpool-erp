// GET    /api/tasks/[id]   → detail
// PATCH  /api/tasks/[id]   → update metadata (title/desc/priority/dueDate)
// DELETE /api/tasks/[id]   → delete (creator + admin)

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canDeleteTask, canReadTask, canUpdateTaskMeta } from '@/lib/firebase/tasks-scope';
import { getEvidenceBucket } from '@/lib/firebase/storage';
// Phase B.3: centralized helpers. Trước đây asScope local MISS currentApprover field
// → potential permission bug. Helper centralized có đủ field.
import { serializeTask as serialize, taskScopeFromDoc as asScope } from '@/lib/firebase/tasks-serialize';

const COL = COLLECTIONS.TASKS;
const VALID_PRIORITY = new Set(['low', 'normal', 'high', 'urgent']);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COL).doc(taskId).get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy nhiệm vụ' }, { status: 404 });
    const data = snap.data()!;
    if (!canReadTask(caller.profile, asScope(data))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ task: serialize(snap.id, data) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy nhiệm vụ' }, { status: 404 });
    const data = snap.data()!;
    if (!canUpdateTaskMeta(caller.profile, asScope(data))) {
      return NextResponse.json({ error: 'Chỉ người tạo hoặc admin được sửa' }, { status: 403 });
    }
    // Chỉ allow sửa metadata khi status còn pending* hoặc in_progress (không sửa khi done/cancelled/rejected)
    if (['done', 'cancelled', 'rejected'].includes(data.status)) {
      return NextResponse.json({ error: `Không sửa được khi trạng thái = ${data.status}` }, { status: 400 });
    }

    const body = await req.json();
    const patch: Record<string, any> = {};
    if (typeof body.title === 'string') {
      const t = body.title.trim();
      if (!t || t.length > 200) return NextResponse.json({ error: 'Tiêu đề ≤ 200 ký tự' }, { status: 400 });
      patch.title = t;
    }
    if (typeof body.description === 'string') {
      if (body.description.length > 5000) return NextResponse.json({ error: 'Mô tả ≤ 5000 ký tự' }, { status: 400 });
      patch.description = body.description.trim();
    }
    if (body.priority !== undefined) {
      if (!VALID_PRIORITY.has(body.priority)) return NextResponse.json({ error: 'priority không hợp lệ' }, { status: 400 });
      patch.priority = body.priority;
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) {
        return NextResponse.json({ error: 'dueDate phải YYYY-MM-DD hoặc null' }, { status: 400 });
      }
      patch.dueDate = body.dueDate;
    }
    // V4 Điều phối — thêm field metadata khi sửa
    if (typeof body.severity === 'string' && ['binh_thuong', 'khan_cap'].includes(body.severity)) {
      patch.severity = body.severity;
    }
    if (typeof body.coordType === 'string') patch.coordType = body.coordType;
    if (typeof body.ownerUid === 'string') patch.ownerUid = body.ownerUid;
    if (typeof body.ownerName === 'string') patch.ownerName = body.ownerName;
    if (typeof body.ownerBlock === 'string' && ['KD', 'VP'].includes(body.ownerBlock)) {
      patch.ownerBlock = body.ownerBlock;
      patch.assigneeBlock = body.ownerBlock; // sync legacy field
    }
    if (typeof body.ownerDeptId === 'string') patch.assigneeDeptId = body.ownerDeptId;
    if (Array.isArray(body.assigneeUserIds)) patch.assigneeUserIds = body.assigneeUserIds.filter((x: any) => typeof x === 'string');
    if (Array.isArray(body.collaboratorDeptIds)) patch.collaboratorDeptIds = body.collaboratorDeptIds.filter((x: any) => typeof x === 'string');
    if (Array.isArray(body.collaboratorFacilityIds)) patch.collaboratorFacilityIds = body.collaboratorFacilityIds.filter((x: any) => typeof x === 'string');
    if (body.collaboratorRoles && typeof body.collaboratorRoles === 'object') {
      patch.collaboratorRoles = body.collaboratorRoles;
    }
    if (typeof body.goal === 'string') patch.goal = body.goal.trim().slice(0, 500);
    if (typeof body.expectedDeliverable === 'string') patch.expectedDeliverable = body.expectedDeliverable.trim().slice(0, 500);
    if (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) {
      // Merge meta thay vì overwrite (giữ field cũ như linkedCoordId, fromProposalId…)
      patch.meta = { ...(data.meta ?? {}), ...body.meta };
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Không có field nào để cập nhật' }, { status: 400 });
    }
    const now = new Date();
    patch.updatedAt = now;
    patch.updatedBy = caller.profile.uid;
    await ref.update(patch);

    await writeAuditLog({
      action: 'update_task_meta', module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: data.assigneeFacilityId ?? null,
      before: { title: data.title, priority: data.priority, dueDate: data.dueDate },
      after: patch,
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task PATCH]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy nhiệm vụ' }, { status: 404 });
    const data = snap.data()!;
    if (!canDeleteTask(caller.profile, asScope(data))) {
      return NextResponse.json({ error: 'Chỉ creator hoặc CEO được xoá' }, { status: 403 });
    }
    // Cleanup storage attachments trước (fail-safe: log lỗi nhưng vẫn xoá doc).
    const attachments: Array<{ path: string }> = Array.isArray(data.attachments) ? data.attachments : [];
    if (attachments.length > 0) {
      const bucket = getEvidenceBucket();
      await Promise.all(attachments.map(async (a) => {
        try { await bucket.file(a.path).delete({ ignoreNotFound: true }); }
        catch (err) { console.warn('[task DELETE] cleanup attachment failed', a.path, err); }
      }));
    }
    // Xoá subcollection comments + doc chính trong cùng batch
    const commentsSnap = await ref.collection('comments').get();
    const batch = db.batch();
    commentsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();

    await writeAuditLog({
      action: 'delete_task', module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: data.assigneeFacilityId ?? null,
      before: { id: taskId, title: data.title },
      after: null,
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
