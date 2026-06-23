// V6.4 P2 (2026-06-13): GET /api/notifications
// Query: ?tab=all|action|read  &module=<NotiModule>  &limit=20
//   tab=all     → tất cả noti của user (default)
//   tab=action  → chỉ action_required + actionStatus='pending'
//   tab=read    → chỉ isRead=true
// Filter module optional — undefined = tất cả module.
//
// PR-CASH1E-FIX (2026-06-23): mở whitelist module đầy đủ NotiModule
// (proposal/dispatch/chat/kt/sales/finance/system). Trước đây chỉ accept
// proposal|dispatch → các module khác bị silent ignore. Composite index
// `userId+module+createdAt DESC` mới cũng add cùng PR.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';

const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 50;

// 7 module hợp lệ (đồng bộ NotiModule + VALID_MODULES settings).
const VALID_MODULE_FILTERS = new Set([
  'proposal', 'dispatch', 'chat', 'kt', 'sales', 'finance', 'system',
]);

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const sp = req.nextUrl.searchParams;
    const tab = (sp.get('tab') ?? 'all') as 'all' | 'action' | 'read';
    const moduleParam = sp.get('module');
    const limit = Math.min(LIMIT_MAX, Math.max(1, Number(sp.get('limit') ?? LIMIT_DEFAULT)));

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.NOTIFICATIONS)
      .where('userId', '==', caller.profile.uid);

    if (moduleParam && VALID_MODULE_FILTERS.has(moduleParam)) {
      q = q.where('module', '==', moduleParam);
    }
    // module không hợp lệ → silent ignore (giữ behavior cũ, tránh phá UI cũ)
    if (tab === 'action') {
      q = q.where('actionStatus', '==', 'pending').where('isActionRequired', '==', true);
    } else if (tab === 'read') {
      q = q.where('isRead', '==', true);
    }

    q = q.orderBy('createdAt', 'desc').limit(limit);
    const snap = await q.get();

    const rows = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        userId: x.userId,
        module: x.module,
        entityId: x.entityId,
        entityCode: x.entityCode ?? null,
        title: x.title,
        message: x.message,
        type: x.type,
        priority: x.priority,
        isRead: x.isRead === true,
        isActionRequired: x.isActionRequired === true,
        actionStatus: x.actionStatus ?? 'done',
        createdAt: x.createdAt?.toDate?.()?.toISOString?.() ?? x.createdAt ?? null,
        readAt: x.readAt?.toDate?.()?.toISOString?.() ?? x.readAt ?? null,
        linkUrl: x.linkUrl,
      };
    });

    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[GET /api/notifications]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
