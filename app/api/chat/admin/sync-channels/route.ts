// POST /api/chat/admin/sync-channels
// Re-sync participantIds + names cho tất cả 13 standard channels theo trạng thái
// users hiện tại (status=active + branchId + departmentId).
// Dùng khi: tạo user mới, đổi branchId/departmentId, user inactive,...
//
// Chỉ ADMIN/CEO được gọi.

import { NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { STANDARD_CHANNELS, channelConversationId } from '@/lib/firebase/chat-scope';
import { resolveChannelParticipants } from '@/lib/firebase/chat-channel-resolver';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST() {
  try {
    const caller = await getAuthedCaller();
    const role = caller.profile.role_code;
    if (role !== 'ADMIN' && role !== 'CEO') {
      return NextResponse.json({ error: 'Chỉ ADMIN/CEO được sync channels' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    const now = Timestamp.now();
    const results: Array<{ id: string; name: string; members: number; created: boolean; added: number; removed: number }> = [];

    for (const ch of STANDARD_CHANNELS) {
      const cid = channelConversationId(ch.meta);
      const { ids, names } = await resolveChannelParticipants(ch.meta);
      if (ids.length === 0) continue;

      const ref = db.collection('conversations').doc(cid);
      const existing = await ref.get();
      const before: string[] = Array.isArray(existing.data()?.participantIds) ? existing.data()!.participantIds : [];
      const added = ids.filter((u) => !before.includes(u)).length;
      const removed = before.filter((u) => !ids.includes(u)).length;
      const baseDoc = {
        type: 'channel',
        name: ch.name,
        participantIds: ids,
        participantNames: names,
        channel: ch.meta,
        systemManaged: true,
      };
      if (!existing.exists) {
        await ref.set({
          ...baseDoc,
          lastMessage: null, lastMessageAt: now, readBy: {},
          createdAt: now,
          createdBy: 'system',
          createdByName: 'Hệ thống',
        });
        results.push({ id: cid, name: ch.name, members: ids.length, created: true, added: ids.length, removed: 0 });
      } else {
        if (added > 0 || removed > 0 || existing.data()?.name !== ch.name) {
          await ref.update(baseDoc);
        }
        results.push({ id: cid, name: ch.name, members: ids.length, created: false, added, removed });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chat sync-channels]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}
