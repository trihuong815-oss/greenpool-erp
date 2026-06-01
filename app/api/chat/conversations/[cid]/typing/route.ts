// POST /api/chat/conversations/[cid]/typing  body { on: boolean }
// Set/clear typing state cho user trong conv.
//   on=true  → conv.typing[uid] = serverTimestamp (expire 8s ở client)
//   on=false → delete conv.typing[uid]
// Client gọi throttled (5s on, off khi blur/send). Stale auto-filter ở UI (>8s = ignore).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isParticipant } from '@/lib/firebase/chat-scope';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export async function POST(req: NextRequest, ctx: { params: Promise<{ cid: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { cid } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const on = !!body?.on;

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.CONVERSATIONS).doc(cid);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Conv không tồn tại' }, { status: 404 });
    const data = snap.data()!;
    if (!isParticipant({ participantIds: data.participantIds ?? [] }, caller.profile.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (on) {
      await ref.update({ [`typing.${caller.profile.uid}`]: Timestamp.now() });
    } else {
      await ref.update({ [`typing.${caller.profile.uid}`]: FieldValue.delete() });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chat typing POST]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}
