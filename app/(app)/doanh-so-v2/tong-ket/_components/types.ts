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
}
