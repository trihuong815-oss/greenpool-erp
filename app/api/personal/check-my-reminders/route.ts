// POST /api/personal/check-my-reminders
// Khi user mở app/cong-viec-ca-nhan → trigger check reminders của CHÍNH MÌNH ngay.
// Bypass GitHub Actions cron delay (có thể delay 10-30 phút trên free tier).
//
// Auth: user session (không cần CRON_SECRET).
// Scope: chỉ check tasks của caller — không thể trigger cho user khác.

import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdmin, getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export async function POST() {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const db = getFirebaseAdminDb();
  const now = new Date();
  const nowIso = now.toISOString();

  // Tasks của caller có reminderAt ≤ now, chưa sent, chưa done/cancelled
  const snap = await db.collection(COLLECTIONS.PERSONAL_TASKS)
    .where('ownerId', '==', ctx.profile.id)
    .where('reminderAt', '<=', nowIso)
    .where('reminderAt', '>', new Date(now.getTime() - 6 * 60 * 60_000).toISOString())  // window 6h
    .limit(50)
    .get();

  const pending = snap.docs
    .map((d) => ({ id: d.id, data: d.data() as any }))
    .filter((t) => t.data.reminderSent !== true && t.data.status !== 'done' && t.data.status !== 'cancelled');

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, pending: 0 });
  }

  // Get user tokens
  const userSnap = await db.collection(COLLECTIONS.USERS).doc(ctx.profile.id).get();
  const tokens: string[] = (userSnap.data()?.fcmTokens ?? []).filter((t: any) => typeof t === 'string');
  if (tokens.length === 0) {
    // Vẫn mark sent để không loop check
    const batch = db.batch();
    pending.forEach((t) => batch.update(db.collection(COLLECTIONS.PERSONAL_TASKS).doc(t.id), {
      reminderSent: true, reminderSentAt: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    return NextResponse.json({ ok: true, sent: 0, pending: pending.length, msg: 'No tokens' });
  }

  getFirebaseAdmin();
  const messaging = getMessaging();
  let sent = 0;
  const tokensToRemove: string[] = [];

  for (const t of pending) {
    // Atomic claim: mark reminderSent trước khi push, tránh race với cron.
    // Nếu task đã sent bởi process khác → skip.
    let claimed = false;
    try {
      await db.runTransaction(async (txn) => {
        const ref = db.collection(COLLECTIONS.PERSONAL_TASKS).doc(t.id);
        const s = await txn.get(ref);
        if (!s.exists) return;
        if (s.data()?.reminderSent === true) return;
        txn.update(ref, { reminderSent: true, reminderSentAt: FieldValue.serverTimestamp() });
        claimed = true;
      });
    } catch { continue; }
    if (!claimed) continue;

    const timeLabel = t.data.scheduledTime ? ` lúc ${t.data.scheduledTime}` : '';
    try {
      const res = await messaging.sendEachForMulticast({
        notification: {
          title: `🔔 ${t.data.title}`,
          body: `Còn ~1 tiếng nữa${timeLabel}`,
        },
        webpush: {
          fcmOptions: { link: '/cong-viec-ca-nhan' },
          notification: { icon: '/icon-192.png', tag: t.id, requireInteraction: false },
        },
        data: { taskId: t.id, kind: 'reminder' },
        tokens,
      });
      sent += res.successCount;
      res.responses.forEach((r, i) => {
        if (!r.success && r.error?.code?.includes('not-registered')) tokensToRemove.push(tokens[i]);
      });
    } catch (e: any) {
      console.warn('[check-my-reminders]', t.id, e?.message);
    }
  }

  // Cleanup invalid tokens (atomic per token via arrayRemove)
  if (tokensToRemove.length > 0) {
    try {
      await db.collection(COLLECTIONS.USERS).doc(ctx.profile.id).update({
        fcmTokens: FieldValue.arrayRemove(...tokensToRemove),
      });
    } catch { /* ignore */ }
  }

  return NextResponse.json({ ok: true, sent, pending: pending.length, tokensCleaned: tokensToRemove.length });
}
