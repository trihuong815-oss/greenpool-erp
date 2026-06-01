// /api/chat/conversations
// GET  → list conversation tôi tham gia (array-contains uid), orderBy lastMessageAt desc
// POST → tạo conv mới:
//   1-1: body { type: '1-1', otherUid }   → dedup theo deterministic id `dm_<sortedA>__<sortedB>`
//   group: body { type: 'group', name, memberUids[] }  → auto id

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { oneToOneConversationId, sortedParticipants } from '@/lib/firebase/chat-scope';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const COL = COLLECTIONS.CONVERSATIONS;
const LIST_LIMIT = 100;

function serialize(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Timestamp) out[k] = v.toDate().toISOString();
    else if (v && typeof v === 'object' && typeof (v as any).toDate === 'function') out[k] = (v as any).toDate().toISOString();
    else if (k === 'lastMessage' && v && typeof v === 'object') {
      const lm = v as any;
      out[k] = {
        ...lm,
        sentAt: lm.sentAt instanceof Timestamp ? lm.sentAt.toDate().toISOString() : lm.sentAt,
      };
    }
    else if (k === 'readBy' && v && typeof v === 'object') {
      const r: Record<string, string> = {};
      for (const [uid, ts] of Object.entries(v)) {
        r[uid] = ts instanceof Timestamp ? ts.toDate().toISOString() : (ts as any);
      }
      out[k] = r;
    }
    else out[k] = v;
  }
  return out;
}

export async function GET() {
  try {
    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COL)
      .where('participantIds', 'array-contains', caller.profile.uid)
      .orderBy('lastMessageAt', 'desc')
      .limit(LIST_LIMIT)
      .get();
    const rows = snap.docs.map((d) => serialize(d.id, d.data()));
    return NextResponse.json({ rows });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    // Index chưa build → trả empty + flag indexBuilding để UI hiện banner
    if (e?.code === 9 || /FAILED_PRECONDITION/.test(e?.message ?? '')) {
      console.warn('[chat conversations GET] index building', e?.message);
      return NextResponse.json({ rows: [], indexBuilding: true });
    }
    console.error('[chat conversations GET]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const type = String(body?.type ?? '');
    if (type !== '1-1' && type !== 'group') {
      return NextResponse.json({ error: 'type phải là 1-1 hoặc group' }, { status: 400 });
    }
    const db = getFirebaseAdminDb();

    if (type === '1-1') {
      const otherUid = String(body?.otherUid ?? '').trim();
      if (!otherUid || otherUid === caller.profile.uid) {
        return NextResponse.json({ error: 'otherUid không hợp lệ' }, { status: 400 });
      }
      const otherDoc = await db.collection(COLLECTIONS.USERS).doc(otherUid).get();
      if (!otherDoc.exists || otherDoc.data()?.status !== 'active') {
        return NextResponse.json({ error: 'Người dùng không tồn tại hoặc đã ngừng hoạt động' }, { status: 400 });
      }
      const otherName = otherDoc.data()?.displayName ?? otherDoc.data()?.email ?? '?';
      const cid = oneToOneConversationId(caller.profile.uid, otherUid);
      const ref = db.collection(COL).doc(cid);
      const existing = await ref.get();
      if (existing.exists) {
        return NextResponse.json({ ok: true, id: cid, existed: true });
      }
      const now = Timestamp.now();
      await ref.set({
        type: '1-1',
        participantIds: sortedParticipants([caller.profile.uid, otherUid]),
        participantNames: {
          [caller.profile.uid]: caller.actorName ?? '',
          [otherUid]: otherName,
        },
        lastMessage: null,
        lastMessageAt: now,    // sentinel để mới tạo cũng xuất hiện trên list
        readBy: { [caller.profile.uid]: now },
        createdAt: now,
        createdBy: caller.profile.uid,
        createdByName: caller.actorName ?? '',
      });
      return NextResponse.json({ ok: true, id: cid, existed: false });
    }

    // GROUP
    const name = String(body?.name ?? '').trim().slice(0, 100);
    if (!name) return NextResponse.json({ error: 'Tên nhóm bắt buộc' }, { status: 400 });
    const rawMembers = Array.isArray(body?.memberUids) ? body.memberUids : [];
    const memberUids: string[] = rawMembers.filter((x: unknown) => typeof x === 'string' && x.trim().length > 0);
    if (memberUids.length === 0) return NextResponse.json({ error: 'Phải chọn ít nhất 1 thành viên' }, { status: 400 });
    const all = sortedParticipants([caller.profile.uid, ...memberUids]).slice(0, 100);
    if (all.length < 2) return NextResponse.json({ error: 'Nhóm cần ≥ 2 người' }, { status: 400 });

    // SECURITY: validate mọi member tồn tại + status=active.
    // Tránh client gửi uid bịa → conversation có người không tồn tại, hoặc gửi tin tới user đã off.
    const userDocs = await Promise.all(all.map((u) => db.collection(COLLECTIONS.USERS).doc(u).get()));
    const participantNames: Record<string, string> = {};
    const invalid: string[] = [];
    for (let i = 0; i < userDocs.length; i++) {
      const d = userDocs[i];
      if (!d.exists) { invalid.push(all[i]); continue; }
      const x = d.data()!;
      if (x.status !== 'active') { invalid.push(all[i]); continue; }
      participantNames[d.id] = x.displayName ?? x.email ?? '?';
    }
    if (invalid.length > 0) {
      return NextResponse.json({
        error: `${invalid.length} thành viên không tồn tại hoặc đã ngừng hoạt động`,
      }, { status: 400 });
    }

    const ref = db.collection(COL).doc();
    const now = Timestamp.now();
    await ref.set({
      type: 'group',
      name,
      participantIds: all,
      participantNames,
      lastMessage: null,
      lastMessageAt: now,
      readBy: { [caller.profile.uid]: now },
      createdAt: now,
      createdBy: caller.profile.uid,
      createdByName: caller.actorName ?? '',
      ownerId: caller.profile.uid,
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chat conversations POST]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}

// Pre-declare unused var helper to avoid TS hint
void FieldValue;
