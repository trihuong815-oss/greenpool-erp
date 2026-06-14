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
    const snap = await db.collection(COLLECTIONS.USERS)
      .where('status', '==', 'active')
      .get();

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
      after: { scanned, usersWithStale, devicesRemoved, staleDays: 7 },
      actorName: 'cron',
      actorRole: 'system',
      source: 'cron',
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      scanned,
      usersWithStale,
      devicesRemoved,
      message: `Đã xóa ${devicesRemoved} token stale từ ${usersWithStale}/${scanned} user`,
    });
  } catch (e: any) {
    console.error('[cleanup-stale-fcm]', e?.message);
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 });
  }
}
