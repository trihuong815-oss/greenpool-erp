// PR-SUMMARY-02-TYPES-AND-BUILDER (2026-06-29) — Parity tests cho
// buildMonthlySalesSummariesFromTransactions.
//
// Mọi expected number được tính TAY theo công thức của route hiện tại
// (app/api/sales-v2/monthly-summary/route.ts L170-432) — KHÔNG import route
// (tránh Next.js/Firebase side effect trong test môi trường node).
//
// Builder PHẢI khớp 100% với raw calc của route cho các field overlap.

import { describe, it, expect } from 'vitest';
import { buildMonthlySalesSummariesFromTransactions } from '@/lib/sales-v2/monthly-summary-builder';
import type { SalesTransaction } from '@/lib/types/sales-v2';

// ─── Test fixture builder ────────────────────────────────────────────

/**
 * Tạo tx fixture với sane defaults. Override field cần test.
 */
function makeTx(overrides: Partial<SalesTransaction> = {}): SalesTransaction {
  const base: SalesTransaction = {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    batchId: 'batch-1',
    date: '2026-06-15',
    month: '2026-06',
    branchId: 'HM',
    branchName: 'Green Pool Hoàng Mai',
    saleId: 'sale-1',
    saleName: 'Nguyễn Văn A',
    customerName: 'Khách Hàng',
    phone: '0983088810',
    source: 'ca_nhan',
    packageId: 'pkg-1',
    packageCode: 'HBNL',
    packageName: 'Gói Bơi Người Lớn',
    serviceGroup: 'HBNL',
    isChildPackage: false,
    transactionType: 'thanh_toan_full',
    paymentMethod: 'tien_mat',
    packageValue: 1_000_000,
    collectedToday: 1_000_000,
    debtAmount: 0,
    reviewStatus: 'approved',
    matchStatus: 'not_applicable',
    createdAt: '2026-06-15T10:00:00.000Z',
    updatedAt: '2026-06-15T10:00:00.000Z',
  };
  return { ...base, ...overrides };
}

// ─── 1. Empty month ──────────────────────────────────────────────────

describe('buildMonthlySalesSummariesFromTransactions — empty', () => {
  it('Empty transactions → 0 branch + 0 sale summaries', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [],
    });
    expect(result.branchSummaries).toEqual([]);
    expect(result.saleSummaries).toEqual([]);
  });

  it('All transactions rejected → 0 summaries (filter approved)', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ reviewStatus: 'rejected', packageValue: 5_000_000 }),
        makeTx({ reviewStatus: 'pending', packageValue: 3_000_000 }),
      ],
    });
    expect(result.branchSummaries).toEqual([]);
    expect(result.saleSummaries).toEqual([]);
  });
});

// ─── 2. Single full payment ──────────────────────────────────────────

