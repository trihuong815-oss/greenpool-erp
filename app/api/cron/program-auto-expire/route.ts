// POST /api/cron/program-auto-expire
// M2.1 PR-5 (2026-06-20) — Sales V2 program auto-expire khi sang tháng mới.
//
// Schedule (GitHub Actions): daily 17:30 UTC = 00:30 VN ngày mới.
//
// Logic:
//   - Compute currentMonthVN.
//   - Query programs where month < currentMonth AND status in [draft, pending_approval,
//     approved, active, paused] → set status='expired', expiredAt=now, expiredByCron=true.
//   - Send light noti sales_program_auto_expired cho creator (info only).
//   - Audit log per program.
//
// Flag-gated: SALES_V2_PROGRAM_CRON default OFF.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { currentMonthVN } from '@/lib/sales-v2/programs';
import { isFlagEnabled } from '@/lib/feature-flags/server';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = ['draft', 'pending_approval', 'approved', 'active', 'paused'];
const QUERY_LIMIT = 500;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || auth.length !== expected.length
      || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const flagOn = await isFlagEnabled('SALES_V2_PROGRAM_CRON', '__cron__', '__cron__');
  if (!flagOn) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'flag SALES_V2_PROGRAM_CRON OFF' });
  }

  const db = getFirebaseAdminDb();
  const curMonth = currentMonthVN();
  let candidate = 0, expired = 0;

  try {
    // Single where(status, 'in', ...) + client filter month < curMonth.
    // KHÔNG dùng composite (status, month) range — Firestore không cho where('in') + range
    // trên field khác trong cùng query. PR-1 đã add index (status, month) cho future use.
    const snap = await db.collection(COLLECTIONS.SALES_PROGRAMS)
      .where('status', 'in', ACTIVE_STATUSES)
      .limit(QUERY_LIMIT)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const programMonth = String(data.month ?? '');
      if (!programMonth || programMonth >= curMonth) continue;  // chỉ tháng cũ
      candidate++;

      try {
        const now = Timestamp.now();
        await doc.ref.update({
          status: 'expired',
          expiredAt: now,
          expiredByCron: true,
          updatedAt: now,
        });
        expired++;

        // Noti nhẹ cho creator (info only, low priority, in-app only)
        const createdBy = String(data.createdBy ?? '');
        if (createdBy) {
          try {
            await sendNotificationEvent({
              type: 'sales_program_auto_expired',
              module: 'sales',
              entityId: doc.id,
              title: `Chương trình "${data.name}" đã hết hiệu lực`,
              message: `Tháng ${programMonth} đã qua. Chương trình tự động đóng. Tạo mới nếu cần tiếp tục KM.`,
              linkUrl: `/doanh-so-v2/chuong-trinh?programId=${doc.id}`,
              recipients: [createdBy],
              priority: 'low',
              pushTag: `program-expired-${doc.id}`,
              channels: { inApp: true, push: false, email: false },
            });
          } catch (e) { /* swallow */ }
        }

        // Audit
        try {
          await writeAuditLog({
            action: 'program_auto_expired',
            module: 'sales',
            userId: '__cron__',
            branchId: data.branchId,
            before: { status: data.status, month: programMonth },
            after: { status: 'expired', expiredByCron: true },
            actorName: 'CRON',
            actorRole: 'system',
            source: 'cron',
          });
        } catch (e) { /* swallow */ }
      } catch (e: any) {
        console.warn('[program-auto-expire] update fail id=' + doc.id, e?.message);
      }
    }

    return NextResponse.json({ ok: true, curMonth, candidate, expired });
  } catch (err: any) {
    console.error('[program-auto-expire] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
