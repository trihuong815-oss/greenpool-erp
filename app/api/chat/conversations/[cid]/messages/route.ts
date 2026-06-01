// /api/chat/conversations/[cid]/messages
// GET ?limit=50&before=<iso> → list messages cũ hơn `before`, mới nhất trước (orderBy sentAt desc)
// POST { text } → gửi message + update conversation.lastMessage + push noti

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS, SUBCOLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isParticipant, previewMessage, validateMessagePayload, type MessageAttachment } from '@/lib/firebase/chat-scope';
import { Timestamp } from 'firebase-admin/firestore';

const COL = COLLECTIONS.CONVERSATIONS;
const SUB = SUBCOLLECTIONS.MESSAGES;
const PAGE = 50;

function serMsg(id: string, d: Record<string, any>) {
  return {
    id,
    conversationId: d.conversationId,
    senderId: d.senderId,
    senderName: d.senderName,
    text: d.text ?? '',
    attachments: Array.isArray(d.attachments) ? d.attachments : [],
    reactions: d.reactions && typeof d.reactions === 'object' ? d.reactions : {},
    sentAt: d.sentAt instanceof Timestamp ? d.sentAt.toDate().toISOString() : d.sentAt,
  };
}

function sanitizeAttachments(input: unknown): MessageAttachment[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 10).map((x) => {
    if (!x || typeof x !== 'object') return null;
    const a = x as any;
    if (typeof a.path !== 'string' || typeof a.fileName !== 'string' || typeof a.mime !== 'string'
        || typeof a.size !== 'number') return null;
    const kind: 'image' | 'file' = a.mime.startsWith('image/') ? 'image' : 'file';
    return { path: a.path, fileName: a.fileName, mime: a.mime, size: a.size, kind };
  }).filter((x): x is MessageAttachment => x !== null);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ cid: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { cid } = await ctx.params;
    const db = getFirebaseAdminDb();
    const convRef = db.collection(COL).doc(cid);
    const convSnap = await convRef.get();
    if (!convSnap.exists) return NextResponse.json({ error: 'Conv không tồn tại' }, { status: 404 });
    const conv = convSnap.data()!;
    if (!isParticipant({ participantIds: conv.participantIds ?? [] }, caller.profile.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const qs = req.nextUrl.searchParams;
    const limit = Math.min(PAGE, Math.max(1, Number(qs.get('limit') ?? PAGE)));
    const beforeIso = qs.get('before');
    let q: FirebaseFirestore.Query = convRef.collection(SUB).orderBy('sentAt', 'desc').limit(limit);
    if (beforeIso) {
      const beforeTs = Timestamp.fromDate(new Date(beforeIso));
      q = q.startAfter(beforeTs);
    }
    const snap = await q.get();
    const rows = snap.docs.map((d) => serMsg(d.id, d.data())).reverse();   // reverse → cũ→mới cho UI
    return NextResponse.json({ rows });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chat messages GET]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ cid: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { cid } = await ctx.params;
    const body = await req.json();
    const text = String(body?.text ?? '');
    const attachments = sanitizeAttachments(body?.attachments);
    const err = validateMessagePayload(text, attachments);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const db = getFirebaseAdminDb();
    const convRef = db.collection(COL).doc(cid);
    const convSnap = await convRef.get();
    if (!convSnap.exists) return NextResponse.json({ error: 'Conv không tồn tại' }, { status: 404 });
    const conv = convSnap.data()!;
    if (!isParticipant({ participantIds: conv.participantIds ?? [] }, caller.profile.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = Timestamp.now();
    const msgRef = convRef.collection(SUB).doc();
    const trimmed = text.trim();
    const preview = previewMessage(trimmed, attachments);

    // Batch: insert message + update conv summary + mark sender đã đọc (last read = now).
    const batch = db.batch();
    batch.set(msgRef, {
      conversationId: cid,
      senderId: caller.profile.uid,
      senderName: caller.actorName ?? '',
      text: trimmed,
      attachments,
      reactions: {},
      sentAt: now,
    });
    batch.update(convRef, {
      lastMessage: {
        text: preview,
        senderId: caller.profile.uid,
        senderName: caller.actorName ?? '',
        sentAt: now,
      },
      lastMessageAt: now,
      [`readBy.${caller.profile.uid}`]: now,
    });
    await batch.commit();

    // Push noti tới participants khác (fire-and-forget)
    const recipients: string[] = (Array.isArray(conv.participantIds) ? conv.participantIds : [])
      .filter((u: string) => u !== caller.profile.uid);
    if (recipients.length > 0) {
      const { notifyNewMessage } = await import('@/lib/firebase/chat-notifications');
      notifyNewMessage({
        conversationId: cid,
        conversationType: conv.type,
        conversationName: conv.type === 'group' ? conv.name : null,
        recipients,
        senderName: caller.actorName ?? '',
        text: preview,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, id: msgRef.id });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chat messages POST]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}