describe('buildMonthlySalesSummariesFromTransactions — single tx', () => {
  it('Single thanh_toan_full: totals = packageValue, debt = 0', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [makeTx({
        packageValue: 2_000_000,
        collectedToday: 2_000_000,
        debtAmount: 0,
        transactionType: 'thanh_toan_full',
      })],
    });
    expect(result.branchSummaries).toHaveLength(1);
    const b = result.branchSummaries[0];
    expect(b.id).toBe('2026-06_HM');
    expect(b.month).toBe('2026-06');
    expect(b.branchId).toBe('HM');
    expect(b.transactionCount).toBe(1);
    expect(b.uniqueCustomerCount).toBe(1);
    expect(b.finalRevenue).toBe(2_000_000);
    expect(b.collectedAmount).toBe(2_000_000);
    expect(b.debtGenerated).toBe(0);
    expect(b.debtRemaining).toBe(0);
    expect(b.refundAmount).toBe(0);
    expect(b.netRevenue).toBe(2_000_000);
    expect(b.bySource.ca_nhan.count).toBe(1);
    expect(b.bySource.ca_nhan.sales).toBe(2_000_000);
    expect(b.byPackage['pkg-1'].sales).toBe(2_000_000);
    expect(b.byTxnType.thanh_toan_full.count).toBe(1);
  });

  it('Single dat_coc: debtGenerated + debtRemaining > 0', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [makeTx({
        packageValue: 3_000_000,
        collectedToday: 1_000_000,
        debtAmount: 2_000_000,
        originalDebt: 2_000_000,
        transactionType: 'dat_coc',
      })],
    });
    const b = result.branchSummaries[0];
    expect(b.finalRevenue).toBe(3_000_000);
    expect(b.collectedAmount).toBe(1_000_000);
    expect(b.debtGenerated).toBe(2_000_000);
    expect(b.debtRemaining).toBe(2_000_000);
    expect(b.byTxnType.dat_coc.count).toBe(1);
  });

  it('thanh_toan_not: KHÔNG vào bySource/byPackage (chỉ vào totals)', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({
          packageValue: 0,             // server enforce pv=0 cho thanh_toan_not
          collectedToday: 1_500_000,
          debtAmount: 0,
          transactionType: 'thanh_toan_not',
        }),
      ],
    });
    const b = result.branchSummaries[0];
    expect(b.finalRevenue).toBe(0);   // pv=0
    expect(b.collectedAmount).toBe(1_500_000);
    expect(b.transactionCount).toBe(1);
    // bySource + byPackage KHÔNG có entry (filter !thanh_toan_not)
    expect(Object.keys(b.bySource)).toHaveLength(0);
    expect(Object.keys(b.byPackage)).toHaveLength(0);
    // byTxnType VẪN có (PR-02 extension include all)
    expect(b.byTxnType.thanh_toan_not.count).toBe(1);
    expect(b.byTxnType.thanh_toan_not.collected).toBe(1_500_000);
  });
});

// ─── 3-4. Multi-branch + Multi-sale ──────────────────────────────────

describe('Multi-branch + multi-sale grouping', () => {
  it('2 branches HM + TK → 2 branchSummaries', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ branchId: 'HM', branchName: 'HM', packageValue: 1_000_000 }),
        makeTx({ branchId: 'TK', branchName: 'TK', packageValue: 500_000 }),
      ],
    });
    expect(result.branchSummaries).toHaveLength(2);
    const hm = result.branchSummaries.find((b) => b.branchId === 'HM')!;
    const tk = result.branchSummaries.find((b) => b.branchId === 'TK')!;
    expect(hm.finalRevenue).toBe(1_000_000);
    expect(tk.finalRevenue).toBe(500_000);
    // Sort: HM trước TK (alphabet)
    expect(result.branchSummaries[0].branchId).toBe('HM');
    expect(result.branchSummaries[1].branchId).toBe('TK');
  });

  it('3 sales cùng branch → 1 branchSummary + 3 saleSummaries', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ saleId: 'sale-a', packageValue: 1_000_000 }),
        makeTx({ saleId: 'sale-b', packageValue: 2_000_000 }),
        makeTx({ saleId: 'sale-c', packageValue: 3_000_000 }),
      ],
    });
    expect(result.branchSummaries).toHaveLength(1);
    expect(result.branchSummaries[0].finalRevenue).toBe(6_000_000);
    expect(result.saleSummaries).toHaveLength(3);
    expect(result.saleSummaries.map((s) => s.saleId).sort()).toEqual(['sale-a', 'sale-b', 'sale-c']);
  });
});

// ─── 5. Customer dedup — uniqueCustomerCount ─────────────────────────

