// GET    /api/tasks/[id]   → detail
// PATCH  /api/tasks/[id]   → update metadata (title/desc/priority/dueDate)
// DELETE /api/tasks/[id]   → delete (creator + admin)

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canDeleteTask, canReadTask, canUpdateTaskMeta, type TaskForScope } from '@/lib/firebase/tasks-scope';
import { getEvidenceBucket } from '@/lib/firebase/storage';

const COL = COLLECTIONS.TASKS;
const VALID_PRIORITY = new Set(['low', 'normal', 'high', 'urgent']);

function serialize(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  // Đồng bộ với GET /api/tasks
  out.kind = out.kind ?? 'assignment';
  out.assigneeUserIds = Array.isArray(out.assigneeUserIds) ? out.assigneeUserIds : [];
  out.attachments = Array.isArray(out.attachments) ? out.attachments : [];
  out.progressPct = typeof out.progressPct === 'number' ? out.progressPct : 0;
  out.priority = out.priority ?? 'normal';
  out.crossBlock = !!out.crossBlock;
  out.assigneeDeptId = out.assigneeDeptId ?? null;
  out.assigneeFacilityId = out.assigneeFacilityId ?? null;
  out.approvalRequiredFrom = out.approvalRequiredFrom ?? null;
  out.approvedBy = out.approvedBy ?? null;
  out.approvedAt = out.approvedAt ?? null;
  out.rejectionReason = out.rejectionReason ?? null;
  out.dueDate = out.dueDate ?? null;
  return out;
}
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
