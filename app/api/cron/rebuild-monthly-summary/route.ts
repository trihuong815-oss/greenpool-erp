// PR-SUMMARY-05-CRON-SAFE-ENDPOINT-NO-SCHEDULE (2026-06-29) — Cron-safe
// endpoint cho rebuild monthly summary. KHÔNG có schedule production trong
// PR này — chỉ expose endpoint với secret protection để PR sau (06) wire
// scheduler (GitHub Actions / App Hosting cron).
//
// POST /api/cron/rebuild-monthly-summary
// Headers:
//   x-cron-secret: <MONTHLY_SUMMARY_CRON_SECRET>     (BẮT BUỘC)
// Body (optional):
//   {
//     "month": "2026-06",     // optional — default = current month (VN tz)
//                             // chỉ accept current hoặc previous month
//     "branchIds": ["HM"]     // optional — default = all 5 BRANCH_IDS
//   }
//
// Behavior:
//   - Tuần tự cho tất cả branches (for...of, KHÔNG Promise.all)
//   - Fail-fast: branch lỗi → dừng, response báo failedBranch
//   - Truncated branch → vẫn ok nhưng có warnings + hasTruncatedBranch=true
//   - Audit log per-branch đã có sẵn trong rebuildMonthlySalesSummaryForBranch
//   - Endpoint thêm tổng audit log monthly_summary_cron_rebuild (fail-soft)
//
// Security:
//   - Env MONTHLY_SUMMARY_CRON_SECRET chưa cấu hình → 503 (cron disabled)
//   - Thiếu header → 401
//   - Sai secret → 403 (timing-safe compare)
//   - GET → 405
//
// KHÔNG đụng:
//   - /api/sales-v2/monthly-summary (PR-04 read endpoint)
//   - UI /tong-ket
//   - salesTransactions data
//   - Công thức doanh số/công nợ (dùng builder PR-02 + service PR-03)

import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import {
  validateCronSecret,
  resolveCronMonth,
  resolveCronBranchIds,
  runMonthlySummaryCronRebuild,
} from '@/lib/sales-v2/monthly-summary-cron';
import { rebuildMonthlySalesSummaryForBranch } from '@/lib/sales-v2/monthly-summary-rebuild';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_DELAY_MS = 500; // delay nhỏ giữa branches để giảm pressure
const REQUESTED_BY = 'cron:monthly-summary';

export async function POST(req: NextRequest) {
  // ─── 1. Validate secret ──────────────────────────────────────────────
  const auth = validateCronSecret(
    req.headers.get('x-cron-secret'),
    process.env.MONTHLY_SUMMARY_CRON_SECRET,
  );
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.message, reason: auth.reason },
      { status: auth.status },
    );
  }

  // ─── 2. Parse body ───────────────────────────────────────────────────
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const requestedMonth = typeof body?.month === 'string' ? body.month : undefined;
  const requestedBranchIds = Array.isArray(body?.branchIds)
    ? (body.branchIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;

  // ─── 3. Resolve month ────────────────────────────────────────────────
  const monthResult = resolveCronMonth({ requestedMonth });
  if (!monthResult.ok) {
    return NextResponse.json(
      { ok: false, error: monthResult.error },
      { status: monthResult.status ?? 400 },
    );
  }
  const month = monthResult.month!;

  // ─── 4. Resolve branch list ──────────────────────────────────────────
  const branchListResult = resolveCronBranchIds(requestedBranchIds);
  if (!branchListResult.ok) {
    return NextResponse.json(
      { ok: false, error: branchListResult.error },
      { status: branchListResult.status ?? 400 },
    );
  }
  const branchIds = branchListResult.branchIds!;

  // ─── 5. Audit START (fail-soft) ──────────────────────────────────────
  try {
    await writeAuditLog({
      action: 'monthly_summary_cron_rebuild',
      module: 'sales',
      userId: REQUESTED_BY,
      branchId: null,
      before: null,
      after: { status: 'started', month, branchIds },
      source: 'cron',
      details: { month, branchIds, status: 'started' },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[cron/rebuild-monthly-summary] start audit fail:', (err as Error)?.message);
  }

  // ─── 6. Run orchestrator (sequential, fail-fast) ─────────────────────
  let result: Awaited<ReturnType<typeof runMonthlySummaryCronRebuild>>;
  try {
    result = await runMonthlySummaryCronRebuild({
      month,
      branchIds,
      requestedBy: REQUESTED_BY,
      rebuildOne: rebuildMonthlySalesSummaryForBranch,
      delayMsBetweenBranches: CRON_DELAY_MS,
    });
  } catch (err) {
    // Orchestrator chỉ throw nếu rebuildOne ném exception KHÔNG được catch
    // (hiện code đã catch trong loop → branch trở thành failedBranch).
    // Fallback bảo vệ: log audit failure + 500.
    const msg = (err as Error)?.message ?? 'Unknown error';
    // eslint-disable-next-line no-console
    console.error('[cron/rebuild-monthly-summary] orchestrator throw:', msg);
    try {
      await writeAuditLog({
        action: 'monthly_summary_cron_rebuild',
        module: 'sales',
        userId: REQUESTED_BY,
        branchId: null,
        before: null,
        after: { status: 'failure', month, branchIds, error: msg.slice(0, 500) },
        source: 'cron',
        details: { month, branchIds, status: 'failure', error: msg.slice(0, 500) },
      });
    } catch {
      // silent
    }
    return NextResponse.json(
      { ok: false, error: 'Internal error', message: msg.slice(0, 500) },
      { status: 500 },
    );
  }

  // ─── 7. Audit END (fail-soft) ────────────────────────────────────────
  try {
    await writeAuditLog({
      action: 'monthly_summary_cron_rebuild',
      module: 'sales',
      userId: REQUESTED_BY,
      branchId: null,
      before: null,
      after: {
        status: result.ok ? 'success' : 'failure',
        month: result.month,
        branchIds,
        durationMs: result.durationMs,
        totalSourceTransactionCount: result.totalSourceTransactionCount,
        hasTruncatedBranch: result.hasTruncatedBranch,
        failedBranch: result.failedBranch ?? null,
      },
      source: 'cron',
      details: {
        month: result.month,
        branchCount: branchIds.length,
        succeededCount: result.branchResults.length,
        status: result.ok ? 'success' : 'failure',
        failedBranch: result.failedBranch ? result.failedBranch.branchId : null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[cron/rebuild-monthly-summary] end audit fail:', (err as Error)?.message);
  }

  // ─── 8. Response ─────────────────────────────────────────────────────
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

// GET explicit reject — KHÔNG cho trigger qua link/refresh accidental
export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'Method not allowed — chỉ POST với x-cron-secret' },
    { status: 405 },
  );
}
