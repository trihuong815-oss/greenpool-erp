// PR-SUMMARY-02-TYPES-AND-BUILDER (2026-06-29) — Pure builder for monthly
// materialized summary. KHÔNG side effect, KHÔNG gọi Firestore, KHÔNG async.
//
// Builder PHẢI KHỚP 100% với logic của /api/sales-v2/monthly-summary route
// (app/api/sales-v2/monthly-summary/route.ts L170-432) cho các field được hỗ
// trợ. Bất kỳ sai lệch nào sẽ làm parity tests fail.
//
// Logic match (verbatim từ route):
//   1. Filter: chỉ tx có reviewStatus === 'approved' vào aggregation
//   2. totals = sum tất cả approved tx (kể cả thanh_toan_not):
//      - sales = sum(packageValue)
//      - collected = sum(collectedToday)
//      - transactions = count
//      - debtGenerated = sum(originalDebt) CHỈ tx 'dat_coc'
//      - debtRemaining = sum(debt hiện tại) CHỈ tx 'dat_coc'
//   3. bySource + byPackage: CHỈ tx KHÔNG phải 'thanh_toan_not'
//      (vì nốt = thực thu cho tx cũ, không tạo doanh số mới)
//   4. PT (V6): CHỈ tx (!thanh_toan_not) && packageIsCustomQuantity === true
//   5. Promo (V7): CHỈ tx (!thanh_toan_not) && promoSnapshots.length > 0
//   6. customerCount: distinct key = 'p:${phoneRaw}' hoặc fallback
//      'n:${customerName}:${saleId}' nếu phoneRaw rỗng
//
// Extension (PR-02 mới):
//   - grossRevenue = sum(basePackageValue ?? packageValue)
//   - discountAmount = grossRevenue - finalRevenue (invariant)
//   - byTxnType = sum theo transactionType (ALL approved tx, không loại nốt)
//   - refundAmount = 0 (PR-REFUND-04 wire sau)
//   - netRevenue = finalRevenue - refundAmount

import type { BranchId } from '../branches';
import { isBranchId } from '../branches';
import type {
  SalesTransaction,
  SalesV2Source,
} from '../types/sales-v2';
import type {
  MonthlyBranchSalesSummary,
  MonthlySaleSalesSummary,
  MonthlySummaryBreakdownItem,
  MonthlyPackageSummaryItem,
  MonthlySummaryComputedBy,
} from '../types/monthly-summary';

// ─── Input/Output types ──────────────────────────────────────────────

export interface BuildMonthlySalesSummariesInput {
  /** YYYY-MM — caller pass (không suy luận từ tx để tránh inconsistency). */
  month: string;
  /** Danh sách tx INPUT (đã scope theo role server-side trước khi pass vào). */
  transactions: SalesTransaction[];
  /** Nguồn compute — default 'test_builder' cho safety. */
  computedBy?: MonthlySummaryComputedBy;
  /** True nếu caller biết input đã bị truncate (>= cap). */
  truncated?: boolean;
  /** True khi monthLock đã set + caller muốn finalize. */
  isFinalized?: boolean;
  /** Timestamp compute — caller pass (Date.now() hoặc Firestore Timestamp).
   *  null nếu test fixture không cần. */
  now?: unknown | null;
}

export interface BuildMonthlySalesSummariesResult {
  branchSummaries: MonthlyBranchSalesSummary[];
  saleSummaries: MonthlySaleSalesSummary[];
}

// ─── Internal mutable accumulators ───────────────────────────────────

interface BranchAcc {
  branchId: BranchId;
  branchName: string;
  transactionCount: number;
  customerKeys: Set<string>;
  grossRevenue: number;
  finalRevenue: number;
  collectedAmount: number;
  debtAmountAll: number;             // sum debt hiện tại của TẤT CẢ tx (cho future)
  debtGenerated: number;             // sum originalDebt CHỈ dat_coc
  debtRemaining: number;             // sum debt CHỈ dat_coc
  bySource: Record<string, MonthlySummaryBreakdownItem>;
  byPackage: Record<string, MonthlyPackageSummaryItem>;
  byTxnType: Record<string, MonthlySummaryBreakdownItem>;
  ptTransactionCount: number;
  ptSessionCount: number;
  ptRevenue: number;
  promoTransactionCount: number;
  promoDiscountAmount: number;
  promoBonusSessionCount: number;
  sourceTransactionCount: number;    // số tx (sau filter approved) thuộc branch này
}

