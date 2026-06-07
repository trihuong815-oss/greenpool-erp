// POST /api/cron/send-reminders
// Trigger: GitHub Actions cron */5 * * * * (mỗi 5 phút).
// Auth: header `Authorization: Bearer <CRON_SECRET>` — không phải user session.
//
// Logic:
// 1. Query personalTasks: reminderAt ≤ now AND reminderSent != true AND status NOT IN (done, cancelled)
// 2. Với mỗi task: lấy ownerId → fetch users/{uid}.fcmTokens
// 3. Gửi FCM multicast push tới các tokens
// 4. Set task.reminderSent = true để không gửi lại
// 5. Cleanup token invalid (FCM trả về not-registered/invalid-argument)

import { NextRequest, NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdmin, getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { extractFcmTokens, cleanupInvalidFcmTokens } from '@/lib/firebase/fcm-tokens';

export const maxDuration = 60;

interface TaskDoc {
  ownerId: string;
  title: string;
  reminderAt: string;
  scheduledTime?: string | null;
  dueDate?: string | null;
  status: string;
  reminderSent?: boolean;
}

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization');
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  // timing-safe compare — prevent character-by-character brute force
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getFirebaseAdminDb();
  const nowIso = new Date().toISOString();

  // Query tasks có reminderAt ≤ now và chưa gửi.
  // Firestore where reminderSent != true không hỗ trợ trực tiếp → fetch reminderAt ≤ now rồi filter client-side.
  const snap = await db.collection(COLLECTIONS.PERSONAL_TASKS)
    .where('reminderAt', '<=', nowIso)
    .where('reminderAt', '>', new Date(Date.now() - 6 * 60 * 60_000).toISOString()) // window 6h — vừa đủ với cron */5 + delay
    .limit(500)
    .get();

  const pending: { id: string; data: TaskDoc }[] = [];
  for (const d of snap.docs) {
    const data = d.data() as TaskDoc;
    if (data.reminderSent === true) continue;
    if (data.status === 'done' || data.status === 'cancelled') continue;
    pending.push({ id: d.id, data });
  }

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, msg: 'No pending reminders' });
  }

  // Group by owner
  const byOwner: Map<string, { id: string; data: TaskDoc }[]> = new Map();
  for (const t of pending) {
    if (!byOwner.has(t.data.ownerId)) byOwner.set(t.data.ownerId, []);
    byOwner.get(t.data.ownerId)!.push(t);
  }

  let totalSent = 0;
  const tokensToRemove: { uid: string; token: string }[] = [];
  const taskMarkSent: string[] = [];

  // Need admin to be initialized before getMessaging()
  getFirebaseAdmin();
  const messaging = getMessaging();

  for (const [uid, tasks] of byOwner.entries()) {
    const userSnap = await db.collection(COLLECTIONS.USERS).doc(uid).get();
    if (!userSnap.exists) continue;
    const user = userSnap.data() as any;
    const tokens = extractFcmTokens(user);
    if (tokens.length === 0) {
      // User chưa register token → vẫn mark sent để khỏi spam log
      for (const t of tasks) taskMarkSent.push(t.id);
      continue;
    }

    for (const t of tasks) {
      const timeLabel = t.data.scheduledTime ? ` lúc ${t.data.scheduledTime}` : '';
      const message = {
        notification: {
          title: `🔔 ${t.data.title}`,
          body: `Còn ~1 tiếng nữa${timeLabel}`,
        },
        webpush: {
          fcmOptions: {
            link: '/cong-viec-ca-nhan',
          },
          notification: {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: t.id,
            requireInteraction: false,
          },
        },
        data: {
          taskId: t.id,
          kind: 'reminder',
        },
        tokens,
      };
      try {
        const res = await messaging.sendEachForMulticast(message);
        totalSent += res.successCount;
        // Cleanup invalid tokens
        res.responses.forEach((r, i) => {
          if (!r.success && r.error) {
            const code = r.error.code ?? '';
            if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
              tokensToRemove.push({ uid, token: tokens[i] });
            }
          }
        });
        taskMarkSent.push(t.id);
      } catch (e: any) {
        console.error('[cron send-reminders] sendEachForMulticast failed', t.id, e?.message);
      }
    }
  }

  // Cleanup invalid tokens — group by uid (Phase B.6 helper)
  const removeByUid = new Map<string, string[]>();
  for (const { uid, token } of tokensToRemove) {
    const arr = removeByUid.get(uid) ?? [];
    arr.push(token);
    removeByUid.set(uid, arr);
  }
  await Promise.all(Array.from(removeByUid.entries()).map(
    ([uid, tokens]) => cleanupInvalidFcmTokens(db, uid, tokens)
  ));

  // Mark tasks as reminderSent — atomic via transaction để tránh race với /check-my-reminders
  // (cùng task có thể được fetch song song bởi cron + user trigger)
  for (const taskId of taskMarkSent) {
    try {
      await db.runTransaction(async (txn) => {
        const ref = db.collection(COLLECTIONS.PERSONAL_TASKS).doc(taskId);
        const s = await txn.get(ref);
        if (!s.exists) return;
        const d = s.data();
        if (d?.reminderSent === true) return;  // đã mark bởi process khác
        txn.update(ref, {
          reminderSent: true,
          reminderSentAt: FieldValue.serverTimestamp(),
        });
      });
    } catch { /* ignore individual failures */ }
  }

  return NextResponse.json({
    ok: true,
    pendingCount: pending.length,
    sent: totalSent,
    tasksMarked: taskMarkSent.length,
    tokensCleaned: tokensToRemove.length,
  });
}

// GET cho debug
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, info: 'send-reminders cron endpoint — use POST to trigger' });
}