describe('Unique customer count strategy', () => {
  it('1 khách mua 2 gói (cùng phone) → uniqueCustomerCount = 1', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ phone: '0983088810', packageId: 'pkg-1', packageValue: 1_000_000 }),
        makeTx({ phone: '0983088810', packageId: 'pkg-2', packageValue: 2_000_000 }),
      ],
    });
    const b = result.branchSummaries[0];
    expect(b.transactionCount).toBe(2);
    expect(b.uniqueCustomerCount).toBe(1);
    expect(b.finalRevenue).toBe(3_000_000);
    expect(Object.keys(b.byPackage).sort()).toEqual(['pkg-1', 'pkg-2']);
  });

  it('Same phone khác sale → uniqueCustomerCount = 1 per-branch, 1+1 per-sale (mỗi sale 1 KH)', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ phone: '0983088810', saleId: 'sale-a' }),
        makeTx({ phone: '0983088810', saleId: 'sale-b' }),
      ],
    });
    const b = result.branchSummaries[0];
    expect(b.uniqueCustomerCount).toBe(1); // cùng phone → 1 khách per branch
    expect(result.saleSummaries).toHaveLength(2);
    expect(result.saleSummaries[0].uniqueCustomerCount).toBe(1);
    expect(result.saleSummaries[1].uniqueCustomerCount).toBe(1);
  });

  it('Khách không phone → fallback name+saleId (tránh underestimate)', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ phone: '', customerName: 'Khách A', saleId: 'sale-1' }),
        makeTx({ phone: '', customerName: 'Khách B', saleId: 'sale-1' }),
      ],
    });
    const b = result.branchSummaries[0];
    expect(b.uniqueCustomerCount).toBe(2);
  });

  it('phone với space — KHÔNG normalize bên trong builder (match route)', () => {
    // Route hiện tại CHỈ trim, KHÔNG normalize VN format → builder match logic
    // PR-DATA-03 sẽ migrate sang phoneNormalized sau khi link customerId.
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ phone: '0983088810' }),
        makeTx({ phone: '0983 088 810' }),  // có space → coi là KH KHÁC theo logic hiện tại
      ],
    });
    const b = result.branchSummaries[0];
    // Match route L254 → 2 khách distinct (chỉ trim, không normalize)
    expect(b.uniqueCustomerCount).toBe(2);
  });
});

// ─── 6. Multiple sources ─────────────────────────────────────────────

describe('bySource breakdown', () => {
  it('5 sources khác nhau → 5 bySource entries', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ source: 'ca_nhan', packageValue: 100_000 }),
        makeTx({ source: 'walkin', packageValue: 200_000 }),
        makeTx({ source: 'mkt', packageValue: 300_000 }),
        makeTx({ source: 'renew', packageValue: 400_000 }),
        makeTx({ source: 'ref', packageValue: 500_000 }),
      ],
    });
    const b = result.branchSummaries[0];
    expect(b.bySource.ca_nhan.sales).toBe(100_000);
    expect(b.bySource.walkin.sales).toBe(200_000);
    expect(b.bySource.mkt.sales).toBe(300_000);
    expect(b.bySource.renew.sales).toBe(400_000);
    expect(b.bySource.ref.sales).toBe(500_000);
    expect(b.finalRevenue).toBe(1_500_000);
  });
});

// ─── 7. PT / Custom quantity ─────────────────────────────────────────

describe('PT (V6) — packageIsCustomQuantity', () => {
  it('PT 10 buổi × 500K → ptTotals.sessions = 10, ptRevenue = 5M', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({
          packageId: 'pkg-pt',
          packageIsCustomQuantity: true,
          quantity: 10,
          unitPrice: 500_000,
          packageValue: 5_000_000,
          packageUnitName: 'buổi',
        }),
      ],
    });
    const b = result.branchSummaries[0];
    expect(b.ptTransactionCount).toBe(1);
    expect(b.ptSessionCount).toBe(10);
    expect(b.ptRevenue).toBe(5_000_000);
  });

  it('PT + non-PT mix → ptTotals chỉ count PT', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ packageIsCustomQuantity: true, quantity: 20, packageValue: 10_000_000 }),
        makeTx({ packageIsCustomQuantity: false, packageValue: 1_000_000 }),
      ],
    });
    const b = result.branchSummaries[0];
    expect(b.ptTransactionCount).toBe(1);
    expect(b.ptSessionCount).toBe(20);
    expect(b.ptRevenue).toBe(10_000_000);
    expect(b.finalRevenue).toBe(11_000_000);
  });

  it('PT + thanh_toan_not: KHÔNG count vào PT (match route !isThanhToanNot)', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({
          packageIsCustomQuantity: true,
          quantity: 5,
          transactionType: 'thanh_toan_not',
          packageValue: 0,
          collectedToday: 2_500_000,
        }),
      ],
    });
    const b = result.branchSummaries[0];
    expect(b.ptTransactionCount).toBe(0); // không count
  });
});

