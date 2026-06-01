// /api/chat/conversations/[cid]/messages
// GET ?limit=50&before=<iso> → list messages cũ hơn `before`, mới nhất trước (orderBy sentAt desc)
// POST { text } → gửi message + update conversation.lastMessage + push noti

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS, SUBCOLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  isParticipant, previewMessage, validateMessagePayload,
  type MessageAttachment, type MessageReplyRef, type MessageForwardRef, type StickerRef,
} from '@/lib/firebase/chat-scope';
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
    replyTo: d.replyTo ?? null,
    forwardedFrom: d.forwardedFrom ?? null,
    sticker: d.sticker ?? null,
    sentAt: d.sentAt instanceof Timestamp ? d.sentAt.toDate().toISOString() : d.sentAt,
  };
}

function sanitizeAttachments(input: unknown): MessageAttachment[] {
  if (!Array.isArray(input)) return [];
  const out: MessageAttachment[] = [];
  for (const x of input.slice(0, 10)) {
    if (!x || typeof x !== 'object') continue;
    const a = x as any;
    if (typeof a.path !== 'string' || typeof a.fileName !== 'string' || typeof a.mime !== 'string'
        || typeof a.size !== 'number') continue;
    // Voice: client phải truyền kind='voice' tường minh (vì mime audio/* không đảm bảo là voice).
    const kind: MessageAttachment['kind'] = a.kind === 'voice'
      ? 'voice'
      : a.mime.startsWith('image/') ? 'image' : 'file';
    const att: MessageAttachment = { path: a.path, fileName: a.fileName, mime: a.mime, size: a.size, kind };
    if (kind === 'voice' && typeof a.duration === 'number' && a.duration > 0) att.duration = Math.round(a.duration);
    if (kind === 'image') {
      if (typeof a.width === 'number') att.width = a.width;
      if (typeof a.height === 'number') att.height = a.height;
    }
    out.push(att);
  }
  return out;
}

function sanitizeReplyTo(input: unknown): MessageReplyRef | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const r = input as any;
  if (typeof r.id !== 'string' || typeof r.senderName !== 'string') return undefined;
  const preview: MessageReplyRef['preview'] = (['image','file','voice','sticker','text'] as const).includes(r.preview)
    ? r.preview : 'text';
  return {
    id: r.id,
    text: typeof r.text === 'string' ? r.text.slice(0, 200) : '',
    senderName: r.senderName.slice(0, 100),
    preview,
  };
}

function sanitizeForwardedFrom(input: unknown): MessageForwardRef | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const f = input as any;
  if (typeof f.senderName !== 'string') return undefined;
  return {
    senderName: f.senderName.slice(0, 100),
    fromConversationName: typeof f.fromConversationName === 'string' ? f.fromConversationName.slice(0, 100) : undefined,
    forwardedAt: new Date().toISOString(),
  };
}

function sanitizeSticker(input: unknown): StickerRef | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const s = input as any;
  if (typeof s.packId !== 'string' || typeof s.stickerId !== 'string') return undefined;
  // Whitelist: pack 'gp' (Green Pool default) — Phase 13.4 chỉ có 1 pack.
  if (s.packId !== 'gp') return undefined;
  return { packId: s.packId, stickerId: s.stickerId.slice(0, 50) };
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

    // Audit: log read_conv CHỈ khi không paginate (không có before) — tránh log mỗi scroll.
    if (!beforeIso) {
      const { logChatAccess, extractRequestMeta } = await import('@/lib/firebase/chat-audit');
      const meta = extractRequestMeta(req);
      logChatAccess({
        uid: caller.profile.uid,
        userName: caller.actorName ?? '',
        userRole: caller.profile.role_code,
        action: 'read_conv',
        cid,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
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
    // Rate limit: 60 tin/phút/user — chống spam + bot scan.
    const { checkRateLimit } = await import('@/lib/rate-limit');
    const rl = checkRateLimit(`chat_msg:${caller.profile.uid}`, 60, 60);
    if (!rl.ok) {
      return NextResponse.json({
        error: `Bạn gửi tin quá nhanh. Thử lại sau ${rl.retryAfter} giây.`,
      }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } });
    }

    const body = await req.json();
    const text = String(body?.text ?? '');
    const attachments = sanitizeAttachments(body?.attachments);
    const replyTo = sanitizeReplyTo(body?.replyTo);
    const forwardedFrom = sanitizeForwardedFrom(body?.forwardedFrom);
    const sticker = sanitizeSticker(body?.sticker);
    const err = validateMessagePayload(text, attachments, sticker);
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
    const preview = previewMessage(trimmed, attachments, sticker);

    // Batch: insert message + update conv summary + mark sender đã đọc (last read = now).
    const batch = db.batch();
    const msgDoc: Record<string, unknown> = {
      conversationId: cid,
      senderId: caller.profile.uid,
      senderName: caller.actorName ?? '',
      text: trimmed,
      attachments,
      reactions: {},
      sentAt: now,
    };
    if (replyTo) msgDoc.replyTo = replyTo;
    if (forwardedFrom) msgDoc.forwardedFrom = forwardedFrom;
    if (sticker) msgDoc.sticker = sticker;
    batch.set(msgRef, msgDoc);
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

    // Audit log: send_msg / send_voice / send_sticker / forward
    {
      const { logChatAccess, extractRequestMeta } = await import('@/lib/firebase/chat-audit');
      const meta = extractRequestMeta(req);
      let action: 'send_msg' | 'send_voice' | 'send_sticker' | 'forward' = 'send_msg';
      if (forwardedFrom) action = 'forward';
      else if (sticker) action = 'send_sticker';
      else if (attachments.some((a) => a.kind === 'voice')) action = 'send_voice';
      logChatAccess({
        uid: caller.profile.uid,
        userName: caller.actorName ?? '',
        userRole: caller.profile.role_code,
        action,
        cid,
        mid: msgRef.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }

    // Push noti tới participants khác (fire-and-forget)
    const recipients: string[] = (Array.isArray(conv.participantIds) ? conv.participantIds : [])
      .filter((u: string) => u !== caller.profile.uid);
    if (recipients.length > 0) {
      const { notifyNewMessage } = await import('@/lib/firebase/chat-notifications');
      notifyNewMessage({
        conversationId: cid,
        conversationType: conv.type,
        // group + channel đều có name; 1-1 không có (UI tự render tên đối phương)
        conversationName: (conv.type === 'group' || conv.type === 'channel') ? conv.name : null,
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
