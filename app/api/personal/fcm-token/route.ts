// POST   /api/personal/fcm-token  body: { token }  → register device token
// DELETE /api/personal/fcm-token  body: { token }  → unregister (signout / disable)
//
// PRIVACY: chỉ owner. Token lưu vào users/{uid}.fcmTokens[] (array, multi-device).

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token || token.length < 20 || token.length > 1024) {
    return NextResponse.json({ error: 'Token không hợp lệ' }, { status: 400 });
  }

  try {
    const db = getFirebaseAdminDb();
    await db.collection(COLLECTIONS.USERS).doc(ctx.profile.id).update({
      fcmTokens: FieldValue.arrayUnion(token),
      fcmTokensUpdatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[fcm-token POST]', e?.message);
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
    await db.collection(COLLECTIONS.USERS).doc(ctx.profile.id).update({
      fcmTokens: FieldValue.arrayRemove(token),
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[fcm-token DELETE]', e?.message);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
