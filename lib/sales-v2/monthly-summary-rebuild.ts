// PR-SUMMARY-03-WRITE-REBUILD-JOB (2026-06-29) — Service rebuild monthly
// materialized summaries từ raw salesTransactions.
//
// Server-only — gọi từ admin endpoint hoặc cron. KHÔNG được import từ
// client/UI (sẽ throw runtime).
//
// Logic:
//   1. Query salesTransactions where(month=X, branchId=B, reviewStatus='approved')
//      → cần composite index (đã deploy PR-INDEX-PLAN-SALESTRANSACTIONS commit 41703cb)
//   2. Hard cap REBUILD_HARD_LIMIT = 20000 docs/branch/month — an toàn cho scale 10y
//      (1 branch lớn nhất hiện ~3000-4000 tx/tháng; 20K cushion 5x)
//   3. Pass transactions vào builder (PR-SUMMARY-02) → branchSummaries + saleSummaries
//   4. Overwrite full doc với set(merge:false) — idempotent
//   5. Write audit log mỗi rebuild
//
// KHÔNG đụng:
//   - Endpoint read /api/sales-v2/monthly-summary (PR-04 mới đổi)
//   - salesTransactions data
//   - UI /tong-ket

import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '../firebase/admin';
import { COLLECTIONS } from '../firebase/collections';
import { writeAuditLog } from '../firebase/audit-log';
import { BRANCH_IDS, isBranchId, type BranchId } from '../branches';
import { buildMonthlySalesSummariesFromTransactions } from './monthly-summary-builder';
import type { SalesTransaction } from '../types/sales-v2';
import type { MonthlySummaryComputedBy } from '../types/monthly-summary';

/** Hard cap an toàn — vượt cap → set truncated=true + audit warning. */
export const REBUILD_HARD_LIMIT = 20_000;

export class RebuildValidationError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
    this.name = 'RebuildValidationError';
  }
}

// ─── Validation helpers ──────────────────────────────────────────────

const MONTH_RE = /^\d{4}-\d{2}$/;

export function isValidMonth(month: string): boolean {
  return MONTH_RE.test(month);
}

export function assertValidMonth(month: string): void {
  if (!isValidMonth(month)) {
    throw new RebuildValidationError(400, `month không hợp lệ — cần YYYY-MM, nhận "${month}"`);
  }
}

export function assertValidBranchId(branchId: string): asserts branchId is BranchId {
  if (!isBranchId(branchId)) {
    throw new RebuildValidationError(
      400,
      `branchId không hợp lệ — cần một trong ${BRANCH_IDS.join('/')}, nhận "${branchId}"`,
    );
  }
}

// ─── Service types ───────────────────────────────────────────────────

export interface RebuildBranchInput {
  month: string;
  branchId: string;
  computedBy: 'manual_rebuild' | 'cron';
  requestedBy: string;
}

export interface RebuildBranchResult {
  month: string;
  branchId: BranchId;
  branchSummaryId: string;
  saleSummaryIds: string[];
  sourceTransactionCount: number;       // số tx INPUT (sau filter approved + month + branch)
  approvedTransactionCount: number;     // = sourceTransactionCount vì query đã filter approved
  truncated: boolean;
  durationMs: number;
}

export interface RebuildMonthInput {
  month: string;
  branchIds?: string[];                 // optional — default = all BRANCH_IDS
  computedBy: 'manual_rebuild' | 'cron';
  requestedBy: string;
}

export interface RebuildMonthResult {
  month: string;
  branchResults: RebuildBranchResult[];
  totalSourceTransactionCount: number;
  durationMs: number;
}

// ─── Core: rebuild 1 branch × 1 month ────────────────────────────────

