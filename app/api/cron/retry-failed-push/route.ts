// POST /api/cron/retry-failed-push
// V6.5 Phase A (2026-06-14): Retry FCM push cho notifications có pushStatus='failed'.
//
// Logic:
//   - Query notifications where pushStatus='failed' AND retryCount<3 AND nextRetryAt<=now
//   - Group by userId → push lại payload đã snapshot
//   - Backoff: lần 1 sau 1p, lần 2 sau 5p, lần 3 sau 15p
//   - Thành công → pushStatus='sent', sentAt=now
//   - Fail tiếp → tăng retryCount, nextRetryAt = now + backoff(retryCount)
//   - retryCount >= 3 → giữ pushStatus='failed' nhưng KHÔNG retry nữa
//     (notification vẫn còn trong hệ thống — bell + sidebar badge vẫn hoạt động)
//
// Trigger: GitHub Actions cron mỗi 5 phút (min interval).
// Auth: Bearer CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { pushToUsers } from '@/lib/firebase/push-notifications';

export const maxDuration = 60;

// GitHub Actions cron min interval = 5p. Backoff khớp: 5p / 15p / 30p.
const BACKOFF_MS = [5 * 60_000, 15 * 60_000, 30 * 60_000];
const MAX_RETRY = 3;
const QUERY_LIMIT = 200;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || auth.length !== expected.length ||
      !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getFirebaseAdminDb();
  const now = new Date();

  try {
    // Pick failed noti tới hạn retry
    const snap = await db.collection(COLLECTIONS.NOTIFICATIONS)
      .where('pushStatus', '==', 'failed')
      .where('nextRetryAt', '<=', now)
      .limit(QUERY_LIMIT)
      .get();

    if (snap.empty) {
      return NextResponse.json({ ok: true, picked: 0, retried: 0, succeeded: 0, exhausted: 0 });
    }

    // Group by userId (gửi 1 push cho user thay vì N push trùng)
    type Pending = {
      docRef: FirebaseFirestore.DocumentReference;
      userId: string;
      retryCount: number;
      payload: { title: string; body: string; link: string; type: string; entityId: string };
    };
    const pending: Pending[] = [];
    for (const d of snap.docs) {
      const x = d.data();
      const rc = typeof x.retryCount === 'number' ? x.retryCount : 0;
      if (rc >= MAX_RETRY) continue;
      const snapshot = x.pushPayloadSnapshot;
      if (!snapshot || typeof snapshot.title !== 'string') continue;
      pending.push({
        docRef: d.ref,
        userId: x.userId,
        retryCount: rc,
        payload: {
          title: snapshot.title,
          body: snapshot.body ?? '',
          link: snapshot.link ?? '/dashboard',
          type: snapshot.type ?? x.type ?? 'generic',
          entityId: x.entityId,
        },
      });
    }

    if (pending.length === 0) {
      return NextResponse.json({ ok: true, picked: snap.size, retried: 0, succeeded: 0, exhausted: snap.size });
    }

    // Retry per noti (không gộp uid vì payload có thể khác — đề xuất + điều phối + chat lẫn)
    let succeeded = 0;
    let stillFailed = 0;
    let exhausted = 0;
    for (const p of pending) {
      try {
        const r = await pushToUsers([p.userId], {
          title: p.payload.title,
          body: p.payload.body,
          link: p.payload.link,
          tag: `${p.payload.type}-${p.payload.entityId}`,
          data: { kind: p.payload.type, entityId: p.payload.entityId, retry: String(p.retryCount + 1) },
        });
        const uidRes = r.perUid.get(p.userId);
        if (uidRes?.ok) {
          await p.docRef.update({
            pushStatus: 'sent',
            sentAt: now,
            pushError: null,
            retryCount: p.retryCount + 1,
            nextRetryAt: null,
          });
          succeeded++;
        } else {
          const nextRc = p.retryCount + 1;
          if (nextRc >= MAX_RETRY) {
            // Hết retry budget — giữ failed, không schedule
            await p.docRef.update({
              retryCount: nextRc,
              pushError: uidRes?.err ?? 'all-retry-exhausted',
              nextRetryAt: null,
            });
            exhausted++;
          } else {
            await p.docRef.update({
              retryCount: nextRc,
              pushError: uidRes?.err ?? 'push-failed',
              nextRetryAt: new Date(now.getTime() + BACKOFF_MS[nextRc]),
            });
            stillFailed++;
          }
        }
      } catch (e: any) {
        console.warn('[retry-failed-push] item fail noti=' + p.docRef.id + ':', e?.message);
      }
    }

    return NextResponse.json({
      ok: true,
      picked: snap.size,
      retried: pending.length,
      succeeded,
      stillFailed,
      exhausted,
    });
  } catch (e: any) {
    console.error('[retry-failed-push]', e?.message);
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 });
  }
}
