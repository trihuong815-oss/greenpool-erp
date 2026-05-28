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
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin, getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization');
  if (!auth) return false;
  return auth.replace(/^Bearer\s+/i, '').trim() === expected;
}

function tomorrowDateStr(): string {
  // 20:00 Vietnam = 13:00 UTC. Ngày mai (theo VN) = ngày của (now + 1 ngày, theo VN tz).
  // Easy: lấy ngày hiện tại UTC + 1 (vì 13 UTC = 20 VN, cùng ngày VN). Output YYYY-MM-DD.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  for (const u of candidates) {
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

    // Skip nếu không có task ngày mai (tránh spam)
    if (tomorrowTasks.length === 0) continue;

    const firstName = u.displayName.split(' ').slice(-1)[0] || 'bạn';
    const taskList = tomorrowTasks.slice(0, 3).map((t) =>
      t.scheduledTime ? `${t.scheduledTime} ${t.title}` : t.title
    ).join(' · ');
    const more = tomorrowTasks.length > 3 ? ` (+${tomorrowTasks.length - 3} việc)` : '';

    const message = {
      notification: {
        title: `🌙 Chào buổi tối, ${firstName}!`,
        body: `${tomorrowTasks.length} việc cho ngày mai: ${taskList}${more}. Hãy nghỉ ngơi thật khoẻ nhé! 💚`,
      },
      webpush: {
        fcmOptions: { link: '/cong-viec-ca-nhan' },
        notification: {
          icon: '/logo.png',
          badge: '/logo.png',
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
    tomorrow,
  });
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, info: 'send-evening-summary cron endpoint' });
}
