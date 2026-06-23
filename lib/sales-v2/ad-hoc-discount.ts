// PR-PROMO2-B (2026-06-23) — Detect + summary ad-hoc discount tx.
//
// Pure helper — compute on-read (KHÔNG ghi data). Caller (monthly-summary API)
// fetch packages map theo packageId distinct rồi enrich.
//
// Status enum:
//   AD_HOC          — actual < baseline + NO official promo → flag
//   NORMAL_PRICE    — actual >= baseline → không flag
//   OFFICIAL_PROMO  — actual < baseline NHƯNG có promoSnapshots → vào báo cáo KM official
//   SKIP_PAYMENT    — transactionType=thanh_toan_not (thanh toán nợ, không phải bán mới)
//   SKIP_MANUAL     — package.manualPriceWithQuantity (Sale tự định giá theo nghiệp vụ)
//   UNKNOWN_BASELINE — thiếu defaultPrice/defaultUnitPrice/quantity → không có chuẩn so

import type { BranchId } from '@/lib/branches';
import {
  classifyAdHoc,
  AD_HOC_CLASSIFICATION_PRIORITY,
  type AdHocClassification,
} from './ad-hoc-thresholds';

// ─── Types ──────────────────────────────────────────────────────────────

export type AdHocStatus =
  | 'AD_HOC'
  | 'NORMAL_PRICE'
  | 'OFFICIAL_PROMO'
  | 'SKIP_PAYMENT'
  | 'SKIP_MANUAL'
  | 'UNKNOWN_BASELINE';

/** Tx input shape (subset từ SalesTransaction — chỉ field cần). */
export interface AdHocTxInput {
  id: string;
  date: string;
  branchId: BranchId;
  saleId: string;
  saleName: string;
  customerName?: string | null;
  phone?: string | null;
  packageId: string;
  packageName?: string;
  transactionType?: string;
  packageValue?: number;
  basePackageValue?: number;
  quantity?: number | null;
  unitPrice?: number | null;
  promoSnapshots?: unknown[];
  packageIsCustomQuantity?: boolean;
  packageManualPriceWithQty?: boolean;
  packageUnitName?: string;
  reviewStatus?: string;
  note?: string | null;
}

/** Package input shape (subset từ Package). */
export interface AdHocPackageInput {
  id: string;
  defaultPrice?: number;
  defaultUnitPrice?: number;
  isCustomQuantity?: boolean;
  manualPriceWithQuantity?: boolean;
}

/** Batch context (truyền vào để enrich batchStatus per tx). */
export interface AdHocBatchInput {
  id: string;
  status?: string;
}

/** Kết quả detect cho 1 tx — discriminated union theo status. */
export type AdHocDetectResult =
  | {
      status: 'AD_HOC';
      baseline: number;
      actual: number;
      adHocAmount: number;
      adHocPercent: number;
      classification: AdHocClassification;
    }
  | { status: 'NORMAL_PRICE'; baseline: number; actual: number }
  | { status: 'OFFICIAL_PROMO' }
  | { status: 'SKIP_PAYMENT' }
  | { status: 'SKIP_MANUAL' }
  | { status: 'UNKNOWN_BASELINE'; reason: string };

/** 1 row trong items list — trả về API → UI render. */
export interface AdHocDiscountItem {
  txId: string;
  date: string;
  branchId: BranchId;
  saleId: string;
  saleName: string;
  customerName: string;
  phone: string;
  packageId: string;
  packageName: string;
  baseline: number;
  actual: number;
  adHocAmount: number;
  adHocPercent: number;
  classification: AdHocClassification;
  transactionType: string;
  reviewStatus: string;
  batchStatus: string;
  note: string | null;
}

interface ClassificationBucket {
  count: number;
  amount: number;
}

export interface AdHocSummary {
  totals: {
    transactionsCount: number;       // tổng tx có actual < baseline (mọi classification)
    totalAdHocAmount: number;        // tổng chênh lệch
    unknownBaselineCount: number;
    skipManualCount: number;
    skipPaymentCount: number;
    officialPromoCount: number;      // tx official promo (count info, KHÔNG vào totals)
  };
  byClassification: {
    NORMAL: ClassificationBucket;
    LOW: ClassificationBucket;
    REVIEW: ClassificationBucket;
    HIGH_RISK: ClassificationBucket;
  };
  topBranches: Array<{ branchId: BranchId; count: number; amount: number }>;
  topSales: Array<{ saleId: string; saleName: string; count: number; amount: number }>;
  items: AdHocDiscountItem[];
  truncated: boolean;
  totalItemsBeforeCap: number;
  tradeOffNote: string;
}

