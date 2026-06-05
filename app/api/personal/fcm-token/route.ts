// GET    /api/personal/fcm-token  → { count, hasAny, devices: [{token, userAgent, label, createdAt, lastSeen}] }
// POST   /api/personal/fcm-token  body: { token, userAgent? }  → register/update device
// DELETE /api/personal/fcm-token  body: { token }  → unregister device
//
// PRIVACY: chỉ owner.
//
// Phase 13.8 (2026-06-05): schema mới `fcmDevices: Array<{token, userAgent, label, createdAt, lastSeen}>`
// để hiện list thiết bị đã bật cho user. Backward compat: vẫn duy trì `fcmTokens: string[]` (legacy)
// để server push-notifications.ts hoạt động bình thường — cleanup logic không bị phá.

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

interface DeviceMeta {
  token: string;
  userAgent: string;
  label: string;
  createdAt: number; // ms epoch
  lastSeen: number;  // ms epoch
  enabled: boolean;  // Phase 13.9.2 (2026-06-05): on/off toggle — false = tạm tắt, không nhận noti
}

// Parse userAgent → label friendly (ngắn gọn)
function parseUserAgentLabel(ua: string): string {
  if (!ua) return 'Thiết bị không xác định';
  const u = ua.toLowerCase();
  // OS
  let os = '?';
  if (u.includes('iphone') || u.includes('ipad')) os = 'iPhone/iPad';
  else if (u.includes('mac os')) os = 'MacBook';
  else if (u.includes('android')) os = 'Android';
  else if (u.includes('windows')) os = 'Windows';
  else if (u.includes('linux')) os = 'Linux';
  // Browser
  let browser = '?';
  if (u.includes('edg/')) browser = 'Edge';
  else if (u.includes('chrome/')) browser = 'Chrome';
  else if (u.includes('safari/')) browser = 'Safari';
  else if (u.includes('firefox/')) browser = 'Firefox';
  // PWA?
  const pwa = u.includes('standalone') || u.includes('pwa') ? ' (PWA)' : '';
  return `${os} · ${browser}${pwa}`;
}

