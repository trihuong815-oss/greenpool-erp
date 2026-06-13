// V6.4 P2 (2026-06-13): POST /api/notifications/mark-all-read
// Body optional: { module?: 'proposal' | 'dispatch' } — chỉ mark module cụ thể nếu có.
// Mark tất cả notification UNREAD của user → isRead=true + readAt=now.
// KHÔNG đổi actionStatus (giữ pending để vẫn vào badge "Cần xử lý" nếu user chưa thực sự xử lý).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json().catch(() => ({}));
    const moduleParam: string | undefined = typeof body?.module === 'string' ? body.module : undefined;

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.NOTIFICATIONS)
      .where('userId', '==', caller.profile.uid)
      .where('isRead', '==', false);
    if (moduleParam === 'proposal' || moduleParam === 'dispatch') {
      q = q.where('module', '==', moduleParam);
    }
    // Limit 500 để tránh batch quá lớn — nếu user có >500 noti chưa đọc thì cũng đủ cleanup 1 lần.
    const snap = await q.limit(500).get();
    if (snap.empty) return NextResponse.json({ ok: true, updated: 0 });

    const batch = db.batch();
    const now = new Date();
    snap.docs.forEach((d) => batch.update(d.ref, { isRead: true, readAt: now }));
    await batch.commit();

    return NextResponse.json({ ok: true, updated: snap.size });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[POST /api/notifications/mark-all-read]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
