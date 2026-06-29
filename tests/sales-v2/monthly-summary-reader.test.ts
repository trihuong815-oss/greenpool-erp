// PR-SUMMARY-04-READ-FROM-SUMMARY-FALLBACK-RAW (2026-06-29) — Unit tests cho
// PURE helpers của monthly-summary-reader (mapper + scope check).
//
// Firestore I/O helpers (tryReadMonthlyBranchSummary,
// tryReadMonthlySaleSummariesForBranch) cần Firestore mock — defer integration
// test sau. CHỈ test pure logic ở PR-04.

import { describe, it, expect } from 'vitest';
import {
  canUseSummaryForScope,
  mapBranchSummaryToTotals,
  mapSaleSummariesToBySale,
  mapBranchSummaryToPrevMonth,
} from '@/lib/sales-v2/monthly-summary-reader';
import type {
  MonthlyBranchSalesSummary,
  MonthlySaleSalesSummary,
} from '@/lib/types/monthly-summary';

// ─── Fixture builders ────────────────────────────────────────────────

function makeBranchSummary(overrides: Partial<MonthlyBranchSalesSummary> = {}): MonthlyBranchSalesSummary {
  return {
    id: '2026-06_HM',
    month: '2026-06',
    branchId: 'HM',
    branchName: 'Green Pool Hoàng Mai',
    transactionCount: 10,
    uniqueCustomerCount: 8,
    grossRevenue: 46_000_000,
    discountAmount: 0,
    finalRevenue: 46_000_000,
    collectedAmount: 35_500_000,
    debtGenerated: 12_500_000,
    debtRemaining: 12_500_000,
    refundAmount: 0,
    netRevenue: 46_000_000,
    bySource: { ca_nhan: { count: 5, sales: 20_000_000, collected: 15_000_000 } },
    byPackage: {},
    byTxnType: {},
    ptTransactionCount: 0,
    ptSessionCount: 0,
    ptRevenue: 0,
    promoTransactionCount: 0,
    promoDiscountAmount: 0,
    promoBonusSessionCount: 0,
    computedAt: null,
    computedBy: 'test_builder',
    sourceTransactionCount: 10,
    truncated: false,
    isFinalized: false,
    updatedAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

function makeSaleSummary(overrides: Partial<MonthlySaleSalesSummary> = {}): MonthlySaleSalesSummary {
  return {
    id: '2026-06_sale-a',
    month: '2026-06',
    saleId: 'sale-a',
    saleName: 'Sale A',
    branchId: 'HM',
    branchName: 'HM',
    transactionCount: 5,
    uniqueCustomerCount: 4,
    grossRevenue: 20_000_000,
    discountAmount: 0,
    finalRevenue: 20_000_000,
    collectedAmount: 15_000_000,
    refundAmount: 0,
    netRevenue: 20_000_000,
    computedAt: null,
    computedBy: 'test_builder',
    sourceTransactionCount: 5,
    truncated: false,
    updatedAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

// ─── canUseSummaryForScope ───────────────────────────────────────────

describe('canUseSummaryForScope', () => {
  it('qlcs + valid branchId → true', () => {
    expect(canUseSummaryForScope('qlcs', 'HM')).toBe(true);
  });

  it('accountant + valid branchId → true', () => {
    expect(canUseSummaryForScope('accountant', 'TK')).toBe(true);
  });

  it('top + valid branchId filter → true', () => {
    expect(canUseSummaryForScope('top', '24')).toBe(true);
  });

  it('top + null branchId (all branches) → false (defer PR-05)', () => {
    expect(canUseSummaryForScope('top', null)).toBe(false);
  });

  it('sale scope → false (defer)', () => {
    expect(canUseSummaryForScope('sale', null)).toBe(false);
    expect(canUseSummaryForScope('sale', 'HM')).toBe(false);
  });

  it('qlcs/accountant + null branchId → false', () => {
    expect(canUseSummaryForScope('qlcs', null)).toBe(false);
    expect(canUseSummaryForScope('accountant', null)).toBe(false);
  });

  it('branchId không hợp lệ → false', () => {
    expect(canUseSummaryForScope('qlcs', 'INVALID')).toBe(false);
    expect(canUseSummaryForScope('top', 'XXX')).toBe(false);
  });
});

// ─── mapBranchSummaryToTotals ────────────────────────────────────────

describe('mapBranchSummaryToTotals', () => {
  it('Map đúng 5 totals fields từ summary', () => {
    const s = makeBranchSummary({
      finalRevenue: 46_000_000,
      collectedAmount: 35_500_000,
      transactionCount: 10,
      debtGenerated: 12_500_000,
      debtRemaining: 12_500_000,
    });
    const t = mapBranchSummaryToTotals(s);
    expect(t).toEqual({
      sales: 46_000_000,
      collected: 35_500_000,
      debtGenerated: 12_500_000,
      debtRemaining: 12_500_000,
      transactions: 10,
    });
  });

  it('totals.sales = finalRevenue (KHÔNG dùng grossRevenue)', () => {
    const s = makeBranchSummary({ grossRevenue: 50_000_000, finalRevenue: 46_000_000 });
    expect(mapBranchSummaryToTotals(s).sales).toBe(46_000_000);
  });

  it('debtGenerated/debtRemaining từ summary trực tiếp (KHÔNG dùng debtAmount)', () => {
    const s = makeBranchSummary({ debtGenerated: 12_500_000, debtRemaining: 12_500_000 });
    const t = mapBranchSummaryToTotals(s);
    expect(t.debtGenerated).toBe(12_500_000);
    expect(t.debtRemaining).toBe(12_500_000);
    // PR-SUMMARY-03A FIX: KHÔNG có field debtAmount nữa
    expect(t).not.toHaveProperty('debtAmount');
  });

  it('Smoke production 2026-06_24 case (parity với UI)', () => {
    const s = makeBranchSummary({
      branchId: '24',
      branchName: 'Green Pool 24 Nguyễn Cơ Thạch',
      transactionCount: 10,
      uniqueCustomerCount: 8,
      finalRevenue: 46_000_000,
      collectedAmount: 35_500_000,
      debtGenerated: 12_500_000,
      debtRemaining: 12_500_000,
    });
    const t = mapBranchSummaryToTotals(s);
    // Phải match UI 100% (verified smoke production)
    expect(t.sales).toBe(46_000_000);
    expect(t.collected).toBe(35_500_000);
    expect(t.debtGenerated).toBe(12_500_000);
    expect(t.debtRemaining).toBe(12_500_000);
    expect(t.transactions).toBe(10);
  });
});

// ─── mapSaleSummariesToBySale ────────────────────────────────────────

describe('mapSaleSummariesToBySale', () => {
  it('Empty array → empty record', () => {
    expect(mapSaleSummariesToBySale([])).toEqual({});
  });

  it('Single sale summary → 1 entry với shape match route', () => {
    const ss = [makeSaleSummary({
      saleId: 'sale-1',
      saleName: 'Nguyễn Văn A',
      transactionCount: 5,
      finalRevenue: 20_000_000,
      collectedAmount: 15_000_000,
    })];
    const out = mapSaleSummariesToBySale(ss);
    expect(out['sale-1']).toEqual({
      name: 'Nguyễn Văn A',
      count: 5,
      sales: 20_000_000,
      collected: 15_000_000,
    });
  });

  it('Multiple sale summaries → key = saleId', () => {
    const ss = [
      makeSaleSummary({ saleId: 'sale-a', finalRevenue: 10_000_000 }),
      makeSaleSummary({ saleId: 'sale-b', finalRevenue: 20_000_000 }),
      makeSaleSummary({ saleId: 'sale-c', finalRevenue: 30_000_000 }),
    ];
    const out = mapSaleSummariesToBySale(ss);
    expect(Object.keys(out)).toEqual(['sale-a', 'sale-b', 'sale-c']);
    expect(out['sale-a'].sales).toBe(10_000_000);
    expect(out['sale-b'].sales).toBe(20_000_000);
    expect(out['sale-c'].sales).toBe(30_000_000);
  });
});

// ─── mapBranchSummaryToPrevMonth ─────────────────────────────────────

describe('mapBranchSummaryToPrevMonth', () => {
  it('null input → null (UI fallback ẩn MoM)', () => {
    expect(mapBranchSummaryToPrevMonth(null)).toBe(null);
  });

  it('Valid summary → wrap thành PrevMonth shape', () => {
    const s = makeBranchSummary({
      month: '2026-05',
      finalRevenue: 40_000_000,
      collectedAmount: 30_000_000,
      transactionCount: 8,
      debtGenerated: 10_000_000,
      debtRemaining: 10_000_000,
      uniqueCustomerCount: 7,
    });
    const p = mapBranchSummaryToPrevMonth(s);
    expect(p).toEqual({
      month: '2026-05',
      totals: {
        sales: 40_000_000,
        collected: 30_000_000,
        debtGenerated: 10_000_000,
        debtRemaining: 10_000_000,
        transactions: 8,
      },
      customerCount: 7,
    });
  });

  it('PrevMonth KHÔNG có debtAmount (PR-SUMMARY-03A FIX)', () => {
    const p = mapBranchSummaryToPrevMonth(makeBranchSummary());
    expect(p?.totals).not.toHaveProperty('debtAmount');
  });
});

// ─── Integration parity: smoke production 2026-06_24 ─────────────────

describe('PR-04 mapping parity vs route response shape', () => {
  it('Full mapping flow — summary → response.totals khớp UI smoke', () => {
    const summary = makeBranchSummary({
      branchId: '24',
      transactionCount: 10,
      uniqueCustomerCount: 8,
      finalRevenue: 46_000_000,
      collectedAmount: 35_500_000,
      debtGenerated: 12_500_000,
      debtRemaining: 12_500_000,
    });
    const totals = mapBranchSummaryToTotals(summary);
    const customerCount = summary.uniqueCustomerCount;

    // Match UI hiển thị (smoke production confirm):
    expect(totals.sales).toBe(46_000_000);          // Doanh số
    expect(totals.collected).toBe(35_500_000);      // Thực thu
    expect(totals.debtGenerated).toBe(12_500_000);  // Công nợ phát sinh
    expect(totals.debtRemaining).toBe(12_500_000);  // Công nợ còn lại
    expect(totals.transactions).toBe(10);            // Số giao dịch
    expect(customerCount).toBe(8);                   // Số khách
  });
});
