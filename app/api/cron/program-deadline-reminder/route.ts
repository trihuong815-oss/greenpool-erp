// POST /api/cron/program-deadline-reminder
// M2.1 PR-5 (2026-06-20) — Sales V2 program deadline reminders.
//
// Schedule (GitHub Actions): daily 02:00 UTC = 09:00 VN.
//
// Logic:
//   - Compute day of month VN. Only fire on day 23 (d2), 25 (d0), 26 (overdue).
//   - For each QLCS_* user active in DB, check if they've submitted a program for
//     currentMonthVN (program.status in [pending_approval/approved/active/paused]).
//   - If NOT submitted → send reminder noti, dedupe via salesProgramReminderLog doc.
//   - Day 26 (overdue) → also escalate noti to GD_KD/GD_VP role recipients.
//
// Flag-gated: SALES_V2_PROGRAM_CRON default OFF → cron returns {skipped:true} early.
//
// Auth: Bearer CRON_SECRET (timingSafeEqual).

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { currentMonthVN, dayOfMonthVN } from '@/lib/sales-v2/programs';
import { isFlagEnabled } from '@/lib/feature-flags/server';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_PROGRAM_STATUS = ['pending_approval', 'approved', 'active', 'paused'];

interface ReminderConfig {
  tag: 'd2' | 'd0' | 'overdue';
  notiType: 'sales_program_deadline_d2' | 'sales_program_deadline_d0' | 'sales_program_deadline_overdue';
  titlePrefix: string;
  escalateGD: boolean;
}

function getReminderConfig(day: number): ReminderConfig | null {
  if (day === 23) return { tag: 'd2', notiType: 'sales_program_deadline_d2', titlePrefix: '📅 Còn 2 ngày', escalateGD: false };
  if (day === 25) return { tag: 'd0', notiType: 'sales_program_deadline_d0', titlePrefix: '🔔 Hôm nay là hạn cuối', escalateGD: false };
  if (day === 26) return { tag: 'overdue', notiType: 'sales_program_deadline_overdue', titlePrefix: '❌ Đã quá hạn', escalateGD: true };
  return null;
}

export async function POST(req: NextRequest) {
  // Auth — timingSafeEqual constant-time compare
  const auth = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || auth.length !== expected.length
      || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Flag gate — system uid/role để check global flag
  const flagOn = await isFlagEnabled('SALES_V2_PROGRAM_CRON', '__cron__', '__cron__');
  if (!flagOn) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'flag SALES_V2_PROGRAM_CRON OFF' });
  }

  const day = dayOfMonthVN();
  const config = getReminderConfig(day);
  if (!config) {
    return NextResponse.json({ ok: true, skipped: true, reason: `day=${day} not 23/25/26` });
  }

  const month = currentMonthVN();
  const db = getFirebaseAdminDb();
  let qlcsCount = 0, sent = 0, dedupedSkip = 0, alreadySubmitted = 0, escalated = 0;

  try {
    // 1. Fetch all active QLCS users (small set ~5-10 user)
    const qlcsSnap = await db.collection(COLLECTIONS.USERS)
      .where('status', '==', 'active')
      .get();
    const qlcsUsers: Array<{ uid: string; branchId: string; name: string }> = [];
    qlcsSnap.forEach((d) => {
      const u = d.data();
      const role = String(u.roleId ?? '');
      if (!role.startsWith('QLCS_')) return;
      if (u.excludeFromBusinessNoti === true) return;
      const branchId = String(u.branchId ?? '');
      if (!branchId) return;
      qlcsUsers.push({ uid: d.id, branchId, name: String(u.displayName ?? u.email ?? '') });
    });
    qlcsCount = qlcsUsers.length;

    // 2. For each QLCS: check if they have program for currentMonth + send reminder if not
    for (const u of qlcsUsers) {
      // Dedupe check: log doc tồn tại = đã gửi → skip
      const logRef = db.collection(COLLECTIONS.SALES_PROGRAM_REMINDER_LOG)
        .doc(`${u.uid}_${month}_${config.tag}`);
      const logSnap = await logRef.get();
      if (logSnap.exists) { dedupedSkip++; continue; }

      // Check has any submitted program for this branch + month
      const progSnap = await db.collection(COLLECTIONS.SALES_PROGRAMS)
        .where('branchId', '==', u.branchId)
        .where('month', '==', month)
        .limit(20)
        .get();
      const hasSubmitted = progSnap.docs.some((d) => {
        const p = d.data();
        return p.createdBy === u.uid && ACTIVE_PROGRAM_STATUS.includes(String(p.status ?? ''));
      });
      if (hasSubmitted) { alreadySubmitted++; continue; }

      // Send reminder noti
      try {
        const title = `${config.titlePrefix} nộp chương trình KM tháng ${month}`;
        const message = config.tag === 'overdue'
          ? `Bạn chưa nộp chương trình tháng ${month} (hạn 25). Vui lòng nộp ngay hoặc liên hệ GĐ.`
          : `Hạn nộp chương trình KM tháng ${month}: ngày 25. Bạn chưa nộp.`;

        await sendNotificationEvent({
          type: config.notiType,
          module: 'sales',
          entityId: `${u.branchId}_${month}`,
          title,
          message,
          linkUrl: '/doanh-so-v2/chuong-trinh',
          recipients: [u.uid],
          priority: config.tag === 'overdue' ? 'high' : 'normal',
          pushTag: `program-reminder-${u.uid}-${month}-${config.tag}`,
        });
        sent++;

        // Escalate GD nếu overdue
        if (config.escalateGD) {
          const gdSnap = await db.collection(COLLECTIONS.USERS)
            .where('roleId', 'in', ['GD_KD', 'GD_VP'])
            .where('status', '==', 'active')
            .get();
          const gdRecipients: string[] = [];
          gdSnap.forEach((d) => {
            const u2 = d.data();
            if (u2.excludeFromBusinessNoti === true) return;
            gdRecipients.push(d.id);
          });
          if (gdRecipients.length > 0) {
            await sendNotificationEvent({
              type: 'sales_program_deadline_overdue',
              module: 'sales',
              entityId: `${u.branchId}_${month}`,
              title: `❌ QLCS chưa nộp CT tháng ${month}`,
              message: `QLCS ${u.name} (${u.branchId}) chưa nộp chương trình tháng ${month}. Quá hạn 1 ngày.`,
              linkUrl: '/doanh-so-v2/chuong-trinh',
              recipients: gdRecipients,
              priority: 'high',
              pushTag: `program-escalate-${u.uid}-${month}`,
            });
            escalated++;
          }
        }

        // Mark sent — write log doc (dedupe)
        await logRef.set({
          uid: u.uid,
          branchId: u.branchId,
          month,
          tag: config.tag,
          sentAt: Timestamp.now(),
        });
      } catch (e: any) {
        console.warn('[program-deadline-reminder] send fail uid=' + u.uid, e?.message);
      }
    }

    return NextResponse.json({
      ok: true,
      day, month, tag: config.tag,
      qlcsCount, sent, dedupedSkip, alreadySubmitted, escalated,
    });
  } catch (err: any) {
    console.error('[program-deadline-reminder] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