interface SaleAcc {
  saleId: string;
  saleName: string;
  branchId: BranchId;
  branchName: string;
  transactionCount: number;
  customerKeys: Set<string>;
  grossRevenue: number;
  finalRevenue: number;
  collectedAmount: number;
  debtAmount: number;                // sum debt CHỈ dat_coc (giống route bySale logic — kept consistent)
  sourceTransactionCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Customer key — MATCH route line 254-256:
 *    if (phoneRaw) → 'p:${phoneRaw}'
 *    else → 'n:${customerName}:${saleId}' (fallback tránh underestimate) */
function customerKey(tx: SalesTransaction): string {
  const phoneRaw = String(tx.phone ?? '').trim();
  if (phoneRaw) return `p:${phoneRaw}`;
  return `n:${String(tx.customerName ?? '').trim()}:${String(tx.saleId ?? '')}`;
}

function ensureBranchAcc(map: Map<BranchId, BranchAcc>, tx: SalesTransaction): BranchAcc | null {
  const bid = tx.branchId;
  if (!bid || !isBranchId(bid)) return null;
  let acc = map.get(bid);
  if (!acc) {
    acc = {
      branchId: bid,
      branchName: String(tx.branchName ?? bid),
      transactionCount: 0,
      customerKeys: new Set(),
      grossRevenue: 0,
      finalRevenue: 0,
      collectedAmount: 0,
      debtAmountAll: 0,
      debtGenerated: 0,
      debtRemaining: 0,
      bySource: {},
      byPackage: {},
      byTxnType: {},
      ptTransactionCount: 0,
      ptSessionCount: 0,
      ptRevenue: 0,
      promoTransactionCount: 0,
      promoDiscountAmount: 0,
      promoBonusSessionCount: 0,
      sourceTransactionCount: 0,
    };
    map.set(bid, acc);
  }
  return acc;
}

function ensureSaleAcc(map: Map<string, SaleAcc>, tx: SalesTransaction): SaleAcc | null {
  const sid = String(tx.saleId ?? '');
  if (!sid) return null;
  const bid = tx.branchId;
  if (!bid || !isBranchId(bid)) return null;
  let acc = map.get(sid);
  if (!acc) {
    acc = {
      saleId: sid,
      saleName: String(tx.saleName ?? ''),
      branchId: bid,
      branchName: String(tx.branchName ?? bid),
      transactionCount: 0,
      customerKeys: new Set(),
      grossRevenue: 0,
      finalRevenue: 0,
      collectedAmount: 0,
      debtAmount: 0,
      sourceTransactionCount: 0,
    };
    map.set(sid, acc);
  }
  return acc;
}

function getOrInitBreakdown(map: Record<string, MonthlySummaryBreakdownItem>, key: string): MonthlySummaryBreakdownItem {
  let item = map[key];
  if (!item) {
    item = { count: 0, sales: 0, collected: 0 };
    map[key] = item;
  }
  return item;
}

function getOrInitPackage(
  map: Record<string, MonthlyPackageSummaryItem>,
  packageId: string,
  packageName: string,
): MonthlyPackageSummaryItem {
  let item = map[packageId];
  if (!item) {
    item = { packageId, packageName, count: 0, sales: 0, collected: 0 };
    map[packageId] = item;
  }
  return item;
}

// ─── Main builder ────────────────────────────────────────────────────

/**
 * Pure builder — build monthly summaries từ danh sách transactions.
 *
 * Pre-conditions (caller responsibility):
 *   - transactions đã scope đúng theo role (sale/qlcs/accountant/top filter ngoài builder)
 *   - month YYYY-MM consistent với tx.month
 *   - transactions KHÔNG mutate sau khi pass (builder không clone deep, chỉ iterate)
 *
 * Post-conditions:
 *   - Trả về 2 array đã sort theo branchId/saleId tăng dần
 *   - KHÔNG mutate input array
 *   - PURE — chạy 2 lần ra cùng kết quả
 *
 * Performance: O(N) với N = transactions.length. Memory O(unique branches +
 * unique sales + unique sources + unique packages + unique txnTypes).
 */
export function buildMonthlySalesSummariesFromTransactions(
  input: BuildMonthlySalesSummariesInput,
): BuildMonthlySalesSummariesResult {
  const {
    month,
    transactions,
    computedBy = 'test_builder',
    truncated = false,
    isFinalized = false,
    now = null,
  } = input;

  const branchMap = new Map<BranchId, BranchAcc>();
  const saleMap = new Map<string, SaleAcc>();

  // ─── Iterate transactions ────────────────────────────────────────
  for (const tx of transactions) {
    // MATCH route L250: chỉ approved mới vào aggregation
    if (tx.reviewStatus !== 'approved') continue;

    const pv = Number(tx.packageValue ?? 0);             // final (sau promo)
    const ct = Number(tx.collectedToday ?? 0);
    const debt = Number(tx.debtAmount ?? 0);
    // MATCH route L261: originalDebt fallback debt nếu doc cũ
    const originalDebt = Number(tx.originalDebt ?? debt);
    // grossRevenue = basePackageValue ?? packageValue (PR-02 extension)
    const basePv = Number((tx as unknown as { basePackageValue?: number }).basePackageValue ?? pv);

    const txType = String(tx.transactionType ?? '');
    const isThanhToanNot = txType === 'thanh_toan_not';
    const src = (tx.source ?? 'ca_nhan') as SalesV2Source;

    const branchAcc = ensureBranchAcc(branchMap, tx);
    const saleAcc = ensureSaleAcc(saleMap, tx);

    // ─── BRANCH ACC ────────────────────────────────────────────────
    if (branchAcc) {
      branchAcc.sourceTransactionCount += 1;
      branchAcc.transactionCount += 1;
      branchAcc.customerKeys.add(customerKey(tx));
      branchAcc.grossRevenue += basePv;
      branchAcc.finalRevenue += pv;
      branchAcc.collectedAmount += ct;
      branchAcc.debtAmountAll += debt;

      // MATCH route L311-314: chỉ dat_coc → debtGenerated/Remaining
      if (txType === 'dat_coc') {
        branchAcc.debtGenerated += originalDebt;
        branchAcc.debtRemaining += debt;
      }

      // MATCH route L347-364: bySource + byPackage CHỈ !thanh_toan_not
      if (!isThanhToanNot) {
        const srcItem = getOrInitBreakdown(branchAcc.bySource, src);
        srcItem.count += 1;
        srcItem.sales += pv;
        srcItem.collected += ct;

        const pid = String(tx.packageId ?? '');
        if (pid) {
          const pkgItem = getOrInitPackage(branchAcc.byPackage, pid, String(tx.packageName ?? ''));
          pkgItem.count += 1;
          pkgItem.sales += pv;
          pkgItem.collected += ct;
        }

        // MATCH route L367-383: PT V6 chỉ khi packageIsCustomQuantity === true
        if (tx.packageIsCustomQuantity === true) {
          const sessions = Number(tx.quantity ?? 0);
          branchAcc.ptTransactionCount += 1;
          branchAcc.ptSessionCount += sessions;
          branchAcc.ptRevenue += pv;
        }
      }

      // MATCH route L386-413: Promo V7 CHỈ !thanh_toan_not + có snaps
      if (!isThanhToanNot) {
        const snaps = Array.isArray(tx.promoSnapshots) ? tx.promoSnapshots : [];
        if (snaps.length > 0) {
          const txDiscount = Number((tx as unknown as { discountAmount?: number }).discountAmount ?? 0);
          const txBonusSessions = Number((tx as unknown as { bonusQuantity?: number }).bonusQuantity ?? 0);
          branchAcc.promoTransactionCount += 1;
          branchAcc.promoDiscountAmount += txDiscount;
          branchAcc.promoBonusSessionCount += txBonusSessions;
        }
      }

      // PR-02 extension: byTxnType — ALL approved tx (kể cả thanh_toan_not)
      // vì user muốn xem breakdown theo loại giao dịch
      if (txType) {
        const ttItem = getOrInitBreakdown(branchAcc.byTxnType, txType);
        ttItem.count += 1;
        ttItem.sales += pv;
        ttItem.collected += ct;
      }
    }

    // ─── SALE ACC (match route bySale L417-424: ALL approved tx) ───
    if (saleAcc) {
      saleAcc.sourceTransactionCount += 1;
      saleAcc.transactionCount += 1;
      saleAcc.customerKeys.add(customerKey(tx));
      saleAcc.grossRevenue += basePv;
      saleAcc.finalRevenue += pv;
      saleAcc.collectedAmount += ct;
      if (txType === 'dat_coc') {
        saleAcc.debtAmount += debt;
      }
    }
  }

  // ─── Build branch summaries ──────────────────────────────────────
  const branchSummaries: MonthlyBranchSalesSummary[] = Array.from(branchMap.values())
    .sort((a, b) => a.branchId.localeCompare(b.branchId))
    .map((acc) => {
      const finalRevenue = acc.finalRevenue;
      const refundAmount = 0; // PR-REFUND-04 wire sau
      return {
        id: `${month}_${acc.branchId}`,
        month,
        branchId: acc.branchId,
        branchName: acc.branchName,
        transactionCount: acc.transactionCount,
        uniqueCustomerCount: acc.customerKeys.size,
        grossRevenue: acc.grossRevenue,
        discountAmount: acc.grossRevenue - finalRevenue,
        finalRevenue,
        collectedAmount: acc.collectedAmount,
        debtAmount: acc.debtAmountAll,
        debtGenerated: acc.debtGenerated,
        debtRemaining: acc.debtRemaining,
        refundAmount,
        netRevenue: finalRevenue - refundAmount,
        bySource: acc.bySource,
        byPackage: acc.byPackage,
        byTxnType: acc.byTxnType,
        ptTransactionCount: acc.ptTransactionCount,
        ptSessionCount: acc.ptSessionCount,
        ptRevenue: acc.ptRevenue,
        promoTransactionCount: acc.promoTransactionCount,
        promoDiscountAmount: acc.promoDiscountAmount,
        promoBonusSessionCount: acc.promoBonusSessionCount,
        computedAt: now,
        computedBy,
        sourceTransactionCount: acc.sourceTransactionCount,
        truncated,
        isFinalized,
        updatedAt: now,
        schemaVersion: 1 as const,
      };
    });

  // ─── Build sale summaries ────────────────────────────────────────
  const saleSummaries: MonthlySaleSalesSummary[] = Array.from(saleMap.values())
    .sort((a, b) => a.saleId.localeCompare(b.saleId))
    .map((acc) => {
      const finalRevenue = acc.finalRevenue;
      const refundAmount = 0;
      return {
        id: `${month}_${acc.saleId}`,
        month,
        saleId: acc.saleId,
        saleName: acc.saleName,
        branchId: acc.branchId,
        branchName: acc.branchName,
        transactionCount: acc.transactionCount,
        uniqueCustomerCount: acc.customerKeys.size,
        grossRevenue: acc.grossRevenue,
        discountAmount: acc.grossRevenue - finalRevenue,
        finalRevenue,
        collectedAmount: acc.collectedAmount,
        debtAmount: acc.debtAmount,
        refundAmount,
        netRevenue: finalRevenue - refundAmount,
        computedAt: now,
        computedBy,
        sourceTransactionCount: acc.sourceTransactionCount,
        truncated,
        updatedAt: now,
        schemaVersion: 1 as const,
      };
    });

  return { branchSummaries, saleSummaries };
}
