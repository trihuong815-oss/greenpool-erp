// GET /api/chat/conversations/[cid]/search?q=<keyword>&limit=50
// Tìm message trong 1 conv chứa text match keyword (case-insensitive, không dấu cover).
// Firestore không có full-text → load up to 500 message gần nhất rồi filter client-side trên server.
// Phù hợp scope chat nội bộ (1 conv hiếm khi > vài nghìn tin).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS, SUBCOLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isParticipant } from '@/lib/firebase/chat-scope';
import { Timestamp } from 'firebase-admin/firestore';

const SCAN_LIMIT = 500;
const MAX_RESULTS = 50;

function normalize(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ cid: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { cid } = await ctx.params;
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
    if (!q) return NextResponse.json({ rows: [] });

    const db = getFirebaseAdminDb();
    const convRef = db.collection(COLLECTIONS.CONVERSATIONS).doc(cid);
    const convSnap = await convRef.get();
    if (!convSnap.exists) return NextResponse.json({ error: 'Conv không tồn tại' }, { status: 404 });
    const conv = convSnap.data()!;
    if (!isParticipant({ participantIds: conv.participantIds ?? [] }, caller.profile.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const snap = await convRef.collection(SUBCOLLECTIONS.MESSAGES)
      .orderBy('sentAt', 'desc')
      .limit(SCAN_LIMIT)
      .get();

    const needle = normalize(q);
    const rows: any[] = [];
    for (const d of snap.docs) {
      const x = d.data();
      const text = String(x.text ?? '');
      if (!text) continue;       // skip ảnh/file thuần — match content only
      if (!normalize(text).includes(needle)) continue;
      rows.push({
        id: d.id,
        senderId: x.senderId,
        senderName: x.senderName,
        text,
        sentAt: x.sentAt instanceof Timestamp ? x.sentAt.toDate().toISOString() : x.sentAt,
      });
      if (rows.length >= MAX_RESULTS) break;
    }
    return NextResponse.json({ rows, scanned: snap.size, truncated: snap.size === SCAN_LIMIT });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chat search GET]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}
