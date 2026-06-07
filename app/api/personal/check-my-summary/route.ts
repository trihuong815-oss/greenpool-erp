// POST /api/personal/check-my-summary?kind=morning|evening
// User-triggered: khi mở app, client gọi để check + gửi morning/evening summary
// nếu chưa nhận hôm nay. Đây là FALLBACK cho cron không đáng tin (GitHub Actions delay).
//
// Dedup: lưu log gửi vào users/{uid}.summarySentLog = { [date_kind]: timestamp }
// → mỗi user × ngày × kind chỉ gửi 1 lần (cron hoặc client trigger — bên nào tới trước).

import { NextRequest, NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdmin, getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { extractFcmTokens, cleanupInvalidFcmTokens } from '@/lib/firebase/fcm-tokens';

export const maxDuration = 30;

function dateStrVN(): string {
  // "Hôm nay" theo VN tz (GMT+7)
  const nowVN = new Date(Date.now() + 7 * 60 * 60_000);
  return `${nowVN.getUTCFullYear()}-${String(nowVN.getUTCMonth() + 1).padStart(2, '0')}-${String(nowVN.getUTCDate()).padStart(2, '0')}`;
}

function tomorrowStrVN(): string {
  const nowVN = new Date(Date.now() + 7 * 60 * 60_000);
  nowVN.setUTCDate(nowVN.getUTCDate() + 1);
  return `${nowVN.getUTCFullYear()}-${String(nowVN.getUTCMonth() + 1).padStart(2, '0')}-${String(nowVN.getUTCDate()).padStart(2, '0')}`;
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const kind = req.nextUrl.searchParams.get('kind');
  if (kind !== 'morning' && kind !== 'evening') {
    return NextResponse.json({ error: 'kind phải morning hoặc evening' }, { status: 400 });
  }

  // Check time window theo VN tz
  const nowVN = new Date(Date.now() + 7 * 60 * 60_000);
  const hourVN = nowVN.getUTCHours();
  if (kind === 'morning' && (hourVN < 7 || hourVN >= 12)) {
    return NextResponse.json({ ok: true, skipped: 'out-of-window', windowVN: '7-12h' });
  }
  if (kind === 'evening' && (hourVN < 20 || hourVN >= 24)) {
    return NextResponse.json({ ok: true, skipped: 'out-of-window', windowVN: '20-24h' });
  }

  const db = getFirebaseAdminDb();
  const today = dateStrVN();
  const dedupKey = `${today}_${kind}`;

  // Atomic claim: nếu chưa gửi hôm nay → claim. Tránh race với cron.
  const userRef = db.collection(COLLECTIONS.USERS).doc(ctx.profile.id);
  let claimed = false;
  try {
    await db.runTransaction(async (txn) => {
      const s = await txn.get(userRef);
      if (!s.exists) return;
      const log = (s.data()?.summarySentLog ?? {}) as Record<string, unknown>;
      if (log[dedupKey]) return; // đã gửi rồi
      log[dedupKey] = new Date().toISOString();
      // Giữ tối đa 30 entry gần nhất (rolling)
      const keys = Object.keys(log).sort();
      if (keys.length > 30) {
        for (const k of keys.slice(0, keys.length - 30)) delete log[k];
      }
      txn.update(userRef, { summarySentLog: log });
      claimed = true;
    });
  } catch { return NextResponse.json({ ok: true, error: 'tx-failed' }); }

  if (!claimed) return NextResponse.json({ ok: true, alreadySent: true });

  // Get tokens
  const userSnap = await userRef.get();
  const tokens: string[] = extractFcmTokens(userSnap.data());
  if (tokens.length === 0) return NextResponse.json({ ok: true, msg: 'No tokens' });

  // Tasks today (morning) hoặc tomorrow (evening)
  const targetDate = kind === 'morning' ? today : tomorrowStrVN();
  const personalSnap = await db.collection(COLLECTIONS.PERSONAL_TASKS)
    .where('ownerId', '==', ctx.profile.id)
    .where('dueDate', '==', targetDate)
    .limit(20).get();
  const tasksDate = personalSnap.docs
    .map((d) => d.data() as { title: string; status: string; scheduledTime?: string | null })
    .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
    .sort((a, b) => (a.scheduledTime ?? '99:99').localeCompare(b.scheduledTime ?? '99:99'));

  const firstName = (ctx.profile.displayName ?? '').split(' ').slice(-1)[0] || 'bạn';
  const taskList = tasksDate.slice(0, 3).map((t) =>
    t.scheduledTime ? `${t.scheduledTime} ${t.title}` : t.title
  ).join(' · ');
  const more = tasksDate.length > 3 ? ` (+${tasksDate.length - 3} việc)` : '';

  let title: string, body: string, link: string;
  if (kind === 'morning') {
    title = `☀️ Chào buổi sáng, ${firstName}!`;
    body = tasksDate.length > 0
      ? `${tasksDate.length} việc hôm nay: ${taskList}${more}. Có 1 ngày năng suất nhé! 💪`
      : `Hôm nay chưa có việc lên lịch — chúc 1 ngày làm việc hiệu quả nhé! 💪`;
    link = '/cong-viec-ca-nhan';
  } else {
    title = `🌙 Chào buổi tối, ${firstName}!`;
    body = tasksDate.length > 0
      ? `${tasksDate.length} việc cho ngày mai: ${taskList}${more}. Hãy nghỉ ngơi thật khoẻ nhé! 💚`
      : `Ngày mai chưa có việc lên lịch — hãy nghỉ ngơi thật khoẻ cho ngày mai tuyệt vời nhé! 💚`;
    link = '/cong-viec-ca-nhan';
  }

  getFirebaseAdmin();
  const messaging = getMessaging();
  const tokensToRemove: string[] = [];
  try {
    const res = await messaging.sendEachForMulticast({
      notification: { title, body },
      webpush: {
        fcmOptions: { link },
        notification: { icon: '/icon-192.png', badge: '/icon-192.png', tag: `${kind}-${today}` },
      },
      data: { kind: `${kind}-summary`, date: targetDate },
      tokens,
    });
    res.responses.forEach((r, i) => {
      if (!r.success && r.error?.code?.includes('not-registered')) tokensToRemove.push(tokens[i]);
    });
    if (tokensToRemove.length > 0) {
      await cleanupInvalidFcmTokens(db, ctx.profile.id, tokensToRemove);
    }
    return NextResponse.json({ ok: true, sent: res.successCount, tasksCount: tasksDate.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown' });
  }
}
