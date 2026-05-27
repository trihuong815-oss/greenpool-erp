// PATCH  /api/personal/goals/[id] — update info hoặc milestones
// DELETE /api/personal/goals/[id] — soft delete

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import {
  getOwnedGoalOr404, VALID_GOAL_CAT, VALID_GOAL_STATUS,
  type GoalMilestone,
} from '@/lib/services/personal-work-service';

const VALID_PRIORITY = new Set(['low', 'medium', 'high']);

function sanitizeMilestones(raw: unknown): GoalMilestone[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((m: any) => ({
    title: typeof m?.title === 'string' ? m.title.trim().slice(0, 200) : '',
    done: !!m?.done,
    completedAt: typeof m?.completedAt === 'string' ? m.completedAt : null,
  })).filter((m) => m.title.length > 0);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentProfile();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });

  try {
    const { ref, data } = await getOwnedGoalOr404(id, user.profile.id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.title === 'string') {
      const t = body.title.trim();
      if (!t || t.length > 200) return NextResponse.json({ error: 'Tên 1-200 ký tự' }, { status: 400 });
      patch.title = t;
    }
    if (typeof body.description === 'string') patch.description = body.description.trim().slice(0, 2000);
    if (typeof body.category === 'string' && VALID_GOAL_CAT.has(body.category as any)) patch.category = body.category;
    if (typeof body.priority === 'string' && VALID_PRIORITY.has(body.priority)) patch.priority = body.priority;
    if (typeof body.status === 'string' && VALID_GOAL_STATUS.has(body.status as any)) {
      patch.status = body.status;
      if (body.status === 'completed' && !data.completedAt) patch.completedAt = new Date();
      if (body.status !== 'completed') patch.completedAt = null;
    }
    if (body.targetDate !== undefined) {
      if (body.targetDate === null || body.targetDate === '') patch.targetDate = null;
      else if (typeof body.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.targetDate)) patch.targetDate = body.targetDate;
      else return NextResponse.json({ error: 'targetDate phải YYYY-MM-DD hoặc null' }, { status: 400 });
    }
    if (body.progressPct !== undefined) {
      const p = Number(body.progressPct);
      if (!Number.isFinite(p)) return NextResponse.json({ error: 'progressPct phải number' }, { status: 400 });
      patch.progressPct = Math.max(0, Math.min(100, Math.round(p)));
    }
    if (body.milestones !== undefined) {
      patch.milestones = sanitizeMilestones(body.milestones);
    }
    if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'Không có field hợp lệ' }, { status: 400 });
    await ref.update(patch);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.status === 404) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    console.error('[personal goals PATCH]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentProfile();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  void req;
  const { id } = await ctx.params;
  try {
    const { ref } = await getOwnedGoalOr404(id, user.profile.id);
    const now = new Date();
    await ref.update({ deleted: true, deletedAt: now, updatedAt: now });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.status === 404) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    console.error('[personal goals DELETE]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}