// ─── Detect ─────────────────────────────────────────────────────────────

/** Detect 1 tx có ad-hoc discount hay không.
 *  CHỐT logic 2026-06-23: skip thanh_toan_not + manual mode, official promo
 *  thắng (KHÔNG flag ad-hoc), thiếu baseline → UNKNOWN. */
export function detectAdHocDiscount(
  tx: AdHocTxInput,
  pkg: AdHocPackageInput | null | undefined,
): AdHocDetectResult {
  // 1. Skip thanh_toan_not (thanh toán nợ — không phải bán gói mới)
  if (tx.transactionType === 'thanh_toan_not') {
    return { status: 'SKIP_PAYMENT' };
  }

  // 2. Skip manual mode (Sale tự định giá theo nghiệp vụ — HB CLB Kid/Aqua)
  // Check cả pkg.manualPriceWithQuantity (fresh) và tx.packageManualPriceWithQty (snapshot).
  // Snapshot wins nếu package bị admin đổi sau khi tx tạo.
  const isManual = (tx.packageManualPriceWithQty === true)
    || (pkg?.manualPriceWithQuantity === true);
  if (isManual) {
    return { status: 'SKIP_MANUAL' };
  }

  // 3. Resolve isPT mode (snapshot wins, fallback pkg fresh)
  const isPT = (tx.packageIsCustomQuantity === true) || (pkg?.isCustomQuantity === true);

  // 4. Compute baseline theo mode
  let baseline = 0;
  if (isPT) {
    // PT: baseline = defaultUnitPrice × quantity
    if (!pkg?.defaultUnitPrice || pkg.defaultUnitPrice <= 0) {
      return { status: 'UNKNOWN_BASELINE', reason: 'Gói PT chưa có defaultUnitPrice' };
    }
    if (tx.quantity == null || tx.quantity <= 0) {
      return { status: 'UNKNOWN_BASELINE', reason: 'Tx PT thiếu quantity' };
    }
    baseline = pkg.defaultUnitPrice * tx.quantity;
  } else {
    // Gói thường: baseline = defaultPrice
    if (!pkg?.defaultPrice || pkg.defaultPrice <= 0) {
      return { status: 'UNKNOWN_BASELINE', reason: 'Gói thường chưa có defaultPrice' };
    }
    baseline = pkg.defaultPrice;
  }

  // 5. Actual = basePackageValue (giá TRƯỚC promo discount)
  // Note: tx.packageValue = base - discount, KHÔNG dùng cho so baseline.
  // Lý do: nếu tx có official promo + giảm tay → packageValue đã trừ promo discount,
  // so basePackageValue mới reflect "giá Sale nhập trước promo".
  const actual = Number(tx.basePackageValue ?? 0);
  if (!Number.isFinite(actual) || actual < 0) {
    return { status: 'UNKNOWN_BASELINE', reason: 'Tx basePackageValue không hợp lệ' };
  }

  // 6. Actual >= baseline → KHÔNG ad-hoc (Sale bán đúng/cao hơn)
  if (actual >= baseline) {
    return { status: 'NORMAL_PRICE', baseline, actual };
  }

  // 7. Có official promo → đưa vào báo cáo KM official, KHÔNG flag ad-hoc
  const hasOfficialPromo = Array.isArray(tx.promoSnapshots) && tx.promoSnapshots.length > 0;
  if (hasOfficialPromo) {
    return { status: 'OFFICIAL_PROMO' };
  }

  // 8. AD_HOC detected
  const adHocAmount = baseline - actual;
  const adHocPercent = (adHocAmount / baseline) * 100;
  return {
    status: 'AD_HOC',
    baseline,
    actual,
    adHocAmount,
    adHocPercent,
    classification: classifyAdHoc(adHocPercent),
  };
}

// ─── Build summary ───────────────────────────────────────────────────────

const MAX_ITEMS = 200;
const TOP_BRANCHES = 5;
const TOP_SALES = 10;

const TRADE_OFF_NOTE =
  'Compute on-read theo giá chuẩn hiện tại. Nếu admin đổi giá gói sau khi bán, kết quả lịch sử có thể thay đổi.';

/** Aggregate ad-hoc detect results thành summary. Caller (API) truyền tx[] đã filter
 *  scope role (top/qlcs/accountant/sale) + packages map đã fetch. */
