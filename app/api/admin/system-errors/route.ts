// GET /api/admin/system-errors — list lỗi (ADMIN only).
// PATCH /api/admin/system-errors  body: { id, handled: boolean } — đánh dấu đã xử lý.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';

const MAX_LIMIT = 100;

function isAdminUser(roleCode: string): boolean {
  return roleCode === 'ADMIN';
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  if (!isAdminUser(ctx.profile.roleCode)) {
    return NextResponse.json({ error: 'Chỉ ADMIN xem được' }, { status: 403 });
  }
  const qs = req.nextUrl.searchParams;
  const onlyUnhandled = qs.get('handled') !== 'true';
  const limit = Math.min(Number(qs.get('limit') ?? 50) || 50, MAX_LIMIT);

  const db = getFirebaseAdminDb();
  let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.SYSTEM_ERRORS);
  if (onlyUnhandled) q = q.where('handled', '==', false);
  q = q.orderBy('createdAt', 'desc').limit(limit);

  const snap = await q.get();
  const rows = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      source: x.source ?? '',
      message: x.message ?? '',
      severity: x.severity ?? 'error',
      stack: x.stack ?? null,
      userId: x.userId ?? null,
      branchId: x.branchId ?? null,
      context: x.context ?? null,
      createdAt: x.createdAt?.toDate?.()?.toISOString() ?? null,
      handled: !!x.handled,
      handledBy: x.handledBy ?? null,
      handledAt: x.handledAt?.toDate?.()?.toISOString() ?? null,
    };
  });
  return NextResponse.json({ rows });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  if (!isAdminUser(ctx.profile.roleCode)) {
    return NextResponse.json({ error: 'Chỉ ADMIN' }, { status: 403 });
  }
  const body = await req.json();
  const id = String(body?.id ?? '');
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
  const handled = !!body?.handled;
  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTIONS.SYSTEM_ERRORS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
  await ref.update({
    handled,
    handledBy: handled ? ctx.profile.id : null,
    handledAt: handled ? new Date() : null,
  });
  return NextResponse.json({ ok: true });
}
