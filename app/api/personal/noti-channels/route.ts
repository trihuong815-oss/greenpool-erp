// GET/PUT /api/personal/noti-channels
// V6.5 Phase B (2026-06-14): User tự cấu hình kênh nhận noti per module.
//
// Schema users.notificationChannels (root-level):
//   {
//     proposal: { inApp: true, push: true, email: true },
//     dispatch: { inApp: true, push: true, email: true },
//     system:   { inApp: true, push: true, email: false },
//   }
//
// Mặc định nếu chưa set: tất cả true (đảm bảo user mới luôn nhận).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';

const VALID_MODULES = ['proposal', 'dispatch', 'system'] as const;
type ModuleKey = typeof VALID_MODULES[number];

const DEFAULT_CHANNELS = {
  proposal: { inApp: true, push: true, email: true },
  dispatch: { inApp: true, push: true, email: true },
  system:   { inApp: true, push: true, email: false },
};

export async function GET() {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.USERS).doc(ctx.profile.id).get();
    const data = snap.data();
    const channels = (data?.notificationChannels && typeof data.notificationChannels === 'object')
      ? data.notificationChannels
      : DEFAULT_CHANNELS;
    return NextResponse.json({ channels, default: DEFAULT_CHANNELS });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body JSON sai' }, { status: 400 }); }
  const input = body?.channels;
  if (!input || typeof input !== 'object') {
    return NextResponse.json({ error: 'channels: object required' }, { status: 400 });
  }

  // Validate & sanitize — chỉ giữ keys hợp lệ
  const cleaned: Record<string, { inApp: boolean; push: boolean; email: boolean }> = {};
  for (const k of VALID_MODULES) {
    const v = input[k];
    if (!v || typeof v !== 'object') {
      cleaned[k] = DEFAULT_CHANNELS[k];
      continue;
    }
    cleaned[k] = {
      inApp: v.inApp !== false, // default true
      push: v.push !== false,
      email: v.email === true,  // default false vì giới hạn Gmail 500/ngày
    };
  }

  try {
    const db = getFirebaseAdminDb();
    await db.collection(COLLECTIONS.USERS).doc(ctx.profile.id).update({
      notificationChannels: cleaned,
      updatedAt: new Date(),
    });
    return NextResponse.json({ ok: true, channels: cleaned });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
