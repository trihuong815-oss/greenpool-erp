// PR-SUMMARY-04B (2026-06-29) — Active month raw guard.
//
// Decision helper: should /api/sales-v2/monthly-summary serve from materialized
// summary or fall back to raw query?
//
// Problem (pre-04B):
//   PR-04 added summary fast path for qlcs/accountant/top+branchId scopes
//   whenever a valid summary doc exists. But materialized summary was rebuilt
//   at point-in-time T; if sale enters a new transaction at T+1 in the SAME
//   month, the summary becomes stale and dashboards show wrong totals.
//
// Fix (04B): for any month that may still receive new data, force RAW.
//
// "May still receive new data" rules:
//   - month === current VN month   (always open until month rolls over)
//   - month is NOT locked          (per sales-v2 month-lock feature; unlocked
//                                    months can still be edited even if past)
//
// Only when ALL conditions hold can summary be served:
//   - branch-scoped read (sale + top-all-branches stay raw — PR-04 baseline)
//   - branchId is a valid 5-cluster id
//   - requested month != current VN month
//   - month is locked (closed by TP_KE/CEO/CHU_TICH/ADMIN)
//
// Then the route still requires the summary doc to EXIST, schemaVersion=1, and
// truncated=false (PR-04 read-side guard). If any of those fail → raw fallback.
//
// This file is PURE — no Firestore. Caller fetches `isMonthLocked` and passes in.
// Easy to unit-test deterministically with injected currentMonth.

import { isBranchId } from '../branches';
import type { ScopeRole } from './scope';

/**
 * Why summary was rejected, or 'eligible' if the strategy approves.
 * Used as `_sourceReason` in API response for observability.
 */
export type SummaryReadReason =
  | 'eligible'              // strategy approves; summary read may still fall back if doc missing/truncated
  | 'sale-scope'            // sale role always raw (PR-04 baseline)
  | 'top-all-branches'      // top scope without branchId filter → always raw
  | 'invalid-branch'        // branchId missing or not in BRANCH_IDS
  | 'active-month'          // requested month === current VN month → must be raw
  | 'unlocked-month';       // historical month but not locked → may still receive edits

export interface SummaryReadStrategyInput {
  /** Requested month in `YYYY-MM` format. */
  requestedMonth: string;
  /** Current VN month in `YYYY-MM`. Caller computes via getCurrentAndPreviousMonth(). */
  currentMonth: string;
  /** Resolved scope role from getScopeRole(caller.profile.role_code). */
  scopeRole: ScopeRole;
  /** Server-enforced scope branchId (null = "all branches" for top role). */
  scopeBranchId: string | null;
  /** Whether `(scopeBranchId, requestedMonth)` is locked via sales-v2 month-lock.
   *  Caller computes via getMonthLockState; pass `false` if lookup fails (fail-safe = raw). */
  isMonthLocked: boolean;
}

export interface SummaryReadStrategyResult {
  /** `true` → route may attempt summary read. `false` → must use raw query. */
  useSummary: boolean;
  /** Reason for the decision. Always set, even when useSummary=true. */
  reason: SummaryReadReason;
}

/**
 * Decide whether the monthly-summary endpoint may serve from materialized summary.
 *
 * Conservative rules — order matters, returns at first reject:
 *   1. sale scope                  → raw
 *   2. top + no branchId           → raw
 *   3. missing/invalid branchId    → raw
 *   4. month === current VN month  → raw   (active month guard, PR-04B)
 *   5. month NOT locked            → raw   (unlocked-month guard, PR-04B)
 *   6. all guards pass             → useSummary=true (reason=eligible)
 *
 * Read-side guards (doc exists, schemaVersion=1, truncated=false) live in
 * tryReadMonthlyBranchSummary() and are NOT this helper's responsibility.
 */
export function getMonthlySummaryReadStrategy(
  input: SummaryReadStrategyInput,
): SummaryReadStrategyResult {
  if (input.scopeRole === 'sale') {
    return { useSummary: false, reason: 'sale-scope' };
  }
  if (input.scopeRole === 'top' && !input.scopeBranchId) {
    return { useSummary: false, reason: 'top-all-branches' };
  }
  if (!input.scopeBranchId || !isBranchId(input.scopeBranchId)) {
    return { useSummary: false, reason: 'invalid-branch' };
  }
  if (input.requestedMonth === input.currentMonth) {
    return { useSummary: false, reason: 'active-month' };
  }
  if (!input.isMonthLocked) {
    return { useSummary: false, reason: 'unlocked-month' };
  }
  return { useSummary: true, reason: 'eligible' };
}
