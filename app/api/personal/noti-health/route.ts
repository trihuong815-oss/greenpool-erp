// GET /api/personal/noti-health
//
// Phase PWA-Stability (2026-06-09): trả về tình trạng noti subscription của user
// để client hiển thị banner cảnh báo nếu unhealthy.
//
// Logic:
//   - healthy: có ít nhất 1 device có lastSeen < 12h ago + enabled
//   - warning: device có nhưng lastSeen 12-72h ago → khả năng SW chết
//   - critical: không có device active hoặc lastSeen > 72h ago
//   - none: chưa từng register noti

import { NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';

type HealthStatus = 'healthy' | 'warning' | 'critical' | 'none';

const FRESH_THRESHOLD_MS = 12 * 60 * 60_000;     // 12h
const STALE_THRESHOLD_MS = 72 * 60 * 60_000;     // 72h

export async function GET() {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  try {
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.USERS).doc(ctx.profile.id).get();
    const data = snap.data();
    const devices: any[] = Array.isArray(data?.fcmDevices) ? data!.fcmDevices : [];
    const enabledDevices = devices.filter((d) => d?.enabled !== false && typeof d?.token === 'string');

    if (enabledDevices.length === 0) {
      return NextResponse.json({
        status: 'none' as HealthStatus,
        message: 'Chưa bật thông báo trên thiết bị nào.',
        action: 'enable',
      });
    }

    const now = Date.now();
    let freshestLastSeen = 0;
    for (const d of enabledDevices) {
      const ls = typeof d.lastSeen === 'number' ? d.lastSeen : 0;
      if (ls > freshestLastSeen) freshestLastSeen = ls;
    }
    const ageMs = now - freshestLastSeen;

    let status: HealthStatus;
    let message: string;
    let action: 'none' | 'enable' | 'refresh';

    if (freshestLastSeen === 0 || ageMs > STALE_THRESHOLD_MS) {
      status = 'critical';
      message = `Đã ${Math.round(ageMs / (24 * 60 * 60_000))} ngày không ping — thông báo có thể không tới. Hãy mở app và bấm "Bật thông báo" lại.`;
      action = 'refresh';
    } else if (ageMs > FRESH_THRESHOLD_MS) {
      status = 'warning';
      message = `Thiết bị đã idle ${Math.round(ageMs / (60 * 60_000))} giờ. Sẽ tự ping khi anh focus app.`;
      action = 'none';
    } else {
      status = 'healthy';
      message = `Hoạt động bình thường. ${enabledDevices.length} thiết bị đã bật.`;
      action = 'none';
    }

    return NextResponse.json({
      status,
      message,
      action,
      devices: enabledDevices.length,
      freshestAgeMs: ageMs,
    });
  } catch (e: any) {
    console.error('[noti-health]', e?.message);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
