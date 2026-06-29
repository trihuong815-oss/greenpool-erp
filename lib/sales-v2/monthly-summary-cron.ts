// PR-SUMMARY-05-CRON-SAFE-ENDPOINT-NO-SCHEDULE (2026-06-29) — Pure helpers cho
// cron endpoint rebuild monthly summary. KHÔNG schedule cron trong PR này.
//
// Tách helper khỏi route handler để:
//   - Unit test trực tiếp (không cần NextRequest)
//   - Route handler chỉ là thin wrapper parse req → gọi helper → trả JSON
//
// Server-only sẽ apply cho callers — file này CHỈ chứa pure logic + types.
// KHÔNG import Firestore ở đây — orchestrator nhận rebuild function qua DI để test.

import { BRANCH_IDS, isBranchId, type BranchId } from '../branches';
import {
  isValidMonth,
  getCurrentAndPreviousMonth,
  type RebuildBranchResult,
} from './monthly-summary-rebuild';

// ─── Secret validation ───────────────────────────────────────────────

export type CronAuthReason =
  | 'missing-env'      // env MONTHLY_SUMMARY_CRON_SECRET chưa cấu hình → 503
  | 'missing-header'   // request thiếu header x-cron-secret → 401
  | 'wrong-secret'     // header có nhưng không khớp → 403
  | null;              // ok

export interface CronAuthResult {
  ok: boolean;
  reason: CronAuthReason;
  status: number;      // HTTP status để route trả
  message: string;
}

/**
 * Validate cron secret theo policy PR-05:
 *   1. Env chưa cấu hình → ok=false, status=503 (cron disabled — tuyệt đối không chạy)
 *   2. Header thiếu     → ok=false, status=401
 *   3. Header sai       → ok=false, status=403
 *   4. Header khớp      → ok=true, status=200
 *
 * Dùng timing-safe compare để tránh leak length qua timing.
 * timingSafeEqual cần 2 buffer cùng length → check length trước.
 */
export function validateCronSecret(
  headerValue: string | null,
  envValue: string | undefined,
): CronAuthResult {
  // Rule 1 — env chưa cấu hình
  if (!envValue || envValue.length === 0) {
    return {
      ok: false,
      reason: 'missing-env',
      status: 503,
      message: 'Cron disabled — MONTHLY_SUMMARY_CRON_SECRET chưa cấu hình',
    };
  }

  // Rule 2 — header thiếu
  if (!headerValue || headerValue.length === 0) {
    return {
      ok: false,
      reason: 'missing-header',
      status: 401,
      message: 'Thiếu header x-cron-secret',
    };
  }

  // Rule 3 — so sánh length trước (length leak là known acceptable)
  if (headerValue.length !== envValue.length) {
    return {
      ok: false,
      reason: 'wrong-secret',
      status: 403,
      message: 'Secret không hợp lệ',
    };
  }

  // Rule 4 — timing-safe byte compare. So sánh char-by-char với XOR-or pattern
  // để tránh early-exit. (Node crypto.timingSafeEqual chỉ dùng được trong route
  // — helper pure dùng manual loop để test được trong vitest node env.)
  let diff = 0;
  for (let i = 0; i < envValue.length; i++) {
    diff |= headerValue.charCodeAt(i) ^ envValue.charCodeAt(i);
  }
  if (diff !== 0) {
    return {
      ok: false,
      reason: 'wrong-secret',
      status: 403,
      message: 'Secret không hợp lệ',
    };
  }

  return {
    ok: true,
    reason: null,
    status: 200,
    message: 'OK',
  };
}

// ─── Month resolution ────────────────────────────────────────────────

export interface ResolveCronMonthInput {
  /** body.month — optional. Nếu không truyền → default = current month. */
  requestedMonth?: string;
  /** Inject for test. Default = Date.now(). */
  nowMs?: number;
}

export interface ResolveCronMonthResult {
  ok: boolean;
  month?: string;
  /** 400 nếu invalid; chỉ set khi ok=false. */
  status?: number;
  error?: string;
}

/**
 * Resolve month cho cron rebuild theo policy PR-05:
 *   - KHÔNG truyền → default = current month (VN tz)
 *   - Truyền sai format → 400
 *   - Truyền month không phải current/previous → 400 (an toàn, tránh rebuild
 *     tháng cũ quá xa qua cron — phải dùng admin endpoint manual)
 *
 * Lý do giới hạn current/previous:
 *   - Cron mặc định chỉ cần rebuild 2 tháng gần nhất
 *   - Tháng cũ hơn = data đã finalize, rebuild qua admin tool có audit người chịu trách nhiệm
 *   - Tránh accident rebuild 12 tháng cũ → spike read
 */
