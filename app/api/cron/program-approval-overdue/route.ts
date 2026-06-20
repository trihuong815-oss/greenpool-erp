// POST /api/cron/program-approval-overdue
// M2.1 PR-5 (2026-06-20) — Sales V2 program approval SLA escalation.
//
// Schedule (GitHub Actions): hourly (offset :40 tránh conflict cron khác).
//
// Logic:
//   - Query programs status='pending_approval' AND submittedAt < now-24h.
//   - Skip if approvalOverdueNotifiedAt != null (đã gửi escalate rồi).
//   - Send noti sales_program_approval_overdue cho currentApprover + escalate
//     GD còn lại trong approverChain.
//   - Update program.approvalOverdueNotifiedAt = now (dedupe).
//
// Flag-gated: SALES_V2_PROGRAM_CRON default OFF.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { isFlagEnabled } from '@/lib/feature-flags/server';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLA_MS = 24 * 60 * 60_000;  // 24 giờ
const QUERY_LIMIT = 200;

function parseDate(v: any): number | null {
  if (!v) return null;
  if (typeof v === 'string') { const t = Date.parse(v); return isFinite(t) ? t : null; }
  if (v?.toMillis) return v.toMillis();
  if (v?.seconds) return v.seconds * 1000;
  return null;
}

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
  const nowMs = Date.now();
  let candidate = 0, sent = 0, dedupedSkip = 0;

  try {
    // Composite index (status, submittedAt) — PR-1 đã add vào firestore.indexes.json
    const snap = await db.collection(COLLECTIONS.SALES_PROGRAMS)
      .where('status', '==', 'pending_approval')
      .limit(QUERY_LIMIT)
      .get();
    candidate = snap.size;

    for (const doc of snap.docs) {
      const data = doc.data();
      const submittedAtMs = parseDate(data.submittedAt);
      if (!submittedAtMs) continue;
      // Đã quá 24h chưa
      if (nowMs - submittedAtMs < SLA_MS) continue;
      // Dedupe: đã gửi rồi → skip
      if (data.approvalOverdueNotifiedAt) { dedupedSkip++; continue; }

      const currentApprover = String(data.currentApprover ?? '');
      const chain: string[] = Array.isArray(data.approverChain) ? data.approverChain : [];
      if (!currentApprover) continue;

      const recipients = new Set<string>();
      recipients.add(currentApprover);
      // Escalate GD còn lại
      for (const uid of chain) if (uid !== currentApprover) recipients.add(uid);

      const hoursLate = Math.floor((nowMs - submittedAtMs) / 3600_000);
      try {
        await sendNotificationEvent({
          type: 'sales_program_approval_overdue',
          module: 'sales',
          entityId: doc.id,
          title: `⚠️ CT "${data.name}" chờ duyệt ${hoursLate}h`,
          message: `${data.branchName} · tháng ${data.month} · Submit ${new Date(submittedAtMs).toLocaleString('vi-VN')}. Vui lòng duyệt sớm.`,
          linkUrl: `/doanh-so-v2/chuong-trinh?programId=${doc.id}`,
          recipients: Array.from(recipients),
          priority: 'high',
          pushTag: `program-overdue-${doc.id}`,
        });
        // Mark sent
        await doc.ref.update({
          approvalOverdueNotifiedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        // Audit
        try {
          await writeAuditLog({
            action: 'program_approval_overdue_escalated',
            module: 'sales',
            userId: '__cron__',
            branchId: data.branchId,
            before: { hoursLate: 0 },
            after: { hoursLate, recipients: Array.from(recipients) },
            actorName: 'CRON',
            actorRole: 'system',
            source: 'cron',
          });
        } catch (e) { /* swallow */ }
        sent++;
      } catch (e: any) {
        console.warn('[program-approval-overdue] send fail id=' + doc.id, e?.message);
      }
    }

    return NextResponse.json({ ok: true, candidate, sent, dedupedSkip });
  } catch (err: any) {
    console.error('[program-approval-overdue] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
