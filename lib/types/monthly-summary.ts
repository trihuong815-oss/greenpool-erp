// PR-SUMMARY-02-TYPES-AND-BUILDER (2026-06-29) — Monthly materialized summary types.
//
// Phase scale 10 năm (5 cơ sở × 10K khách/cơ sở/năm = 500K khách/10 năm).
// Mục đích: thay thế việc /tong-ket query raw salesTransactions mỗi lần load
// (hiện cap 5000 tx/tháng, risk truncate khi 1 branch >5000 tx/month).
//
// PR-02 chỉ thêm TYPES + BUILDER pure function + parity tests. KHÔNG ghi
// Firestore, KHÔNG đụng API runtime, KHÔNG cron, KHÔNG admin endpoint.
//
// Roadmap:
//   - PR-03: cron rebuild job + admin endpoint write
//   - PR-04: /api/sales-v2/monthly-summary upgrade đọc từ summary trước, fallback raw
//   - PR-05: remove raw fallback khi summary stable >2 tuần
//
// schemaVersion = 1. Khi đổi schema → bump version + cron rebuild với version mới.

import type { BranchId } from '../branches';

/** Nguồn compute summary — phục vụ audit trail. */
export type MonthlySummaryComputedBy =
  | 'cron'                  // Cron daily rebuild
  | 'manual_rebuild'        // Admin endpoint POST /admin/rebuild-monthly-summary
  | 'on_demand_fallback'    // API GET fallback khi summary missing (chưa ghi Firestore)
  | 'test_builder';         // Vitest fixture (KHÔNG dùng cho production write)

/** Breakdown chuẩn dùng cho bySource + byTxnType. */
export interface MonthlySummaryBreakdownItem {
  count: number;
  sales: number;
  collected: number;
}

/** Breakdown per-package có thêm metadata gói. */
export interface MonthlyPackageSummaryItem {
  packageId: string;
  packageName: string;
  count: number;
  sales: number;
  collected: number;
}

/**
 * Summary cho 1 cặp (month × branch).
 * DocId pattern (cho Firestore — PR-03 wire): `${month}_${branchId}`.
 *
 * Tone semantic:
 *   - grossRevenue = sum(basePackageValue ?? packageValue) — trước promo
 *   - finalRevenue = sum(packageValue) — sau promo (= totals.sales hiện tại)
 *   - discountAmount = grossRevenue - finalRevenue (consistent invariant)
 *   - collectedAmount = sum(collectedToday) — thực thu
 *   - debtAmount = sum(debt hiện tại) — sau auto-link
 *   - debtGenerated = sum(originalDebt) chỉ tx dat_coc — snapshot không đổi
 *   - debtRemaining = sum(debt hiện tại) chỉ tx dat_coc — đồng nghĩa với debtAmount
 *     hiện tại trong route (kept separate cho consistency với SalesMonthlySummary cũ)
 *   - refundAmount = 0 trong PR-02 (chưa có refund workflow)
 *   - netRevenue = finalRevenue - refundAmount
 */
export interface MonthlyBranchSalesSummary {
  id: string;                                // ${month}_${branchId}
  month: string;                             // 'YYYY-MM'
  branchId: BranchId;
  branchName: string;                        // snapshot — không đổi khi đổi tên cơ sở

  transactionCount: number;
  uniqueCustomerCount: number;

  // Money — match logic route hiện tại
  grossRevenue: number;
  discountAmount: number;
  finalRevenue: number;
  collectedAmount: number;
  debtAmount: number;
  debtGenerated: number;
  debtRemaining: number;

  // Refund-ready (PR-REFUND-04 wire)
  refundAmount: number;
  netRevenue: number;

  // Breakdown — match route
  bySource: Record<string, MonthlySummaryBreakdownItem>;
  byPackage: Record<string, MonthlyPackageSummaryItem>;
  byTxnType: Record<string, MonthlySummaryBreakdownItem>;

  // PT module (V6 — gói buổi packageIsCustomQuantity)
  ptTransactionCount: number;
  ptSessionCount: number;
  ptRevenue: number;

  // Promo (V7)
  promoTransactionCount: number;
  promoDiscountAmount: number;
  promoBonusSessionCount: number;

  // Audit trail rebuild
  computedAt: unknown | null;
  computedBy: MonthlySummaryComputedBy;
  sourceTransactionCount: number;            // số tx INPUT (sau filter scope, trước filter approved)
  truncated: boolean;
  isFinalized: boolean;                      // true khi monthLock + recompute final
  updatedAt: unknown | null;

  schemaVersion: 1;
}

/**
 * Summary cho 1 cặp (month × sale).
 * DocId pattern: `${month}_${saleId}`.
 */
export interface MonthlySaleSalesSummary {
  id: string;                                // ${month}_${saleId}
  month: string;
  saleId: string;
  saleName: string;
  branchId: BranchId;
  branchName: string;

  transactionCount: number;
  uniqueCustomerCount: number;

  grossRevenue: number;
  discountAmount: number;
  finalRevenue: number;
  collectedAmount: number;
  debtAmount: number;

  refundAmount: number;
  netRevenue: number;

  // Target — PR-03 cron đọc từ salesTargets/${year}_${branchId}.staffTargets
  targetAmount?: number;
  achievementPercent?: number;

  computedAt: unknown | null;
  computedBy: MonthlySummaryComputedBy;
  sourceTransactionCount: number;
  truncated: boolean;
  updatedAt: unknown | null;

  schemaVersion: 1;
}