export function resolveCronMonth(input: ResolveCronMonthInput): ResolveCronMonthResult {
  const nowMs = input.nowMs ?? Date.now();
  const { current, previous } = getCurrentAndPreviousMonth(nowMs);

  // Default = current
  if (input.requestedMonth === undefined || input.requestedMonth === '') {
    return { ok: true, month: current };
  }

  if (typeof input.requestedMonth !== 'string') {
    return {
      ok: false,
      status: 400,
      error: 'month phải là chuỗi YYYY-MM',
    };
  }

  if (!isValidMonth(input.requestedMonth)) {
    return {
      ok: false,
      status: 400,
      error: `month không hợp lệ — cần YYYY-MM, nhận "${input.requestedMonth}"`,
    };
  }

  if (input.requestedMonth !== current && input.requestedMonth !== previous) {
    return {
      ok: false,
      status: 400,
      error: `cron chỉ cho phép current (${current}) hoặc previous (${previous}) — nhận "${input.requestedMonth}". Dùng /api/admin/rebuild-monthly-summary cho tháng cũ.`,
    };
  }

  return { ok: true, month: input.requestedMonth };
}

// ─── Branch list resolution ──────────────────────────────────────────

/**
 * Resolve branch list cho cron rebuild.
 *
 * - Không truyền → all 5 BRANCH_IDS
 * - Truyền subset → validate từng id, error nếu bất kỳ id invalid
 *
 * KHÔNG hardcode list — đọc từ lib/branches.ts (single source of truth).
 */
export function resolveCronBranchIds(input?: string[]): {
  ok: boolean;
  branchIds?: BranchId[];
  status?: number;
  error?: string;
} {
  if (!input || input.length === 0) {
    return { ok: true, branchIds: [...BRANCH_IDS] };
  }
  const validated: BranchId[] = [];
  for (const id of input) {
    if (!isBranchId(id)) {
      return {
        ok: false,
        status: 400,
        error: `branchId không hợp lệ — nhận "${id}". Hợp lệ: ${BRANCH_IDS.join('/')}`,
      };
    }
    validated.push(id);
  }
  return { ok: true, branchIds: validated };
}

// ─── Orchestrator ────────────────────────────────────────────────────

export interface CronRebuildOrchestratorInput {
  month: string;
  branchIds: BranchId[];
  requestedBy: string;
  /** Inject rebuild function — production = rebuildMonthlySalesSummaryForBranch. */
  rebuildOne: (input: {
    month: string;
    branchId: BranchId;
    computedBy: 'cron';
    requestedBy: string;
  }) => Promise<RebuildBranchResult>;
  /** Inject Date.now for test reproducibility. */
  nowMs?: () => number;
  /** Optional delay giữa branches (ms). Default 0 (test không delay). */
  delayMsBetweenBranches?: number;
  /** Inject sleep cho test. Default = setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

export interface CronRebuildOrchestratorResult {
  ok: boolean;
  month: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  branchResults: RebuildBranchResult[];
  totalSourceTransactionCount: number;
  hasTruncatedBranch: boolean;
  warnings: string[];
  /** Set khi fail-fast — branch dừng sequence. */
  failedBranch?: {
    branchId: BranchId;
    error: string;
  };
}

/**
 * Orchestrator chạy rebuild tuần tự cho danh sách branch.
 *
 * Behavior:
 *   - for...of tuần tự (KHÔNG Promise.all)
 *   - Fail-fast: branch thứ N fail → dừng ngay, không chạy N+1 trở đi
 *   - Truncated: KHÔNG dừng — vẫn ok nhưng push vào warnings + hasTruncatedBranch=true
 *   - Delay giữa branches (optional) để giảm pressure Firestore
 *
 * Trả về object đầy đủ để route render JSON response.
 */
export async function runMonthlySummaryCronRebuild(
  input: CronRebuildOrchestratorInput,
): Promise<CronRebuildOrchestratorResult> {
  const now = input.nowMs ?? Date.now;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const delay = Math.max(0, input.delayMsBetweenBranches ?? 0);

  const startedAt = now();
  const branchResults: RebuildBranchResult[] = [];
  let totalSourceTransactionCount = 0;
  let hasTruncatedBranch = false;
  const warnings: string[] = [];

  for (let i = 0; i < input.branchIds.length; i++) {
    const branchId = input.branchIds[i];

    try {
      const r = await input.rebuildOne({
        month: input.month,
        branchId,
        computedBy: 'cron',
        requestedBy: input.requestedBy,
      });
      branchResults.push(r);
      totalSourceTransactionCount += r.sourceTransactionCount;
      if (r.truncated) {
        hasTruncatedBranch = true;
        warnings.push(
          `Branch ${branchId} truncated — vượt cap rebuild (${r.sourceTransactionCount} tx). Cần tăng REBUILD_HARD_LIMIT hoặc shard.`,
        );
      }
    } catch (err) {
      const finishedAt = now();
      const msg = (err as Error)?.message ?? String(err);
      return {
        ok: false,
        month: input.month,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        branchResults,
        totalSourceTransactionCount,
        hasTruncatedBranch,
        warnings,
        failedBranch: { branchId, error: msg },
      };
    }

    // Delay giữa branches (skip sau branch cuối)
    if (delay > 0 && i < input.branchIds.length - 1) {
      await sleep(delay);
    }
  }

  const finishedAt = now();
  return {
    ok: true,
    month: input.month,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    branchResults,
    totalSourceTransactionCount,
    hasTruncatedBranch,
    warnings,
  };
}
