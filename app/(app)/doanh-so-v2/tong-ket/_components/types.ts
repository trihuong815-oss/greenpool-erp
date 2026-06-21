// PR-TK1 (2026-06-21) — Types tách từ TongKetClient.tsx (refactor only — không đổi schema).
//
// Mapping 1:1 với API response của GET /api/sales-v2/monthly-summary.

import type { SalesV2Source } from '@/lib/types/sales-v2';

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
  // V7 Promo (2026-06-18)
  promoTotals?: {
    transactions: number;
    totalDiscount: number;
    totalBonusSessions: number;
    totalBonusDays: number;
  };
  promoByCode?: Record<string, {
    code: string;
    name: string;
    type: string;
    count: number;
    discount: number;
    bonusSessions: number;
    bonusDays: number;
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
