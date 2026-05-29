// POST /api/cron/send-morning-summary
// Trigger: GitHub Actions cron — 00:00 UTC = 07:00 Vietnam.
// Auth: Bearer CRON_SECRET.
//
// Logic:
// 1. Query users active có fcmTokens
// 2. Với mỗi user: query personalTasks dueDate=today, status NOT (done, cancelled)
// 3. Cũng tổng hợp tasks giao việc (collection tasks) assigneeUserIds=uid, dueDate=today
// 4. Gửi FCM push "Chào buổi sáng + N việc hôm nay"

import { NextRequest, NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdmin, getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

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

function todayDateStrVN(): string {
  // "Hôm nay" theo giờ Vietnam (GMT+7).
  // Cron chạy 00:00 UTC = 07:00 VN → hôm nay VN = (now UTC + 7h).getUTCDate()
  const nowVN = new Date(Date.now() + 7 * 60 * 60_000);
  return `${nowVN.getUTCFullYear()}-${String(nowVN.getUTCMonth() + 1).padStart(2, '0')}-${String(nowVN.getUTCDate()).padStart(2, '0')}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getFirebaseAdminDb();
  const today = todayDateStrVN();

  // Fetch active users với fcmTokens
  const usersSnap = await db.collection(COLLECTIONS.USERS)
    .where('status', '==', 'active')
    .get();

  const candidates: { uid: string; tokens: string[]; displayName: string }[] = [];
  for (const d of usersSnap.docs) {
    const x = d.data();
    const tokens = Array.isArray(x.fcmTokens) ? x.fcmTokens.filter((t: any) => typeof t === 'string') : [];
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
  const dedupKey = `${today}_morning`;

  for (const u of candidates) {
    // Dedup: skip nếu đã nhận morning summary hôm nay (cron OR client trigger trước đó)
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

    // 1. Personal tasks hôm nay
    const ptSnap = await db.collection(COLLECTIONS.PERSONAL_TASKS)
      .where('ownerId', '==', u.uid)
      .where('dueDate', '==', today)
      .limit(20).get();
    const personalToday = ptSnap.docs
      .map((d) => d.data() as { title: string; status: string; scheduledTime?: string | null })
      .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
      .sort((a, b) => (a.scheduledTime ?? '99:99').localeCompare(b.scheduledTime ?? '99:99'));

    // 2. Tasks giao việc hôm nay (assignee = uid)
    let assignedToday: { title: string }[] = [];
    try {
      const tSnap = await db.collection(COLLECTIONS.TASKS)
        .where('assigneeUserIds', 'array-contains', u.uid)
        .where('dueDate', '==', today)
        .limit(20).get();
      assignedToday = tSnap.docs
        .map((d) => d.data() as any)
        .filter((t) => t.status !== 'done' && t.status !== 'cancelled' && t.status !== 'rejected')
        .map((t) => ({ title: t.title }));
    } catch { /* index có thể chưa build → bỏ qua */ }

    const total = personalToday.length + assignedToday.length;
    if (total === 0) continue;

    const firstName = u.displayName.split(' ').slice(-1)[0] || 'bạn';

    const lines: string[] = [];
    personalToday.slice(0, 3).forEach((t) =>
      lines.push(t.scheduledTime ? `${t.scheduledTime} ${t.title}` : t.title));
    if (lines.length < 3) {
      assignedToday.slice(0, 3 - lines.length).forEach((t) => lines.push('📋 ' + t.title));
    }
    const more = total > lines.length ? ` (+${total - lines.length} khác)` : '';

    const message = {
      notification: {
        title: `☀️ Chào buổi sáng, ${firstName}!`,
        body: `${total} việc hôm nay: ${lines.join(' · ')}${more}. Có 1 ngày năng suất nhé! 💪`,
      },
      webpush: {
        fcmOptions: { link: '/cong-viec-ca-nhan' },
        notification: {
          icon: '/icon-192.png', badge: '/icon-192.png',
          tag: `morning-${today}`, requireInteraction: false,
        },
      },
      data: { kind: 'morning-summary', date: today },
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
      console.error('[cron morning] sendEachForMulticast failed', u.uid, e?.message);
    }
  }

  // Cleanup invalid tokens
  for (const { uid, token } of tokensToRemove) {
    try {
      await db.collection(COLLECTIONS.USERS).doc(uid).update({
        fcmTokens: FieldValue.arrayRemove(token),
      });
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent: totalSent,
    tokensCleaned: tokensToRemove.length,
    today,
  });
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, info: 'send-morning-summary cron endpoint' });
}
