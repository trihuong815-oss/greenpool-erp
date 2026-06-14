// POST /api/cron/proposal-overdue
// V6.5 Phase B (2026-06-14): SLA monitoring cho đề xuất pending_approval.
//
// SLA theo priority:
//   urgent : 12h  (vd duyệt khẩn cấp tài chính)
//   normal : 24h  (default)
//   low    : 48h
//
// Logic:
//   1. Query tasks where kind='proposal' AND status='pending_approval'
//      AND createdAt <= now - 12h (lấy hết tier sớm nhất)
//   2. Lọc trong code theo priority để chọn task vượt SLA
//   3. Skip nếu lastReminderAt < 24h trước (tránh spam)
//   4. Gửi noti reminder cho currentApprover qua engine
//   5. Update task.lastReminderAt = now
//
// Trigger: GitHub Actions cron hourly (0 * * * * = mỗi giờ trên dot).
// Auth: Bearer CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { resolveApproverUids } from '@/lib/firebase/push-notifications';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export const maxDuration = 60;

const SLA_BY_PRIORITY: Record<string, number> = {
  urgent: 12 * 60 * 60_000,
  high: 12 * 60 * 60_000,    // alias cũ
  normal: 24 * 60 * 60_000,
  low: 48 * 60 * 60_000,
};
const MIN_SLA_MS = 12 * 60 * 60_000;
const REMINDER_COOLDOWN_MS = 24 * 60 * 60_000; // mỗi task tối đa 1 reminder/ngày
const QUERY_LIMIT = 500;

function parseTaskDate(v: any): number | null {
  if (!v) return null;
  if (typeof v === 'string') { const t = Date.parse(v); return isFinite(t) ? t : null; }
  if (v?.toMillis) return v.toMillis();
  if (v?.seconds) return v.seconds * 1000;
  return null;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || auth.length !== expected.length ||
      !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getFirebaseAdminDb();
  const now = Date.now();
  const cutoffIso = new Date(now - MIN_SLA_MS).toISOString();

  try {
    // createdAt được lưu dạng ISO string trong dự án — so sánh lexicographic OK
    const snap = await db.collection(COLLECTIONS.TASKS)
      .where('kind', '==', 'proposal')
      .where('status', '==', 'pending_approval')
      .where('createdAt', '<=', cutoffIso)
      .limit(QUERY_LIMIT)
      .get();

    let candidate = 0, sent = 0, skipped = 0;
    for (const doc of snap.docs) {
      const t = doc.data();
      const createdAtMs = parseTaskDate(t.createdAt);
      if (!createdAtMs) continue;
      const priority = typeof t.priority === 'string' ? t.priority : 'normal';
      const sla = SLA_BY_PRIORITY[priority] ?? SLA_BY_PRIORITY.normal;
      const ageMs = now - createdAtMs;
      if (ageMs < sla) continue;
      candidate++;

      // Cooldown — đã reminder trong 24h gần đây thì skip
      const lastRemindMs = parseTaskDate(t.lastReminderAt);
      if (lastRemindMs && now - lastRemindMs < REMINDER_COOLDOWN_MS) { skipped++; continue; }

      // Resolve approver hiện tại
      const entry = t.currentApprover;
      if (!entry) { skipped++; continue; }
      const uids = await resolveApproverUids([entry]);
      if (uids.length === 0) { skipped++; continue; }

      const hoursLate = Math.round((ageMs - sla) / 3600_000);
      const ageHrs = Math.round(ageMs / 3600_000);
      await sendNotificationEvent({
        type: 'task_pending_approval',
        module: 'proposal',
        entityId: doc.id,
        title: `⏰ Đề xuất quá SLA ${hoursLate}h`,
        message: `"${t.title}" — chờ duyệt đã ${ageHrs} giờ (SLA ${sla / 3600_000}h, ưu tiên ${priority}). Vui lòng xử lý.`,
        linkUrl: `/de-xuat?proposalId=${doc.id}&action=approve`,
        recipients: uids,
        priority: 'high',
        pushTag: `sla-${doc.id}`,
        pushData: { taskId: doc.id, slaHoursLate: String(hoursLate) },
        channels: { inApp: true, push: true, email: true }, // SLA luôn email
      });

      await doc.ref.update({ lastReminderAt: new Date(now) });
      sent++;
    }

    await writeAuditLog({
      action: 'cron_proposal_overdue',
      module: 'giaoviec',
      userId: 'cron',
      branchId: null,
      before: null,
      after: { scanned: snap.size, candidate, sent, skipped },
      actorName: 'cron',
      actorRole: 'system',
      source: 'cron',
    }).catch(() => {});

    return NextResponse.json({ ok: true, scanned: snap.size, candidate, sent, skipped });
  } catch (e: any) {
    console.error('[proposal-overdue]', e?.message);
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 });
  }
}
