// POST /api/cron/action-required-stuck
// V6.5 Phase B (2026-06-14): Resend noti cho action_required >24h chưa xử lý.
//
// Lý do: user có thể bỏ lỡ noti đầu tiên (push delivery fail, idle, low power).
// Cron quét notifications collection, nếu task vẫn pending → resend qua engine.
//
// Logic:
//   1. Query notifications where isActionRequired=true AND actionStatus='pending'
//      AND createdAt < (now - 24h)
//   2. Filter trong code: skip nếu lastResentAt < now - 24h (cooldown 1 lần/ngày)
//   3. Resend qua engine với pushPayloadSnapshot có sẵn
//   4. Update lastResentAt + resendCount
//   5. Sau 3 lần resend (3 ngày) → ngừng (tránh spam, lưu vào dismissed)
//
// Trigger: GitHub Actions cron hourly.
// Auth: Bearer CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export const maxDuration = 60;

const STUCK_THRESHOLD_MS = 24 * 60 * 60_000;
const RESEND_COOLDOWN_MS = 24 * 60 * 60_000;
const MAX_RESEND = 3;
const QUERY_LIMIT = 500;

function parseDate(v: any): number | null {
  if (!v) return null;
  if (typeof v === 'string') { const t = Date.parse(v); return isFinite(t) ? t : null; }
  if (v?.toMillis) return v.toMillis();
  if (v?.seconds) return v.seconds * 1000;
  return null;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || auth.length !== expected.length ||
      !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getFirebaseAdminDb();
  const now = Date.now();
  const cutoff = new Date(now - STUCK_THRESHOLD_MS);

  try {
    const snap = await db.collection(COLLECTIONS.NOTIFICATIONS)
      .where('isActionRequired', '==', true)
      .where('actionStatus', '==', 'pending')
      .where('createdAt', '<=', cutoff)
      .limit(QUERY_LIMIT)
      .get();

    let resent = 0, skipCooldown = 0, exhausted = 0;
    for (const doc of snap.docs) {
      const n = doc.data();
      const resendCount = typeof n.resendCount === 'number' ? n.resendCount : 0;
      if (resendCount >= MAX_RESEND) { exhausted++; continue; }

      const lastResentMs = parseDate(n.lastResentAt);
      if (lastResentMs && now - lastResentMs < RESEND_COOLDOWN_MS) { skipCooldown++; continue; }

      const snapshot = n.pushPayloadSnapshot;
      if (!snapshot || typeof snapshot.title !== 'string' || !n.userId || !n.entityId || !n.module) continue;

      const ageHrs = Math.round((now - parseDate(n.createdAt)!) / 3600_000);
      await sendNotificationEvent({
        type: n.type,
        module: n.module,
        entityId: n.entityId,
        entityCode: n.entityCode,
        title: `🔁 ${snapshot.title}`,
        message: `[Nhắc lại ${ageHrs}h] ${snapshot.body}`,
        linkUrl: snapshot.link,
        recipients: [n.userId],
        priority: 'high',
        pushTag: `resend-${doc.id}`,
        pushData: { resendCount: String(resendCount + 1), origNotiId: doc.id },
        // Email backup auto cho action_required → cron stuck cũng kèm email
        channels: { inApp: true, push: true, email: true },
      });

      await doc.ref.update({
        lastResentAt: new Date(now),
        resendCount: resendCount + 1,
      });
      resent++;
    }

    await writeAuditLog({
      action: 'cron_action_required_stuck',
      module: 'giaoviec',
      userId: 'cron',
      branchId: null,
      before: null,
      after: { scanned: snap.size, resent, skipCooldown, exhausted },
      actorName: 'cron',
      actorRole: 'system',
      source: 'cron',
    }).catch(() => {});

    return NextResponse.json({ ok: true, scanned: snap.size, resent, skipCooldown, exhausted });
  } catch (e: any) {
    console.error('[action-required-stuck]', e?.message);
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 });
  }
}
