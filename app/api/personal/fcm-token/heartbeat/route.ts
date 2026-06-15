// POST /api/personal/fcm-token/heartbeat
// Body: { token: string }
//
// Phase PWA-Stability (2026-06-09): client gọi định kỳ (6h) + khi tab visible
// để cập nhật `lastSeen` của device. Mục đích:
// - Báo cho server biết device vẫn còn online → KHÔNG cleanup token này.
// - Health check: client KHÔNG ping → admin biết device dead/SW killed.
//
// Khác POST /api/personal/fcm-token (register): heartbeat KHÔNG tạo device mới,
// chỉ update lastSeen. Nếu token không tồn tại trong fcmDevices → 404 → client
// sẽ trigger re-register.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token || token.length < 20) {
    return NextResponse.json({ error: 'Token không hợp lệ' }, { status: 400 });
  }

  try {
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.USERS).doc(ctx.profile.id);
    const now = Date.now();
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const devices: any[] = Array.isArray(snap.data()?.fcmDevices) ? snap.data()!.fcmDevices : [];
      const idx = devices.findIndex((d) => d?.token === token);
      if (idx < 0) return { found: false, disabled: false };
      // V6.5 Noti Audit Phase A.3 (2026-06-15) — Issue 3.1: nếu user đã tắt device
      // (enabled=false) → KHÔNG update lastSeen. Trước đây vẫn update → device được
      // coi "fresh" → push vẫn gửi → mâu thuẫn user intent.
      // → Trả 410 Gone cho client biết device đang tắt, không re-register tự động.
      if (devices[idx]?.enabled === false) {
        return { found: true, disabled: true, deviceLabel: devices[idx]?.label ?? null };
      }
      const updated = [...devices];
      updated[idx] = { ...updated[idx], lastSeen: now };
      tx.update(ref, { fcmDevices: updated });
      return { found: true, disabled: false, deviceLabel: devices[idx]?.label ?? null };
    });
    if (!result.found) {
      return NextResponse.json({ error: 'Token không có trong fcmDevices — cần re-register' }, { status: 404 });
    }
    if (result.disabled) {
      return NextResponse.json({
        error: 'Device đã bị tắt — bật lại ở /bao-mat để nhận thông báo',
        deviceDisabled: true,
        label: result.deviceLabel,
      }, { status: 410 });
    }
    return NextResponse.json({ ok: true, label: result.deviceLabel });
  } catch (e: any) {
    console.error('[fcm-token heartbeat]', e?.message);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
