// PR-SUMMARY-04-READ-FROM-SUMMARY-FALLBACK-RAW (2026-06-29) — Helpers đọc
// monthly materialized summary và map sang response shape của route
// /api/sales-v2/monthly-summary.
//
// Server-only. KHÔNG ghi Firestore. KHÔNG mutate. Pure read + map.
//
// Strategy (PR-04 conservative):
//   - CHỈ activated cho qlcs/accountant scope (1 branch xác định)
//   - top scope (all branches OR with branchId filter) + sale scope → fallback raw
//   - Summary path build totals/bySource/byPackage/byTxnType/pt/promo từ summary
//   - Dynamic fields (salesCustomers, adHocSummary, batchStats, txStatusStats)
//     vẫn query raw cap 5000 trong route handler
//
// Mapping debt fields (PR-SUMMARY-03A FIX):
//   - UI "Công nợ phát sinh" ← summary.debtGenerated
//   - UI "Công nợ còn lại"   ← summary.debtRemaining
//   - TUYỆT ĐỐI KHÔNG dùng debtAmount (field đã remove khỏi schema PR-03A)

import 'server-only';
import { getFirebaseAdminDb } from '../firebase/admin';
import { COLLECTIONS } from '../firebase/collections';
import { isBranchId, type BranchId } from '../branches';
import type { ScopeRole } from './scope';
import type {
  MonthlyBranchSalesSummary,
  MonthlySaleSalesSummary,
} from '../types/monthly-summary';

// ─── Eligibility check ───────────────────────────────────────────────

/**
 * Quyết định có dùng summary path không.
 *
 * PR-04 conservative: chỉ true cho `qlcs` + `accountant` (1 branch xác định).
 * Future PR-05 sẽ mở rộng cho `top` + `sale` sau khi prove stable.
 *
 * @param role — scope role từ getScopeRole(caller.profile.role_code)
 * @param scopeBranchId — branch caller được phép xem (đã enforce server-side)
 */
export function canUseSummaryForScope(
  role: ScopeRole,
  scopeBranchId: string | null,
): boolean {
  // Sale scope: skip (chưa support sale summary path trong PR-04)
  if (role === 'sale') return false;
  // Top scope all branches: skip (cần aggregate N branch summaries, defer PR-05)
  if (role === 'top' && !scopeBranchId) return false;
  // qlcs/accountant: must have scopeBranchId
  // top with branchId filter: cũng có scopeBranchId
  if (!scopeBranchId || !isBranchId(scopeBranchId)) return false;
  return true;
}

// ─── Summary read helpers ────────────────────────────────────────────

/**
 * Read 1 branch summary doc. Trả null nếu không exist hoặc invalid.
 *
 * Validation:
 *   - exists
 *   - schemaVersion === 1
 *   - month === requestedMonth
 *   - branchId === requestedBranchId
 *   - truncated === false (truncated summary KHÔNG đáng tin)
 */
export async function tryReadMonthlyBranchSummary(
  month: string,
  branchId: BranchId,
): Promise<MonthlyBranchSalesSummary | null> {
  try {
    const db = getFirebaseAdminDb();
    const docId = `${month}_${branchId}`;
    const snap = await db.collection(COLLECTIONS.MONTHLY_BRANCH_SALES_SUMMARIES).doc(docId).get();
    if (!snap.exists) return null;
    const data = snap.data() as MonthlyBranchSalesSummary | undefined;
    if (!data) return null;
    if (data.schemaVersion !== 1) return null;
    if (data.month !== month) return null;
    if (data.branchId !== branchId) return null;
    if (data.truncated === true) return null; // partial summary KHÔNG dùng
    return data;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[monthly-summary-reader] read branch fail:', (err as Error)?.message);
    return null;
  }
}

/**
 * Read tất cả sale summaries của 1 branch + month.
 * Cần composite index (month + branchId) trên collection monthlySaleSalesSummaries.
 *
 * Trade-off: nếu index chưa có → query fail, trả empty array (fallback raw).
 */
export async function tryReadMonthlySaleSummariesForBranch(
  month: string,
  branchId: BranchId,
): Promise<MonthlySaleSalesSummary[]> {
  try {
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.MONTHLY_SALE_SALES_SUMMARIES)
      .where('month', '==', month)
      .where('branchId', '==', branchId)
      .limit(100) // an toàn: cap 100 sales/branch/month — hiện chỉ ~5-10 sales/branch
      .get();
    return snap.docs
      .map((d) => d.data() as MonthlySaleSalesSummary)
      .filter((s) => s.schemaVersion === 1 && s.month === month && s.branchId === branchId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[monthly-summary-reader] read sale summaries fail:', (err as Error)?.message);
    return [];
  }
}

// ─── Mappers — summary → response shape ──────────────────────────────

/**
 * Map branch summary → totals shape của route response.
 *
 * MATCH route line 670-672:
 *   totals = { sales, collected, debtGenerated, debtRemaining, transactions }
 *
 * BẮT BUỘC dùng debtGenerated + debtRemaining (PR-SUMMARY-03A fix).
 * KHÔNG bao giờ dùng summary.debtAmount (field đã remove).
 */
export function mapBranchSummaryToTotals(summary: MonthlyBranchSalesSummary): {
  sales: number;
  collected: number;
  debtGenerated: number;
  debtRemaining: number;
  transactions: number;
} {
  return {
    sales: summary.finalRevenue,
    collected: summary.collectedAmount,
    debtGenerated: summary.debtGenerated,
    debtRemaining: summary.debtRemaining,
    transactions: summary.transactionCount,
  };
}

/**
 * Map sale summaries → bySale shape của route.
 * Route shape: Record<saleId, { name, count, sales, collected }>
 */
export function mapSaleSummariesToBySale(
  saleSummaries: MonthlySaleSalesSummary[],
): Record<string, { name: string; count: number; sales: number; collected: number }> {
  const out: Record<string, { name: string; count: number; sales: number; collected: number }> = {};
  for (const s of saleSummaries) {
    out[s.saleId] = {
      name: s.saleName,
      count: s.transactionCount,
      sales: s.finalRevenue,
      collected: s.collectedAmount,
    };
  }
  return out;
}

/**
 * Map prevMonth from summary read.
 * MATCH route prevMonth shape: { month, totals: { sales, collected, debtGenerated,
 *   debtRemaining, transactions }, customerCount }
 *
 * Trả null nếu prev summary không có hoặc invalid (UI fallback ẩn MoM delta).
 */
export function mapBranchSummaryToPrevMonth(
  summary: MonthlyBranchSalesSummary | null,
): {
  month: string;
  totals: { sales: number; collected: number; debtGenerated: number; debtRemaining: number; transactions: number };
  customerCount: number;
} | null {
  if (!summary) return null;
  return {
    month: summary.month,
    totals: mapBranchSummaryToTotals(summary),
    customerCount: summary.uniqueCustomerCount,
  };
}

// ─── Re-export for tests ─────────────────────────────────────────────

export type { MonthlyBranchSalesSummary, MonthlySaleSalesSummary };