// ─── 8. Promo (V7) ───────────────────────────────────────────────────

describe('Promo (V7) — promoSnapshots', () => {
  it('1 tx có promo percent → promo counters tăng + grossRevenue > finalRevenue', () => {
    const tx = makeTx({
      packageValue: 800_000,                 // sau giảm 20%
      basePackageValue: 1_000_000,           // gốc
      discountAmount: 200_000,
      promoSnapshots: [{ id: 'p1', code: 'SUMMER20', name: 'Summer 20%', type: 'percent', value: 20 }],
    } as unknown as Partial<SalesTransaction>);
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [tx],
    });
    const b = result.branchSummaries[0];
    expect(b.grossRevenue).toBe(1_000_000);
    expect(b.finalRevenue).toBe(800_000);
    expect(b.discountAmount).toBe(200_000);
    expect(b.promoTransactionCount).toBe(1);
    expect(b.promoDiscountAmount).toBe(200_000);
  });

  it('Promo bonus_sessions → promoBonusSessionCount tăng, discount = 0', () => {
    const tx = makeTx({
      packageValue: 1_000_000,
      basePackageValue: 1_000_000,
      bonusQuantity: 3,
      promoSnapshots: [{ id: 'p2', code: 'BONUS3', name: 'Tặng 3 buổi', type: 'bonus_sessions', value: 3 }],
    } as unknown as Partial<SalesTransaction>);
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [tx],
    });
    const b = result.branchSummaries[0];
    expect(b.promoTransactionCount).toBe(1);
    expect(b.promoBonusSessionCount).toBe(3);
    expect(b.promoDiscountAmount).toBe(0);
    expect(b.discountAmount).toBe(0); // base = final
  });

  it('Tx KHÔNG có promo → promoTransactionCount = 0', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [makeTx()],
    });
    expect(result.branchSummaries[0].promoTransactionCount).toBe(0);
  });
});

// ─── 9. Pending/rejected exclusion ───────────────────────────────────

describe('Filter approved only — match route L250', () => {
  it('Mix approved + pending + rejected → chỉ approved vào aggregation', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ reviewStatus: 'approved', packageValue: 1_000_000 }),
        makeTx({ reviewStatus: 'pending', packageValue: 5_000_000 }),
        makeTx({ reviewStatus: 'rejected', packageValue: 7_000_000 }),
      ],
    });
    const b = result.branchSummaries[0];
    expect(b.transactionCount).toBe(1);
    expect(b.finalRevenue).toBe(1_000_000); // pending + rejected loại
  });
});

// ─── 10. Refund-ready ────────────────────────────────────────────────

describe('Refund-ready fields (PR-REFUND-04 wire sau)', () => {
  it('refundAmount = 0, netRevenue = finalRevenue', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [makeTx({ packageValue: 5_000_000 })],
    });
    const b = result.branchSummaries[0];
    expect(b.refundAmount).toBe(0);
    expect(b.netRevenue).toBe(5_000_000);
    expect(b.netRevenue).toBe(b.finalRevenue);
    const s = result.saleSummaries[0];
    expect(s.refundAmount).toBe(0);
    expect(s.netRevenue).toBe(s.finalRevenue);
  });
});

// ─── 11. No mutation ─────────────────────────────────────────────────

