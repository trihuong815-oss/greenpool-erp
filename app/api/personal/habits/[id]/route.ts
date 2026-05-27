// PATCH  /api/personal/habits/[id] — update info HOẶC toggle 1 ngày completion
//                                     body: { ...info } HOẶC { toggleDate: 'YYYY-MM-DD', completed: boolean }
// DELETE /api/personal/habits/[id] — soft delete

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import {
  getOwnedHabitOr404,
  VALID_HABIT_FREQ, VALID_HABIT_CAT,
} from '@/lib/services/personal-work-service';

const VALID_COLOR = new Set(['emerald', 'cyan', 'amber', 'rose', 'violet', 'indigo', 'slate', 'pink', 'orange']);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentProfile();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });

  try {
    const { ref, data } = await getOwnedHabitOr404(id, user.profile.id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    // ─── Toggle completion ───
    if (typeof body.toggleDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.toggleDate)) {
      const completed = body.completed !== false;  // default true
      const next = { ...data.completions };
      if (completed) next[body.toggleDate] = true;
      else delete next[body.toggleDate];
      patch.completions = next;
      await ref.update(patch);
      return NextResponse.json({ ok: true, completions: next });
    }

    // ─── Update info ───
    if (typeof body.title === 'string') {
      const t = body.title.trim();
      if (!t || t.length > 100) return NextResponse.json({ error: 'Tên 1-100 ký tự' }, { status: 400 });
      patch.title = t;
    }
    if (typeof body.description === 'string') patch.description = body.description.trim().slice(0, 500);
    if (typeof body.category === 'string' && VALID_HABIT_CAT.has(body.category as any)) patch.category = body.category;
    if (typeof body.frequency === 'string' && VALID_HABIT_FREQ.has(body.frequency as any)) patch.frequency = body.frequency;
    if (typeof body.color === 'string' && VALID_COLOR.has(body.color)) patch.color = body.color;
    if (typeof body.icon === 'string') patch.icon = body.icon.slice(0, 30);
    if (typeof body.archived === 'boolean') patch.archived = body.archived;

    if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'Không có field hợp lệ' }, { status: 400 });
    await ref.update(patch);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.status === 404) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    console.error('[personal habits PATCH]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentProfile();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  void req;
  const { id } = await ctx.params;
  try {
    const { ref } = await getOwnedHabitOr404(id, user.profile.id);
    const now = new Date();
    await ref.update({ deleted: true, deletedAt: now, updatedAt: now });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.status === 404) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    console.error('[personal habits DELETE]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}
