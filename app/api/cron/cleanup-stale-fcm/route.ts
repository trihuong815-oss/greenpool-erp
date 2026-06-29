// POST /api/cron/cleanup-stale-fcm
// V6.5 (2026-06-14): Tự xóa fcmDevices có lastSeen > 7 ngày khỏi users docs.
// Lý do: token cũ tích tụ → push lãng phí + có thể ăn quota Firebase / Resend.
//        Anh login lại tự re-register token mới → không mất gì.
//
// Trigger: GitHub Actions daily 03:00 UTC = 10:00 VN.
// Auth: Bearer CRON_SECRET (giống các cron khác).

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export const maxDuration = 60;

const STALE_MS = 7 * 24 * 60 * 60_000; // 7 ngày

// PR-CRON-LIMIT-USERS (2026-06-30): Hard cap user scan per run.
// Hiện ~50 users prod; cap 500 = 10x headroom đến 300+ users.
// Khi snap.size === USER_SCAN_HARD_LIMIT → truncated=true trong response +
// warn vào Cloud Run logs. Pagination cursor continuation defer khi org thực sự
// chạm cap (xem TODO bên dưới).
const USER_SCAN_HARD_LIMIT = 500;

export async function POST(req: NextRequest) {
  // Auth bearer CRON_SECRET — constant-time compare
  const auth = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || auth.length !== expected.length ||
      !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getFirebaseAdminDb();
  const cutoff = Date.now() - STALE_MS;

  let scanned = 0, usersWithStale = 0, devicesRemoved = 0;
  try {
    // PR-CRON-LIMIT-USERS (2026-06-30): bounded read.
    // TODO khi user count chạm USER_SCAN_HARD_LIMIT: wrap thành loop với
    // .orderBy('__name__').startAfter(lastDoc) cursor để xử lý nhiều batch
    // tuần tự trong 1 run. Tránh full-scan unintended khi org lớn.
    const snap = await db.collection(COLLECTIONS.USERS)
      .where('status', '==', 'active')
      .limit(USER_SCAN_HARD_LIMIT)
      .get();
    const truncated = snap.size >= USER_SCAN_HARD_LIMIT;
    if (truncated) {
      console.warn(
        '[cleanup-stale-fcm] reached USER_SCAN_HARD_LIMIT=' + USER_SCAN_HARD_LIMIT
        + ' — some active users not scanned this run. Implement cursor pagination soon.',
      );
    }

    for (const doc of snap.docs) {
      scanned++;
      const data = doc.data() as any;
      const devices: any[] = Array.isArray(data?.fcmDevices) ? data.fcmDevices : [];
      if (devices.length === 0) continue;

      const fresh = devices.filter((d) => {
        const ls = typeof d?.lastSeen === 'number' ? d.lastSeen : 0;
        return ls >= cutoff;
      });
      const removed = devices.length - fresh.length;
      if (removed === 0) continue;

      usersWithStale++;
      devicesRemoved += removed;
      await doc.ref.update({ fcmDevices: fresh, updatedAt: new Date() });
    }

    await writeAuditLog({
      action: 'cleanup_stale_fcm',
      module: 'users',
      userId: 'cron',
      branchId: null,
      before: null,
      after: { scanned, usersWithStale, devicesRemoved, staleDays: 7, truncated, scanLimit: USER_SCAN_HARD_LIMIT },
      actorName: 'cron',
      actorRole: 'system',
      source: 'cron',
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      scanned,
      usersWithStale,
      devicesRemoved,
      truncated,
      scanLimit: USER_SCAN_HARD_LIMIT,
      message: `Đã xóa ${devicesRemoved} token stale từ ${usersWithStale}/${scanned} user`,
    });
  } catch (e: any) {
    console.error('[cleanup-stale-fcm]', e?.message);
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 });
  }
}
