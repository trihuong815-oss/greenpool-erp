// POST /api/cron/cleanup-notifications
// PR-NOTIFICATION-RETENTION (2026-06-30) — P1 từ DATA-SCALE-AUDIT-01.
//
// Mục đích: cắt growth của collection `notifications`. Hiện không có UI history
// nào load notifications cũ hơn limit 20-50 của bell dropdown (xem
// /api/notifications GET) → notifications >30 ngày là dead data, không ai đọc.
//
// Compliance trail của business mutation nằm ở `auditLogs` + `salesAuditLogs`
// (không phải notifications). Hard-delete an toàn.
//
// Auth: Bearer CRON_SECRET (pattern chuẩn các cron khác).
// Schedule: KHÔNG schedule ở PR này — manual call only.
//   Sau khi smoke prod ổn 1-2 tuần, follow-up PR-NOTIFICATION-RETENTION-ACTIVATE
//   sẽ wire vào .github/workflows/ daily 03:30 VN.
//
// Behavior:
//   - Query `notifications` where(createdAt < now - 30d).limit(500)
//   - Batch delete (Firestore batch max 500 docs/commit — vừa khớp)
//   - Trả truncated=true nếu snap.size === scanLimit → call lại nếu cần xử nhiều
//   - Audit log fail-soft
//
// DRY RUN (PR-NOTIFICATION-RETENTION-DRYRUN, 2026-06-30):
//   - ?dryRun=1 (or true/yes) → count what WOULD be deleted, write NOTHING
//   - Same auth + same query + same response shape + dryRun:true field
//   - Audit logged with action='cleanup_old_notifications_dryrun'
//   - Console log "DRY RUN — no notifications deleted"
//   - Production smoke MUST run dry-run first before actual cleanup

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// PR-NOTIFICATION-RETENTION (2026-06-30): retention config.
// 30 ngày = đủ dài cho user thấy mọi noti relevant + đủ ngắn để cap growth.
// 500 = Firestore batch write hard cap → 1 commit/run an toàn.
//
// Truncated→true nghĩa là còn nhiều noti cũ hơn cap → call lại cron nhiều lần
// (mỗi lần xử 500) đến khi truncated=false. Hoặc tăng cap nếu cần.
const RETENTION_DAYS = 30;
const SCAN_LIMIT = 500;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60_000;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization');
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Parse `dryRun` flag from request query string. Accepts:
 *   ?dryRun=1
 *   ?dryRun=true
 *   ?dryRun=yes
 * Anything else (missing, '0', 'false', 'no') → false = hard delete.
 *
 * PR-NOTIFICATION-RETENTION-DRYRUN (2026-06-30): introduce dry-run mode so
 * production smoke can verify scope BEFORE first real delete.
 */
function parseDryRun(req: NextRequest): boolean {
  const v = (req.nextUrl.searchParams.get('dryRun') ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'yes';
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = parseDryRun(req);
  const t0 = Date.now();
  const cutoffDate = new Date(t0 - RETENTION_MS);
  const cutoffTs = Timestamp.fromDate(cutoffDate);

  try {
    const db = getFirebaseAdminDb();

    // Query notifications cũ hơn cutoff. Single-field index on createdAt
    // auto-managed by Firestore — no composite needed.
    const snap = await db.collection(COLLECTIONS.NOTIFICATIONS)
      .where('createdAt', '<', cutoffTs)
      .limit(SCAN_LIMIT)
      .get();

    const truncated = snap.size >= SCAN_LIMIT;
    if (truncated) {
      console.warn(
        '[cleanup-notifications] reached SCAN_LIMIT=' + SCAN_LIMIT
        + ' — more old notifications remain. Re-run cron or increase cap.',
      );
    }

    const processed = snap.size;
    let affected = 0;

    if (dryRun) {
      // DRY RUN: count what WOULD be deleted, but write nothing.
      // Skip Firestore writes entirely. affected = processed for reporting.
      affected = processed;
      // eslint-disable-next-line no-console
      console.info(
        '[cleanup-notifications] DRY RUN — no notifications deleted'
        + ' processed=' + processed
        + ' wouldDelete=' + affected
        + ' cutoff=' + cutoffDate.toISOString(),
      );
    } else if (processed > 0) {
      // Batch delete — Firestore commit cap = 500 doc, vừa khớp SCAN_LIMIT.
      // Nếu future tăng SCAN_LIMIT > 500 → cần chia nhiều batch.
      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
        affected += 1;
      }
      await batch.commit();
    }

    // Audit log fail-soft — không block response nếu fail.
    // DRY RUN cũng ghi audit để có trace ai chạy dry run khi nào (verify chain
    // before activating real cleanup).
    try {
      await writeAuditLog({
        action: dryRun ? 'cleanup_old_notifications_dryrun' : 'cleanup_old_notifications',
        module: 'users',                    // notifications scoped to users
        userId: 'cron',
        branchId: null,
        before: null,
        after: {
          dryRun,
          processed,
          affected,
          retentionDays: RETENTION_DAYS,
          scanLimit: SCAN_LIMIT,
          truncated,
          cutoff: cutoffDate.toISOString(),
          durationMs: Date.now() - t0,
        },
        actorName: 'cron',
        actorRole: 'system',
        source: 'cron',
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[cleanup-notifications] audit write fail (non-blocking):', (e as Error)?.message);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      processed,
      affected,
      retentionDays: RETENTION_DAYS,
      scanLimit: SCAN_LIMIT,
      truncated,
      cutoff: cutoffDate.toISOString(),
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? 'Unknown error';
    // eslint-disable-next-line no-console
    console.error('[cleanup-notifications] error:', msg);
    return NextResponse.json(
      { ok: false, error: 'Internal error', message: msg.slice(0, 500) },
      { status: 500 },
    );
  }
}

// Explicit reject GET — tránh accidental trigger
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed — POST only with Bearer CRON_SECRET' },
    { status: 405 },
  );
}
