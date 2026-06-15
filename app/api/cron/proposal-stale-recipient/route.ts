// POST /api/cron/proposal-stale-recipient
// V6.5 Audit Phase D.1 (2026-06-15): cleanup proposal có currentApprover trỏ tới
// user bị disabled/inactive — tránh chain KẸT.
//
// Logic:
//   1. Query tasks where kind='proposal' AND status IN ['pending_approval', 'da_gui', 'dang_xem_xet']
//   2. Với mỗi proposal: extract uid từ currentApprover ('user:UID')
//   3. Lookup user → nếu status='inactive' OR disabled=true → ĐÁNH DẤU stale
//   4. Cho mỗi proposal stale:
//      • Comment timeline ghi rõ: "Hệ thống tự huỷ — người duyệt {tên} không còn active"
//      • Update status='cancelled' + cancelledAt + cancelledReason
//      • Noti creator (gửi qua engine V6.5)
//
// Trigger: GitHub Actions cron hourly (đồng bộ với proposal-overdue + dispatch-overdue).
// Auth: Bearer CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export const maxDuration = 60;

const ACTIVE_STATUSES = ['pending_approval', 'da_gui', 'dang_xem_xet'];
const QUERY_LIMIT = 200;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || auth.length !== expected.length ||
      !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getFirebaseAdminDb();

  try {
    const snap = await db.collection(COLLECTIONS.TASKS)
      .where('kind', '==', 'proposal')
      .where('status', 'in', ACTIVE_STATUSES)
      .limit(QUERY_LIMIT)
      .get();

    let scanned = 0, cancelled = 0, skipped = 0;
    for (const doc of snap.docs) {
      scanned++;
      const t = doc.data();
      const cur = typeof t.currentApprover === 'string' ? t.currentApprover : '';
      if (!cur.startsWith('user:')) { skipped++; continue; }
      const approverUid = cur.slice(5);
      if (!approverUid) { skipped++; continue; }

      // Lookup user — nếu inactive/disabled → auto cancel
      const userSnap = await db.collection(COLLECTIONS.USERS).doc(approverUid).get();
      if (!userSnap.exists) {
        // User đã bị xoá hẳn — cancel proposal
      } else {
        const u = userSnap.data();
        if (u?.status !== 'inactive' && u?.disabled !== true) {
          skipped++;
          continue;
        }
      }

      const userName = userSnap.exists ? (userSnap.data()?.displayName ?? approverUid) : '(đã xoá)';
      const reason = `Người duyệt "${userName}" không còn hoạt động. Hệ thống tự huỷ đề xuất để tránh kẹt chuỗi duyệt.`;
      const now = new Date();

      try {
        await doc.ref.update({
          status: 'cancelled',
          cancelledAt: now,
          cancelledReason: reason,
          currentApprover: null,
          updatedAt: now,
        });
        await doc.ref.collection('comments').add({
          authorId: 'system',
          authorName: 'Hệ thống',
          authorRole: 'system',
          body: reason,
          kind: 'transition',
          event: 'auto_cancel_stale_approver',
          createdAt: now,
        });
        // Notify creator
        if (typeof t.createdBy === 'string' && t.createdBy) {
          await sendNotificationEvent({
            type: 'task_rejected',
            module: 'proposal',
            entityId: doc.id,
            title: '⛔ Đề xuất bị huỷ tự động',
            message: `"${t.title}" — ${reason}`,
            linkUrl: `/de-xuat?proposalId=${doc.id}`,
            recipients: [t.createdBy],
            priority: 'high',
            pushTag: `proposal-cancel-${doc.id}`,
          });
        }
        cancelled++;
      } catch (e: any) {
        console.warn('[proposal-stale-recipient] update fail:', doc.id, e?.message);
      }
    }

    await writeAuditLog({
      action: 'cron_proposal_stale_recipient',
      module: 'giaoviec',
      userId: 'cron',
      branchId: null,
      before: null,
      after: { scanned, cancelled, skipped },
      actorName: 'cron',
      actorRole: 'system',
      source: 'cron',
    }).catch(() => {});

    return NextResponse.json({ ok: true, scanned, cancelled, skipped });
  } catch (e: any) {
    console.error('[proposal-stale-recipient]', e?.message);
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 });
  }
}