export async function GET() {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.USERS).doc(ctx.profile.id).get();
    const x = snap.data();
    const devicesRaw: unknown = x?.fcmDevices;
    const legacyTokens: unknown = x?.fcmTokens;

    // Devices array mới (object)
    const devices: DeviceMeta[] = Array.isArray(devicesRaw)
      ? (devicesRaw as any[]).filter((d) => d && typeof d.token === 'string' && d.token.length > 20)
        .map((d) => ({
          token: d.token,
          userAgent: typeof d.userAgent === 'string' ? d.userAgent : '',
          label: typeof d.label === 'string' && d.label ? d.label : parseUserAgentLabel(d.userAgent ?? ''),
          createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
          lastSeen: typeof d.lastSeen === 'number' ? d.lastSeen : 0,
          enabled: d.enabled !== false, // default true cho doc cũ
        }))
      : [];

    // Legacy tokens (string) — convert hiển thị nếu chưa migrate qua devices
    if (Array.isArray(legacyTokens)) {
      const knownTokens = new Set(devices.map((d) => d.token));
      for (const t of legacyTokens as any[]) {
        if (typeof t === 'string' && t.length > 20 && !knownTokens.has(t)) {
          devices.push({
            token: t,
            userAgent: '',
            label: 'Thiết bị cũ (chưa rõ)',
            createdAt: 0,
            lastSeen: 0,
            enabled: true, // default cho legacy
          });
        }
      }
    }

    // Sort: mới nhất trước
    devices.sort((a, b) => (b.lastSeen || b.createdAt) - (a.lastSeen || a.createdAt));

    // Mask token để bảo mật (chỉ trả 8 ký tự đầu + cuối)
    const safeDevices = devices.map((d) => ({
      token: d.token, // giữ để DELETE/PATCH — UI sẽ không hiển thị
      tokenMask: d.token.slice(0, 6) + '...' + d.token.slice(-6),
      userAgent: d.userAgent,
      label: d.label,
      createdAt: d.createdAt,
      lastSeen: d.lastSeen,
      enabled: d.enabled,
    }));

    return NextResponse.json({ count: devices.length, hasAny: devices.length > 0, devices: safeDevices });
  } catch (e: any) {
    console.error('[fcm-token GET]', e?.message);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token || token.length < 20 || token.length > 1024) {
    return NextResponse.json({ error: 'Token không hợp lệ' }, { status: 400 });
  }
  const userAgent: string = typeof body?.userAgent === 'string' ? body.userAgent.slice(0, 500) : '';
  // Phase 13.9.1 (2026-06-05): user có thể tự đặt tên thiết bị
  const customLabel: string = typeof body?.label === 'string' ? body.label.trim().slice(0, 80) : '';
  const finalLabel = customLabel || parseUserAgentLabel(userAgent);

  try {
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.USERS).doc(ctx.profile.id);
    const snap = await ref.get();
    const now = Date.now();
    // Update fcmDevices array — remove existing entry với cùng token, add lại với fresh metadata
    const oldDevices: any[] = Array.isArray(snap.data()?.fcmDevices) ? snap.data()!.fcmDevices : [];
    const filtered = oldDevices.filter((d) => d?.token !== token);
    const existing = oldDevices.find((d) => d?.token === token);
    // Nếu re-register thiết bị cũ có label tùy chỉnh → giữ label cũ (không override bằng auto-parse)
    // Re-register cũng auto bật lại (enabled=true) — vì user vừa bấm "Bật thông báo".
    const device: DeviceMeta = {
      token,
      userAgent,
      label: customLabel || existing?.label || finalLabel,
      createdAt: existing?.createdAt ?? now,
      lastSeen: now,
      enabled: true,
    };
    await ref.update({
      fcmDevices: [...filtered, device],
      fcmTokens: FieldValue.arrayUnion(token), // legacy — giữ cho push-notifications.ts
      fcmTokensUpdatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[fcm-token POST]', e?.message);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

// Phase 13.9.1 (2026-06-05): PATCH /api/personal/fcm-token body: { token, label?, enabled? }
// User đổi tên thiết bị HOẶC toggle on/off (Phase 13.9.2). Chỉ update field truyền vào.
export async function PATCH(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const labelProvided = typeof body?.label === 'string';
  const enabledProvided = typeof body?.enabled === 'boolean';
  if (!token) return NextResponse.json({ error: 'Thiếu token' }, { status: 400 });
  if (!labelProvided && !enabledProvided) {
    return NextResponse.json({ error: 'Cần truyền label hoặc enabled' }, { status: 400 });
  }
  const label = labelProvided ? body.label.trim().slice(0, 80) : '';
  if (labelProvided && !label) {
    return NextResponse.json({ error: 'Tên thiết bị không được để trống' }, { status: 400 });
  }

  try {
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.USERS).doc(ctx.profile.id);
    const snap = await ref.get();
    const oldDevices: any[] = Array.isArray(snap.data()?.fcmDevices) ? snap.data()!.fcmDevices : [];
    const idx = oldDevices.findIndex((d) => d?.token === token);
    if (idx === -1) return NextResponse.json({ error: 'Thiết bị không tồn tại' }, { status: 404 });
    const updated = [...oldDevices];
    const patch: Record<string, any> = { lastSeen: Date.now() };
    if (labelProvided) patch.label = label;
    if (enabledProvided) patch.enabled = body.enabled;
    updated[idx] = { ...updated[idx], ...patch };
    await ref.update({ fcmDevices: updated });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[fcm-token PATCH]', e?.message);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) return NextResponse.json({ error: 'Thiếu token' }, { status: 400 });

  try {
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.USERS).doc(ctx.profile.id);
    const snap = await ref.get();
    const oldDevices: any[] = Array.isArray(snap.data()?.fcmDevices) ? snap.data()!.fcmDevices : [];
    const filtered = oldDevices.filter((d) => d?.token !== token);
    await ref.update({
      fcmDevices: filtered,
      fcmTokens: FieldValue.arrayRemove(token), // legacy
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[fcm-token DELETE]', e?.message);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