export function buildAdHocSummary(
  transactions: AdHocTxInput[],
  packagesMap: Map<string, AdHocPackageInput>,
  batchStatusMap: Map<string, string>,
): AdHocSummary {
  const empty: ClassificationBucket = { count: 0, amount: 0 };
  const byClassification = {
    NORMAL:    { ...empty },
    LOW:       { ...empty },
    REVIEW:    { ...empty },
    HIGH_RISK: { ...empty },
  };
  const totals = {
    transactionsCount: 0,
    totalAdHocAmount: 0,
    unknownBaselineCount: 0,
    skipManualCount: 0,
    skipPaymentCount: 0,
    officialPromoCount: 0,
  };
  const branchAgg = new Map<BranchId, { count: number; amount: number }>();
  const saleAgg = new Map<string, { saleName: string; count: number; amount: number }>();
  const adHocItems: AdHocDiscountItem[] = [];

  for (const tx of transactions) {
    const pkg = packagesMap.get(tx.packageId);
    const result = detectAdHocDiscount(tx, pkg);

    switch (result.status) {
      case 'SKIP_PAYMENT':    totals.skipPaymentCount++; continue;
      case 'SKIP_MANUAL':     totals.skipManualCount++; continue;
      case 'OFFICIAL_PROMO':  totals.officialPromoCount++; continue;
      case 'NORMAL_PRICE':    continue;
      case 'UNKNOWN_BASELINE': totals.unknownBaselineCount++; continue;
      case 'AD_HOC':
        // Counted (mọi classification including NORMAL)
        totals.transactionsCount++;
        totals.totalAdHocAmount += result.adHocAmount;

        const c = byClassification[result.classification];
        c.count++;
        c.amount += result.adHocAmount;

        // Top branches/sales
        const b = branchAgg.get(tx.branchId) ?? { count: 0, amount: 0 };
        b.count++;
        b.amount += result.adHocAmount;
        branchAgg.set(tx.branchId, b);

        const s = saleAgg.get(tx.saleId) ?? { saleName: tx.saleName, count: 0, amount: 0 };
        s.count++;
        s.amount += result.adHocAmount;
        saleAgg.set(tx.saleId, s);

        // Item row
        adHocItems.push({
          txId: tx.id,
          date: tx.date,
          branchId: tx.branchId,
          saleId: tx.saleId,
          saleName: tx.saleName,
          customerName: tx.customerName ?? '',
          phone: tx.phone ?? '',
          packageId: tx.packageId,
          packageName: tx.packageName ?? '',
          baseline: result.baseline,
          actual: result.actual,
          adHocAmount: result.adHocAmount,
          adHocPercent: result.adHocPercent,
          classification: result.classification,
          transactionType: tx.transactionType ?? '',
          reviewStatus: tx.reviewStatus ?? '',
          batchStatus: batchStatusMap.get(tx.id) ?? '',
          note: tx.note ?? null,
        });
        break;
    }
  }

  // Sort items: HIGH_RISK trước → REVIEW → LOW → NORMAL; tie-break adHocAmount DESC; tie-break date DESC
  adHocItems.sort((a, b) => {
    const pa = AD_HOC_CLASSIFICATION_PRIORITY[a.classification];
    const pb = AD_HOC_CLASSIFICATION_PRIORITY[b.classification];
    if (pa !== pb) return pa - pb;
    if (a.adHocAmount !== b.adHocAmount) return b.adHocAmount - a.adHocAmount;
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });

  const totalItemsBeforeCap = adHocItems.length;
  const truncated = totalItemsBeforeCap > MAX_ITEMS;
  const cappedItems = truncated ? adHocItems.slice(0, MAX_ITEMS) : adHocItems;

  // Top branches/sales (sort amount DESC)
  const topBranches = Array.from(branchAgg.entries())
    .map(([branchId, v]) => ({ branchId, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP_BRANCHES);

  const topSales = Array.from(saleAgg.entries())
    .map(([saleId, v]) => ({ saleId, saleName: v.saleName, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP_SALES);

  return {
    totals,
    byClassification,
    topBranches,
    topSales,
    items: cappedItems,
    truncated,
    totalItemsBeforeCap,
    tradeOffNote: TRADE_OFF_NOTE,
  };
}

// Re-export constants for caller convenience
export { AD_HOC_THRESHOLDS, AD_HOC_CLASSIFICATION_LABELS, AD_HOC_CLASSIFICATION_TONE } from './ad-hoc-thresholds';
export type { AdHocClassification } from './ad-hoc-thresholds';
