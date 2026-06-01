// POST /api/chat/conversations/[cid]/read → mark conv là đã đọc tới hiện tại (readBy[uid] = now).

import { NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isParticipant } from '@/lib/firebase/chat-scope';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(_req: Request, ctx: { params: Promise<{ cid: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { cid } = await ctx.params;
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.CONVERSATIONS).doc(cid);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Conv không tồn tại' }, { status: 404 });
    const data = snap.data()!;
    if (!isParticipant({ participantIds: data.participantIds ?? [] }, caller.profile.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await ref.update({ [`readBy.${caller.profile.uid}`]: Timestamp.now() });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chat read POST]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}
