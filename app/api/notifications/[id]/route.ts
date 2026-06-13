// V6.4 P2 (2026-06-13): PATCH /api/notifications/[id]
// Body: { isRead?: true, actionStatus?: 'dismissed' }
// Permission: chỉ owner (notification.userId === caller.uid) được sửa.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.NOTIFICATIONS).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;
    if (data.userId !== caller.profile.uid) {
      return NextResponse.json({ error: 'Chỉ chủ noti được sửa' }, { status: 403 });
    }

    const patch: Record<string, any> = {};
    if (body.isRead === true && !data.isRead) {
      patch.isRead = true;
      patch.readAt = new Date();
    }
    if (body.actionStatus === 'dismissed' && data.actionStatus === 'pending') {
      patch.actionStatus = 'dismissed';
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, noop: true });
    }
    await ref.update(patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[PATCH /api/notifications/[id]]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