/**
 * Rebuild monthly summaries cho 1 cặp (branch × month).
 *
 * Steps:
 *   1. Validate month + branchId
 *   2. Query salesTransactions where(month, branchId, reviewStatus='approved').limit(REBUILD_HARD_LIMIT)
 *   3. Build branchSummary + saleSummaries qua pure builder
 *   4. Write Firestore: 1 doc branch + N doc sale (sequential set, idempotent overwrite)
 *   5. Write audit log
 *
 * Fail-soft: nếu audit log write fail, KHÔNG block summary write — chỉ log warn.
 */
export async function rebuildMonthlySalesSummaryForBranch(
  input: RebuildBranchInput,
): Promise<RebuildBranchResult> {
  const t0 = Date.now();
  const { month, branchId: rawBranchId, computedBy, requestedBy } = input;

  assertValidMonth(month);
  assertValidBranchId(rawBranchId);
  const branchId: BranchId = rawBranchId;

  const db = getFirebaseAdminDb();

  // Query bounded by 3-field composite index (PR-INDEX-PLAN-SALESTRANSACTIONS).
  const snap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
    .where('month', '==', month)
    .where('branchId', '==', branchId)
    .where('reviewStatus', '==', 'approved')
    .limit(REBUILD_HARD_LIMIT)
    .get();

  const truncated = snap.size >= REBUILD_HARD_LIMIT;

  const transactions: SalesTransaction[] = snap.docs.map((d) => {
    const data = d.data();
    // Coerce id field — Firestore data() không tự include doc id
    return { ...(data as Record<string, unknown>), id: d.id } as unknown as SalesTransaction;
  });

  const now = Timestamp.now();
  const { branchSummaries, saleSummaries } = buildMonthlySalesSummariesFromTransactions({
    month,
    transactions,
    computedBy,
    truncated,
    isFinalized: false,                  // PR-04+ sẽ wire monthLock check
    now,
  });

  // Write branch summary (max 1 doc vì query đã filter 1 branch)
  let branchSummaryId = `${month}_${branchId}`;
  if (branchSummaries.length === 1) {
    const bs = branchSummaries[0];
    branchSummaryId = bs.id;
    await db.collection(COLLECTIONS.MONTHLY_BRANCH_SALES_SUMMARIES)
      .doc(branchSummaryId)
      .set(bs, { merge: false });        // overwrite full — idempotent
  } else if (branchSummaries.length === 0) {
    // No tx → write empty branch summary với counter = 0 để UI biết "đã rebuild, không có data"
    await db.collection(COLLECTIONS.MONTHLY_BRANCH_SALES_SUMMARIES)
      .doc(branchSummaryId)
      .set({
        id: branchSummaryId,
        month,
        branchId,
        branchName: branchId,             // placeholder vì 0 tx → không có snapshot name
        transactionCount: 0,
        uniqueCustomerCount: 0,
        grossRevenue: 0,
        discountAmount: 0,
        finalRevenue: 0,
        collectedAmount: 0,
        debtAmount: 0,
        debtGenerated: 0,
        debtRemaining: 0,
        refundAmount: 0,
        netRevenue: 0,
        bySource: {},
        byPackage: {},
        byTxnType: {},
        ptTransactionCount: 0,
        ptSessionCount: 0,
        ptRevenue: 0,
        promoTransactionCount: 0,
        promoDiscountAmount: 0,
        promoBonusSessionCount: 0,
        computedAt: now,
        computedBy,
        sourceTransactionCount: 0,
        truncated: false,
        isFinalized: false,
        updatedAt: now,
        schemaVersion: 1,
      }, { merge: false });
  }

  // Write sale summaries (N docs — mỗi sale 1 doc, sequential write OK vì N nhỏ <50 sale/branch)
  const saleSummaryIds: string[] = [];
  for (const ss of saleSummaries) {
    saleSummaryIds.push(ss.id);
    await db.collection(COLLECTIONS.MONTHLY_SALE_SALES_SUMMARIES)
      .doc(ss.id)
      .set(ss, { merge: false });
  }

  const durationMs = Date.now() - t0;
  const sourceTransactionCount = snap.size;

  // Audit log fail-soft — không block summary nếu fail
  try {
    await writeAuditLog({
      action: 'monthly_summary_rebuild',
      module: 'sales',
      userId: requestedBy,
      branchId,
      before: null,
      after: {
        branchSummaryId,
        saleSummaryCount: saleSummaryIds.length,
        sourceTransactionCount,
        truncated,
        durationMs,
        computedBy,
      },
      source: computedBy === 'cron' ? 'cron' : 'api',
      details: {
        month,
        branchId,
        sourceTransactionCount,
        truncated,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[monthly-summary-rebuild] audit write failed (non-blocking):', (err as Error)?.message);
  }

  return {
    month,
    branchId,
    branchSummaryId,
    saleSummaryIds,
    sourceTransactionCount,
    approvedTransactionCount: sourceTransactionCount,
    truncated,
    durationMs,
  };
}

// ─── Service: rebuild all branches × 1 month ─────────────────────────

/**
 * Rebuild monthly summaries cho TẤT CẢ branches trong 1 month.
 *
 * Sequential (không Promise.all) để tránh:
 *   - Spike Firestore reads/writes
 *   - Stale write conflict nếu chạy đồng thời
 *
 * Hiện 5 branches × ~50 sales = ~250 writes/run → vẫn fast (~10-30 giây).
 */
export async function rebuildMonthlySalesSummaryForMonth(
  input: RebuildMonthInput,
): Promise<RebuildMonthResult> {
  const t0 = Date.now();
  const { month, branchIds, computedBy, requestedBy } = input;

  assertValidMonth(month);

  // Default = all 5 branches; validate nếu caller pass subset
  const targets: BranchId[] = branchIds && branchIds.length > 0
    ? branchIds.map((b) => {
        assertValidBranchId(b);
        return b as BranchId;
      })
    : [...BRANCH_IDS];

  const branchResults: RebuildBranchResult[] = [];
  let totalSourceTransactionCount = 0;

  for (const branchId of targets) {
    const r = await rebuildMonthlySalesSummaryForBranch({
      month,
      branchId,
      computedBy,
      requestedBy,
    });
    branchResults.push(r);
    totalSourceTransactionCount += r.sourceTransactionCount;
  }

  return {
    month,
    branchResults,
    totalSourceTransactionCount,
    durationMs: Date.now() - t0,
  };
}

// ─── Helper: current + previous month (cho cron) ─────────────────────

/**
 * Trả [currentMonth, previousMonth] string YYYY-MM theo Asia/Ho_Chi_Minh.
 * Pure function — KHÔNG gọi Firestore. Cron handler dùng để chọn 2 tháng cần rebuild.
 */
export function getCurrentAndPreviousMonth(nowMs: number = Date.now()): { current: string; previous: string } {
  // Convert sang VN tz (+7) bằng cách add 7h offset
  const vn = new Date(nowMs + 7 * 60 * 60_000);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth() + 1; // 1-12
  const current = `${y}-${String(m).padStart(2, '0')}`;
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const previous = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  return { current, previous };
}

/**
 * Cron handler helper — rebuild current month + previous month cho tất cả branches.
 * Để PR-SUMMARY-03b/cron route dùng. PR-03 này KHÔNG schedule cron production
 * (chỉ expose function — caller route quyết định khi nào gọi).
 */
export async function rebuildCurrentAndPreviousMonthSummaries(input: {
  computedBy: 'cron';
  requestedBy: string;
}): Promise<{
  current: RebuildMonthResult;
  previous: RebuildMonthResult;
}> {
  const { current, previous } = getCurrentAndPreviousMonth();
  const currentResult = await rebuildMonthlySalesSummaryForMonth({
    month: current,
    computedBy: input.computedBy,
    requestedBy: input.requestedBy,
  });
  const previousResult = await rebuildMonthlySalesSummaryForMonth({
    month: previous,
    computedBy: input.computedBy,
    requestedBy: input.requestedBy,
  });
  return { current: currentResult, previous: previousResult };
}

// Re-export for callers
export type { MonthlySummaryComputedBy };
