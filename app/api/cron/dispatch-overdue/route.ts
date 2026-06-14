// POST /api/cron/dispatch-overdue
// V6.5 Phase B (2026-06-14): Theo dõi điều phối quá hạn + escalation GĐ khối.
//
// Logic:
//   1. Query tasks where kind='assignment' AND status IN ['pending','in_progress','requested_revision']
//      AND dueDate < now
//   2. Cấp 1: < 24h quá hạn → noti owner + assignees (lần đầu hoặc cooldown 24h)
//   3. Cấp 2 (escalation): > 24h quá hạn → noti GĐ khối tương ứng (assigneeBlock)
//                          + push email priority='high'
//   4. Update: task.lastOverdueNotifyAt, task.escalatedAt
//
// Trigger: GitHub Actions cron hourly.
// Auth: Bearer CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export const maxDuration = 60;

const ACTIVE_STATUSES = ['pending', 'in_progress', 'requested_revision'];
const OVERDUE_COOLDOWN_MS = 24 * 60 * 60_000;
const ESCALATION_THRESHOLD_MS = 24 * 60 * 60_000;
const QUERY_LIMIT = 500;

function parseTaskDate(v: any): number | null {
  if (!v) return null;
  if (typeof v === 'string') { const t = Date.parse(v); return isFinite(t) ? t : null; }
  if (v?.toMillis) return v.toMillis();
  if (v?.seconds) return v.seconds * 1000;
  return null;
}

async function resolveGdUidByBlock(db: FirebaseFirestore.Firestore, block: 'KD' | 'VP'): Promise<string | null> {
  const role = block === 'KD' ? 'GD_KD' : 'GD_VP';
  const snap = await db.collection(COLLECTIONS.USERS)
    .where('status', '==', 'active')
    .where('roleId', '==', role).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
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
  const nowIso = new Date(now).toISOString();

  try {
    // Firestore không hỗ trợ != trong where, dùng IN cho status
    const snap = await db.collection(COLLECTIONS.TASKS)
      .where('kind', '==', 'assignment')
      .where('status', 'in', ACTIVE_STATUSES)
      .limit(QUERY_LIMIT)
      .get();

    let candidate = 0, owner_notified = 0, escalated = 0, skipped = 0;
    for (const doc of snap.docs) {
      const t = doc.data();
      const dueMs = parseTaskDate(t.dueDate);
      if (!dueMs || dueMs >= now) continue; // chưa quá hạn
      candidate++;

      const overdueMs = now - dueMs;
      const overdueHrs = Math.round(overdueMs / 3600_000);
      const isEscalation = overdueMs >= ESCALATION_THRESHOLD_MS;
      const lastNotifyMs = parseTaskDate(t.lastOverdueNotifyAt);
      const escalatedMs = parseTaskDate(t.escalatedAt);

      // ─── Bước A: cấp 1 — báo owner + assignees nếu chưa báo trong 24h gần đây ───
      const ownerUids = new Set<string>();
      if (typeof t.createdBy === 'string') ownerUids.add(t.createdBy);
      if (Array.isArray(t.assigneeUserIds)) {
        for (const u of t.assigneeUserIds) if (typeof u === 'string') ownerUids.add(u);
      }
      if (ownerUids.size > 0 && (!lastNotifyMs || now - lastNotifyMs >= OVERDUE_COOLDOWN_MS)) {
        await sendNotificationEvent({
          type: 'task_overdue',
          module: 'dispatch',
          entityId: doc.id,
          title: `⚠️ Điều phối quá hạn ${overdueHrs}h`,
          message: `"${t.title}" — đã trễ ${overdueHrs} giờ so với deadline.`,
          linkUrl: `/dieu-phoi?taskId=${doc.id}`,
          recipients: Array.from(ownerUids),
          priority: isEscalation ? 'urgent' : 'high',
          pushTag: `overdue-${doc.id}`,
          pushData: { taskId: doc.id, overdueHours: String(overdueHrs) },
          channels: { inApp: true, push: true, email: true },
        });
        await doc.ref.update({ lastOverdueNotifyAt: new Date(now) });
        owner_notified++;
      }

      // ─── Bước B: cấp 2 — escalation GĐ khối (chỉ 1 lần khi vượt 24h) ───
      if (isEscalation && !escalatedMs) {
        const block = t.assigneeBlock === 'VP' ? 'VP' : 'KD';
        const gdUid = await resolveGdUidByBlock(db, block);
        if (gdUid && gdUid !== t.createdBy) {
          await sendNotificationEvent({
            type: 'task_overdue',
            module: 'dispatch',
            entityId: doc.id,
            title: `🚨 ESCALATION: điều phối quá hạn ${overdueHrs}h`,
            message: `"${t.title}" của khối ${block} đã trễ ${overdueHrs}h. Vui lòng can thiệp.`,
            linkUrl: `/dieu-phoi?taskId=${doc.id}`,
            recipients: [gdUid],
            priority: 'urgent',
            pushTag: `escalation-${doc.id}`,
            pushData: { taskId: doc.id, overdueHours: String(overdueHrs), escalation: '1' },
            channels: { inApp: true, push: true, email: true },
          });
          await doc.ref.update({ escalatedAt: new Date(now) });
          escalated++;
        } else {
          skipped++;
        }
      } else if (!isEscalation && lastNotifyMs && now - lastNotifyMs < OVERDUE_COOLDOWN_MS) {
        skipped++;
      }
    }

    await writeAuditLog({
      action: 'cron_dispatch_overdue',
      module: 'giaoviec',
      userId: 'cron',
      branchId: null,
      before: null,
      after: { scanned: snap.size, candidate, owner_notified, escalated, skipped },
      actorName: 'cron',
      actorRole: 'system',
      source: 'cron',
    }).catch(() => {});

    return NextResponse.json({ ok: true, scanned: snap.size, candidate, owner_notified, escalated, skipped });
  } catch (e: any) {
    console.error('[dispatch-overdue]', e?.message);
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 });
  }
}
