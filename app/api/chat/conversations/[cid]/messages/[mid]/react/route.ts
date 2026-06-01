// POST /api/chat/conversations/[cid]/messages/[mid]/react  body { emoji }
// Toggle uid trong reactions[emoji]. Cùng user click cùng emoji 2 lần → undo.
// Chỉ participant được react. Emoji phải nằm trong ALLOWED_REACTIONS (6 emoji).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS, SUBCOLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isParticipant, isAllowedReaction } from '@/lib/firebase/chat-scope';

export async function POST(req: NextRequest, ctx: { params: Promise<{ cid: string; mid: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { cid, mid } = await ctx.params;
    // Rate limit: 120 react/phút/user — react là toggle nhanh, cho ngưỡng cao hơn message.
    const { checkRateLimit } = await import('@/lib/rate-limit');
    const rl = checkRateLimit(`chat_react:${caller.profile.uid}`, 120, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: 'Quá nhanh' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 30) } });
    }

    const body = await req.json();
    const emoji = String(body?.emoji ?? '');
    if (!isAllowedReaction(emoji)) {
      return NextResponse.json({ error: 'Emoji không được phép' }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const convRef = db.collection(COLLECTIONS.CONVERSATIONS).doc(cid);
    const convSnap = await convRef.get();
    if (!convSnap.exists) return NextResponse.json({ error: 'Conv không tồn tại' }, { status: 404 });
    const conv = convSnap.data()!;
    if (!isParticipant({ participantIds: conv.participantIds ?? [] }, caller.profile.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const msgRef = convRef.collection(SUBCOLLECTIONS.MESSAGES).doc(mid);
    // Transaction: read reactions hiện tại → toggle uid → write.
    // Tránh race khi 2 user react cùng lúc cùng emoji.
    // Audit (fire-and-forget)
    {
      const { logChatAccess, extractRequestMeta } = await import('@/lib/firebase/chat-audit');
      const meta = extractRequestMeta(req);
      logChatAccess({
        uid: caller.profile.uid,
        userName: caller.actorName ?? '',
        userRole: caller.profile.role_code,
        action: 'react',
        cid, mid,
        ip: meta.ip, userAgent: meta.userAgent,
      });
    }

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(msgRef);
      if (!snap.exists) throw new Error('Message không tồn tại');
      const data = snap.data()!;
      const reactions: Record<string, string[]> = (data.reactions && typeof data.reactions === 'object')
        ? { ...data.reactions } : {};
      const arr: string[] = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
      const idx = arr.indexOf(caller.profile.uid);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(caller.profile.uid);
      if (arr.length === 0) delete reactions[emoji];
      else reactions[emoji] = arr;
      tx.update(msgRef, { reactions });
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chat react POST]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}
