// GET   /api/checklist-v2/notifications?days=7&onlyUnseen=1
//       → list các notification submission mà caller là cấp trên.
// PATCH /api/checklist-v2/notifications?id=<notiId>  body: { seen: true }
//       → mark caller đã xem (push uid vào seenBy[]).
//
// Scope:
//  - ADMIN/CEO/GD_KD → thấy tất cả (QLCS + PP_HT + PP_XLN)
//  - GD_VP           → chỉ QLCS
//  - TP_KT           → chỉ PP_HT + PP_XLN
//  - Khác            → 403

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { checklistV2SupervisorScope, type ChecklistRole } from '@/lib/checklist-v2/templates';

function serialize(id: string, d: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === 'object' && typeof (v as any).toDate === 'function') {
      out[k] = (v as any).toDate().toISOString();
    } else out[k] = v;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const scope = checklistV2SupervisorScope(ctx.profile.roleCode);
  if (!scope || scope.length === 0) {
    return NextResponse.json({ error: 'Bạn không phải cấp trên trong checklist v2' }, { status: 403 });
  }

  const qs = req.nextUrl.searchParams;
  const daysRaw = Number(qs.get('days') ?? '7');
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 30 ? Math.floor(daysRaw) : 7;
  const onlyUnseen = qs.get('onlyUnseen') === '1';

  const since = new Date();
  since.setDate(since.getDate() - days);

  const db = getFirebaseAdminDb();
  // Firestore `in` chấp nhận tối đa 30 phần tử — scope max 3 → an toàn.
  // Compound: role in scope + submittedAt >= since, order by submittedAt desc.
  const snap = await db
    .collection(COLLECTIONS.CHECKLIST_NOTIFICATIONS_V2)
    .where('role', 'in', scope as ChecklistRole[])
    .where('submittedAt', '>=', since)
    .orderBy('submittedAt', 'desc')
    .limit(200)
    .get();

  let items = snap.docs.map((doc) => serialize(doc.id, doc.data()));
  if (onlyUnseen) {
    items = items.filter((n) => !Array.isArray(n.seenBy) || !n.seenBy.includes(ctx.profile.id));
  }

  return NextResponse.json({ notifications: items, scope });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const scope = checklistV2SupervisorScope(ctx.profile.roleCode);
  if (!scope || scope.length === 0) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || body.seen !== true) {
    return NextResponse.json({ error: 'Body phải { seen: true }' }, { status: 400 });
  }

  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTIONS.CHECKLIST_NOTIFICATIONS_V2).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy notification' }, { status: 404 });

  const cur = snap.data() as { role: ChecklistRole; seenBy?: string[] };
  // Chỉ supervisor in-scope mới mark seen
  if (!scope.includes(cur.role)) {
    return NextResponse.json({ error: 'Không thuộc scope của bạn' }, { status: 403 });
  }
  // arrayUnion → idempotent + tránh race condition khi nhiều supervisor mark cùng lúc
  await ref.update({ seenBy: FieldValue.arrayUnion(ctx.profile.id) });

  return NextResponse.json({ ok: true });
}
