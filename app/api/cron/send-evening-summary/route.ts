// POST /api/cron/send-evening-summary
// Trigger: GitHub Actions cron — chạy 13:00 UTC (= 20:00 Vietnam GMT+7).
// Auth: Bearer CRON_SECRET.
//
// Logic:
// 1. Query users active có fcmTokens
// 2. Với mỗi user: query personalTasks dueDate=tomorrow status NOT (done, cancelled)
// 3. Gửi FCM push: "Chào buổi tối! N việc cho ngày mai" + lời chúc nghỉ ngơi
// 4. Cleanup invalid tokens

import { NextRequest, NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdmin, getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { extractFcmTokens, cleanupInvalidFcmTokens } from '@/lib/firebase/fcm-tokens';

export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization');
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

function tomorrowDateStr(): string {
  // "Ngày mai" tính theo giờ Vietnam (GMT+7), không phải UTC.
  // Server chạy UTC nên cần convert qua Intl.DateTimeFormat với timeZone Asia/Ho_Chi_Minh.
  const nowVN = new Date(Date.now() + 7 * 60 * 60_000); // shift sang VN
  const tomorrow = new Date(nowVN);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getFirebaseAdminDb();
  const tomorrow = tomorrowDateStr();

  // Fetch active users với fcmTokens
  const usersSnap = await db.collection(COLLECTIONS.USERS)
    .where('status', '==', 'active')
    .get();

  const candidates: { uid: string; tokens: string[]; displayName: string }[] = [];
  for (const d of usersSnap.docs) {
    const x = d.data();
    const tokens = extractFcmTokens(x);
    if (tokens.length === 0) continue;
    candidates.push({ uid: d.id, tokens, displayName: x.displayName ?? '' });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, msg: 'No users with FCM tokens' });
  }

  getFirebaseAdmin();
  const messaging = getMessaging();
  let totalSent = 0;
  const tokensToRemove: { uid: string; token: string }[] = [];

  // Date string today VN cho dedup key
  const nowVN = new Date(Date.now() + 7 * 60 * 60_000);
  const todayVN = `${nowVN.getUTCFullYear()}-${String(nowVN.getUTCMonth() + 1).padStart(2, '0')}-${String(nowVN.getUTCDate()).padStart(2, '0')}`;
  const dedupKey = `${todayVN}_evening`;

  for (const u of candidates) {
    // Dedup: skip nếu user đã nhận evening summary hôm nay (cron OR client trigger trước đó)
    const userRef = db.collection(COLLECTIONS.USERS).doc(u.uid);
    let claimed = false;
    try {
      await db.runTransaction(async (txn) => {
        const s = await txn.get(userRef);
        if (!s.exists) return;
        const log = (s.data()?.summarySentLog ?? {}) as Record<string, unknown>;
        if (log[dedupKey]) return;
        log[dedupKey] = new Date().toISOString();
        const keys = Object.keys(log).sort();
        if (keys.length > 30) for (const k of keys.slice(0, keys.length - 30)) delete log[k];
        txn.update(userRef, { summarySentLog: log });
        claimed = true;
      });
    } catch { continue; }
    if (!claimed) continue;

    // Query tasks ngày mai
    const tasksSnap = await db.collection(COLLECTIONS.PERSONAL_TASKS)
      .where('ownerId', '==', u.uid)
      .where('dueDate', '==', tomorrow)
      .limit(20)
      .get();

    const tomorrowTasks = tasksSnap.docs
      .map((d) => d.data() as { title: string; status: string; scheduledTime?: string | null })
      .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
      .sort((a, b) => (a.scheduledTime ?? '99:99').localeCompare(b.scheduledTime ?? '99:99'));

    // Luôn gửi lời chúc buổi tối — dù có task hay không (theo yêu cầu user)
    const firstName = u.displayName.split(' ').slice(-1)[0] || 'bạn';
    const taskList = tomorrowTasks.slice(0, 3).map((t) =>
      t.scheduledTime ? `${t.scheduledTime} ${t.title}` : t.title
    ).join(' · ');
    const more = tomorrowTasks.length > 3 ? ` (+${tomorrowTasks.length - 3} việc)` : '';
    const body = tomorrowTasks.length > 0
      ? `${tomorrowTasks.length} việc cho ngày mai: ${taskList}${more}. Hãy nghỉ ngơi thật khoẻ nhé! 💚`
      : `Ngày mai chưa có task lên lịch — hãy nghỉ ngơi thật khoẻ cho ngày mai tuyệt vời nhé! 💚`;

    const message = {
      notification: {
        title: `🌙 Chào buổi tối, ${firstName}!`,
        body,
      },
      webpush: {
        fcmOptions: { link: '/cong-viec-ca-nhan' },
        notification: {
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `evening-${tomorrow}`,
          requireInteraction: false,
        },
      },
      data: { kind: 'evening-summary', date: tomorrow },
      tokens: u.tokens,
    };

    try {
      const res = await messaging.sendEachForMulticast(message);
      totalSent += res.successCount;
      res.responses.forEach((r, i) => {
        if (!r.success && r.error) {
          const code = r.error.code ?? '';
          if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
            tokensToRemove.push({ uid: u.uid, token: u.tokens[i] });
          }
        }
      });
    } catch (e: any) {
      console.error('[cron evening] sendEachForMulticast failed', u.uid, e?.message);
    }
  }

  // Cleanup invalid tokens — group by uid để 1 transaction/uid (Phase B.6 helper)
  const removeByUid = new Map<string, string[]>();
  for (const { uid, token } of tokensToRemove) {
    const arr = removeByUid.get(uid) ?? [];
    arr.push(token);
    removeByUid.set(uid, arr);
  }
  await Promise.all(Array.from(removeByUid.entries()).map(
    ([uid, tokens]) => cleanupInvalidFcmTokens(db, uid, tokens)
  ));

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent: totalSent,
    tokensCleaned: tokensToRemove.length,
    tomorrow,
  });
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, info: 'send-evening-summary cron endpoint' });
}