describe('Builder PURE — không mutate input', () => {
  it('Input transactions deep equal sau khi gọi builder', () => {
    const txs = [
      makeTx({ id: 'tx-1', packageValue: 1_000_000 }),
      makeTx({ id: 'tx-2', packageValue: 2_000_000 }),
    ];
    const snapshot = JSON.parse(JSON.stringify(txs));
    buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: txs,
    });
    expect(txs).toEqual(snapshot);
  });

  it('Idempotent — chạy 2 lần ra cùng kết quả (cùng object structure)', () => {
    const txs = [
      makeTx({ packageValue: 1_500_000 }),
      makeTx({ saleId: 'sale-2', packageValue: 2_500_000 }),
    ];
    const r1 = buildMonthlySalesSummariesFromTransactions({ month: '2026-06', transactions: txs });
    const r2 = buildMonthlySalesSummariesFromTransactions({ month: '2026-06', transactions: txs });
    expect(r1).toEqual(r2);
  });
});

// ─── 12. Edge cases + audit trail fields ─────────────────────────────

describe('Audit trail fields + edge cases', () => {
  it('computedBy default = test_builder', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [makeTx()],
    });
    expect(result.branchSummaries[0].computedBy).toBe('test_builder');
  });

  it('computedBy custom override', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [makeTx()],
      computedBy: 'cron',
      truncated: true,
      isFinalized: true,
    });
    expect(result.branchSummaries[0].computedBy).toBe('cron');
    expect(result.branchSummaries[0].truncated).toBe(true);
    expect(result.branchSummaries[0].isFinalized).toBe(true);
  });

  it('schemaVersion = 1', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [makeTx()],
    });
    expect(result.branchSummaries[0].schemaVersion).toBe(1);
    expect(result.saleSummaries[0].schemaVersion).toBe(1);
  });

  it('sourceTransactionCount = số tx approved thuộc branch', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ branchId: 'HM' }),
        makeTx({ branchId: 'HM' }),
        makeTx({ branchId: 'TK' }),
        makeTx({ branchId: 'TK', reviewStatus: 'rejected' }), // loại
      ],
    });
    const hm = result.branchSummaries.find((b) => b.branchId === 'HM')!;
    const tk = result.branchSummaries.find((b) => b.branchId === 'TK')!;
    expect(hm.sourceTransactionCount).toBe(2);
    expect(tk.sourceTransactionCount).toBe(1); // rejected loại
  });

  it('Tx có branchId KHÔNG hợp lệ → skip', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ branchId: 'INVALID' as any }),
        makeTx({ branchId: 'HM' }),
      ],
    });
    expect(result.branchSummaries).toHaveLength(1);
    expect(result.branchSummaries[0].branchId).toBe('HM');
  });

  it('Tx không có saleId → KHÔNG vào saleSummaries (skip)', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ saleId: '' }),
        makeTx({ saleId: 'sale-1' }),
      ],
    });
    expect(result.saleSummaries).toHaveLength(1);
    expect(result.saleSummaries[0].saleId).toBe('sale-1');
    // branch vẫn count cả 2 tx
    expect(result.branchSummaries[0].transactionCount).toBe(2);
  });
});

// ─── 13. Sort order ──────────────────────────────────────────────────

describe('Sort order', () => {
  it('branchSummaries sort theo branchId tăng dần', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ branchId: 'TT' }),
        makeTx({ branchId: 'HM' }),
        makeTx({ branchId: 'CTT' }),
      ],
    });
    expect(result.branchSummaries.map((b) => b.branchId)).toEqual(['CTT', 'HM', 'TT']);
  });

  it('saleSummaries sort theo saleId tăng dần', () => {
    const result = buildMonthlySalesSummariesFromTransactions({
      month: '2026-06',
      transactions: [
        makeTx({ saleId: 'sale-z' }),
        makeTx({ saleId: 'sale-a' }),
        makeTx({ saleId: 'sale-m' }),
      ],
    });
    expect(result.saleSummaries.map((s) => s.saleId)).toEqual(['sale-a', 'sale-m', 'sale-z']);
  });
});
