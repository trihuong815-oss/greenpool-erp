// PATCH  /api/personal/journal/[id] — update entry của caller
// DELETE /api/personal/journal/[id] — soft delete

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { getOwnedJournalOr404, VALID_MOOD } from '@/lib/services/personal-work-service';

const MAX_TEXT = 5000;
function clean(s: unknown): string | undefined {
  if (s === undefined) return undefined;
  if (typeof s !== 'string') return undefined;
  return s.trim().slice(0, MAX_TEXT);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentProfile();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });

  try {
    const { ref } = await getOwnedJournalOr404(id, user.profile.id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const sections: Array<keyof typeof body> = ['didToday', 'challenges', 'learned', 'tomorrow', 'freeNote'];
    for (const k of sections) {
      const v = clean(body[k]);
      if (v !== undefined) patch[k as string] = v;
    }
    if (body.mood !== undefined) {
      if (body.mood === null || body.mood === '') patch.mood = null;
      else if (typeof body.mood === 'string' && VALID_MOOD.has(body.mood as any)) patch.mood = body.mood;
      else return NextResponse.json({ error: 'mood không hợp lệ' }, { status: 400 });
    }
    if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'Không có field hợp lệ' }, { status: 400 });
    await ref.update(patch);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.status === 404) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    console.error('[personal journal PATCH]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentProfile();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  void req;
  const { id } = await ctx.params;
  try {
    const { ref } = await getOwnedJournalOr404(id, user.profile.id);
    const now = new Date();
    await ref.update({ deleted: true, deletedAt: now, updatedAt: now });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.status === 404) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    console.error('[personal journal DELETE]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}
