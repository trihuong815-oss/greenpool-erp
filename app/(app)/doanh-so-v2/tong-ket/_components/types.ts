// PR-TK1 (2026-06-21) — Types tách từ TongKetClient.tsx (refactor only — không đổi schema).
//
// Mapping 1:1 với API response của GET /api/sales-v2/monthly-summary.

import type { SalesV2Source } from '@/lib/types/sales-v2';
import type { AdHocSummary } from '@/lib/sales-v2/ad-hoc-discount';

export interface SaleCustomerTx {
  id: string;
  date: string;
  customerName: string;
  phone: string;
  packageName: string;
  packageValue: number;
  collectedToday: number;
  debtAmount: number;
  originalDebt: number;
  transactionType: string;
  paymentMethod: string;
  matchedTransactionId: string | null;
  matchStatus: string;
  note: string | null;
}

export interface SaleCustomers {
  saleId: string;
  saleName: string;
  branchId: string;
  branchName: string;
  transactions: SaleCustomerTx[];
  totals: {
    count: number;
    sales: number;
    collected: number;
    debtGenerated: number;
    debtRemaining: number;
  };
}

export interface Summary {
  ok: true;
  month: string;
  scope: { branchId: string | null; saleId: string | null };
  totals: {
    sales: number;
    collected: number;
    debtGenerated: number;
    debtRemaining: number;
    transactions: number;
  };
  bySource: Record<SalesV2Source, { count: number; sales: number; collected: number }>;
  byPackage: Record<string, {
    name: string;
    count: number;
    sales: number;
    collected: number;
    isCustomQuantity?: boolean;
    unitName?: string;
  }>;
  bySale: Record<string, { name: string; count: number; sales: number; collected: number }>;
  byBranch: Record<string, { name: string; count: number; sales: number; collected: number }>;
  // V6 PT (2026-06-17)
  ptTotals?: { transactions: number; sessions: number; sales: number };
  ptByPackage?: Record<string, {
    name: string;
    count: number;
    sessions: number;
    sales: number;
    collected: number;
    unitName: string;
  }>;
  // V7 Promo (2026-06-18) — PR-TK4C: + totalPromoSales + sales per code cho cost ratio
  promoTotals?: {
    transactions: number;
    totalDiscount: number;
    totalBonusSessions: number;
    totalBonusDays: number;
    totalPromoSales?: number;       // PR-TK4C (optional cho backward compat)
  };
  promoByCode?: Record<string, {
    code: string;
    name: string;
    type: string;
    count: number;
    discount: number;
    bonusSessions: number;
    bonusDays: number;
    sales?: number;                 // PR-TK4C (optional cho backward compat)
  }>;
  // V8.X (2026-06-18) — danh sách KH chi tiết theo Sale (replace PT card)
  salesCustomers?: Record<string, SaleCustomers>;
  // V8.X audit fix — số tx vượt LIMIT (5000) → số liệu không đầy đủ
  truncated?: boolean;
  limit?: number;
  // ─── PR-TK2 (2026-06-21) — Data completeness ───
  /** Số khách distinct trong scope (phone chuẩn hóa, fallback name+saleId nếu thiếu phone). */
  customerCount?: number;
  /** Đếm tx theo reviewStatus — TRƯỚC khi filter approved. Phục vụ alert "còn N chờ duyệt". */
  txStatusStats?: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
  };
  /** Đếm batch theo status trong scope. Sale → tất cả 0 (không trả null để tránh check khắp UI). */
  batchStats?: {
    total: number;
    pendingReview: number;
    approved: number;
    returned: number;
  };
  /** Trạng thái khóa tháng.
   *  - QLCS/Accountant + Top có filter 1 branch: single shape
   *  - Top xem all branches: summary shape
   *  - Sale: null
   */
  monthLock?: MonthLockSingle | MonthLockSummary | null;
  // ─── PR-TK3A (2026-06-21) — Chỉ tiêu doanh số tháng (read-only) ───
  /** Tổng hợp tiến độ chỉ tiêu tháng theo scope. Luôn có (status='not_set' nếu chưa đặt). */
  targetSummary?: TargetSummary;
  /** Map saleId → target VND của tháng đang xem.
   *  - Sale: chỉ chứa { [ownUid]: target } (nếu có)
   *  - QLCS/Acct: tất cả Sale trong branch
   *  - Top: tất cả Sale trong scope (branch filter hoặc all)
   *  - Empty {} nếu chưa đặt target Sale nào.
   */
  saleTargetsThisMonth?: Record<string, number>;
  /** PR-TONGKET-OVERVIEW-V2 (2026-06-27): chỉ tiêu doanh số per-branch tháng đang xem.
   *  - Sale: empty
   *  - QLCS/Acct: 1 key = branch của mình (nếu có target)
   *  - Top: tất cả branches có target (key = BranchId, value = số tiền target VND)
   *  Dùng cho BranchProgressList ở tab Tổng quan (so target vs actual). */
  branchTargetsThisMonth?: Record<string, number>;
  /** PR-TONGKET-PHASE2 (2026-06-27): totals tháng trước cùng scope.
   *  Dùng cho MoM growth % trong MonthlyKpiCards.
   *  null nếu compute fail server (UI fallback ẩn delta — không crash). */
  prevMonth?: {
    month: string;
    totals: {
      sales: number;
      collected: number;
      debtGenerated: number;
      debtRemaining: number;
      transactions: number;
    };
    customerCount: number;
  } | null;
  /** PR-PROMO2-B (2026-06-23): báo cáo read-only ưu đãi ngoài chương trình.
   *  - undefined nếu role='sale' (SaleView không hiện card) hoặc không có raw tx
   *  - undefined nếu compute fail (fail-soft) */
  adHocSummary?: AdHocSummary;
}

// ─── PR-TK3A (2026-06-21) — Target types ───
export type TargetScope = 'sale' | 'branch' | 'system' | 'none';
export type TargetStatus = 'achieved' | 'on_track' | 'watch' | 'behind' | 'not_set';

export interface TargetSummary {
  scope: TargetScope;
  targetRevenue: number | null;
  actualRevenue: number;
  percentComplete: number | null;
  remaining: number | null;
  daysElapsedPercent: number;
  progressGap: number | null;
  status: TargetStatus;
}

export interface MonthLockSingle {
  branchId: string;
  locked: boolean;
  lockedByName: string | null;
  lockedAt: string | null;  // ISO timestamp
}

export interface MonthLockSummary {
  totalBranches: number;
  lockedCount: number;
  lockedBranchIds: string[];
}

export function isMonthLockSummary(v: MonthLockSingle | MonthLockSummary | null | undefined): v is MonthLockSummary {
  return v != null && 'totalBranches' in v;
}

export function isMonthLockSingle(v: MonthLockSingle | MonthLockSummary | null | undefined): v is MonthLockSingle {
  return v != null && 'branchId' in v;
}
