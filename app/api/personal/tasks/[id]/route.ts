// PATCH  /api/personal/tasks/[id] — update fields cho task của caller
// DELETE /api/personal/tasks/[id] — soft delete (deleted=true)
//
// PRIVACY: getOwnedTaskOr404 đảm bảo task thuộc caller.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import {
  getOwnedTaskOr404, auditPersonalTask,
  VALID_PRIORITY, VALID_STATUS, VALID_CATEGORY,
  type TaskPriority, type TaskStatus, type TaskCategory,
} from '@/lib/services/personal-work-service';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentProfile();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
  }

  try {
    const { ref, data } = await getOwnedTaskOr404(id, user.profile.id);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.title === 'string') {
      const t = String(body.title).trim();
      if (!t || t.length > 200) return NextResponse.json({ error: 'Tiêu đề 1-200 ký tự' }, { status: 400 });
      patch.title = t;
    }
    if (typeof body.description === 'string') {
      patch.description = String(body.description).trim().slice(0, 5000);
    }
    if (typeof body.priority === 'string' && VALID_PRIORITY.has(body.priority as TaskPriority)) {
      patch.priority = body.priority;
    }
    if (typeof body.status === 'string' && VALID_STATUS.has(body.status as TaskStatus)) {
      patch.status = body.status;
    }
    if (typeof body.category === 'string' && VALID_CATEGORY.has(body.category as TaskCategory)) {
      patch.category = body.category;
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate === null || body.dueDate === '') patch.dueDate = null;
      else if (typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) patch.dueDate = body.dueDate;
      else return NextResponse.json({ error: 'dueDate phải YYYY-MM-DD hoặc null' }, { status: 400 });
    }
    if (body.reminderAt !== undefined) {
      if (body.reminderAt === null || body.reminderAt === '') patch.reminderAt = null;
      else if (typeof body.reminderAt === 'string') patch.reminderAt = body.reminderAt;
      else return NextResponse.json({ error: 'reminderAt phải ISO string hoặc null' }, { status: 400 });
    }

    if (Object.keys(patch).length === 1) {
      // chỉ có updatedAt → không có field hợp lệ
      return NextResponse.json({ error: 'Không có field hợp lệ' }, { status: 400 });
    }

    await ref.update(patch);
    await auditPersonalTask('update_personal_task', id, String(patch.title ?? data.title), {
      userId: user.profile.id,
      actorName: user.profile.displayName,
      actorRole: user.profile.roleName ?? user.profile.roleCode,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.status === 404) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    console.error('[personal tasks PATCH]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentProfile();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  void req;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

  try {
    const { ref, data } = await getOwnedTaskOr404(id, user.profile.id);
    const now = new Date();
    // Soft delete — KHÔNG hard delete (audit + recovery)
    await ref.update({
      deleted: true,
      deletedAt: now,
      deletedBy: user.profile.id,
      updatedAt: now,
    });
    await auditPersonalTask('delete_personal_task', id, data.title, {
      userId: user.profile.id,
      actorName: user.profile.displayName,
      actorRole: user.profile.roleName ?? user.profile.roleCode,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.status === 404) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    console.error('[personal tasks DELETE]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}
