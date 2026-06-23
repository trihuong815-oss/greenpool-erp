// PR-PROMO2-B (2026-06-23) — Test detectAdHocDiscount + buildAdHocSummary.

import { describe, it, expect } from 'vitest';
import {
  detectAdHocDiscount,
  buildAdHocSummary,
  type AdHocTxInput,
  type AdHocPackageInput,
} from '@/lib/sales-v2/ad-hoc-discount';

// ─── Test helpers ──────────────────────────────────────────────────────

function mkTx(over: Partial<AdHocTxInput> = {}): AdHocTxInput {
  return {
    id: 't1',
    date: '2026-06-15',
    branchId: 'HM' as any,
    saleId: 'sale1',
    saleName: 'Sale One',
    customerName: 'KH A',
    phone: '0911000001',
    packageId: 'pkg1',
    packageName: 'Gói Test',
    transactionType: 'thanh_toan_full',
    packageValue: 5_000_000,
    basePackageValue: 5_000_000,
    quantity: null,
    unitPrice: null,
    promoSnapshots: [],
    packageIsCustomQuantity: false,
    packageManualPriceWithQty: false,
    reviewStatus: 'pending',
    ...over,
  };
}

function mkPkg(over: Partial<AdHocPackageInput> = {}): AdHocPackageInput {
  return {
    id: 'pkg1',
    defaultPrice: 5_000_000,
    isCustomQuantity: false,
    manualPriceWithQuantity: false,
    ...over,
  };
}

// ─── detectAdHocDiscount tests ─────────────────────────────────────────

describe('detectAdHocDiscount — Skip cases', () => {
  it('thanh_toan_not → SKIP_PAYMENT', () => {
    const r = detectAdHocDiscount(mkTx({ transactionType: 'thanh_toan_not' }), mkPkg());
    expect(r.status).toBe('SKIP_PAYMENT');
  });

  it('packageManualPriceWithQty=true → SKIP_MANUAL', () => {
    const r = detectAdHocDiscount(mkTx({ packageManualPriceWithQty: true }), mkPkg());
    expect(r.status).toBe('SKIP_MANUAL');
  });

  it('pkg.manualPriceWithQuantity=true (fresh) → SKIP_MANUAL', () => {
    const r = detectAdHocDiscount(mkTx(), mkPkg({ manualPriceWithQuantity: true }));
    expect(r.status).toBe('SKIP_MANUAL');
  });
});

describe('detectAdHocDiscount — Gói thường', () => {
  it('actual < default → AD_HOC', () => {
    const r = detectAdHocDiscount(
      mkTx({ basePackageValue: 4_500_000 }),
      mkPkg({ defaultPrice: 5_000_000 }),
    );
    expect(r.status).toBe('AD_HOC');
    if (r.status === 'AD_HOC') {
      expect(r.baseline).toBe(5_000_000);
      expect(r.actual).toBe(4_500_000);
      expect(r.adHocAmount).toBe(500_000);
      expect(r.adHocPercent).toBe(10);
      expect(r.classification).toBe('LOW');
    }
  });

  it('actual = default → NORMAL_PRICE', () => {
    const r = detectAdHocDiscount(
      mkTx({ basePackageValue: 5_000_000 }),
      mkPkg({ defaultPrice: 5_000_000 }),
    );
    expect(r.status).toBe('NORMAL_PRICE');
  });

  it('actual > default → NORMAL_PRICE (Sale bán cao hơn, không flag)', () => {
    const r = detectAdHocDiscount(
      mkTx({ basePackageValue: 5_500_000 }),
      mkPkg({ defaultPrice: 5_000_000 }),
    );
    expect(r.status).toBe('NORMAL_PRICE');
  });

  it('defaultPrice = 0 → UNKNOWN_BASELINE', () => {
    const r = detectAdHocDiscount(mkTx({ basePackageValue: 1_000_000 }), mkPkg({ defaultPrice: 0 }));
    expect(r.status).toBe('UNKNOWN_BASELINE');
  });

  it('package not found (pkg=null) → UNKNOWN_BASELINE', () => {
    const r = detectAdHocDiscount(mkTx({ basePackageValue: 1_000_000 }), null);
    expect(r.status).toBe('UNKNOWN_BASELINE');
  });

  it('% chính xác: 6%/15%/25%', () => {
    const r6 = detectAdHocDiscount(mkTx({ basePackageValue: 9_400_000 }), mkPkg({ defaultPrice: 10_000_000 }));
    expect(r6.status).toBe('AD_HOC');
    if (r6.status === 'AD_HOC') {
      expect(r6.adHocPercent).toBeCloseTo(6, 5);
      expect(r6.classification).toBe('LOW');
    }

    const r15 = detectAdHocDiscount(mkTx({ basePackageValue: 8_500_000 }), mkPkg({ defaultPrice: 10_000_000 }));
    expect(r15.status).toBe('AD_HOC');
    if (r15.status === 'AD_HOC') {
      expect(r15.adHocPercent).toBeCloseTo(15, 5);
      expect(r15.classification).toBe('REVIEW');
    }

    const r25 = detectAdHocDiscount(mkTx({ basePackageValue: 7_500_000 }), mkPkg({ defaultPrice: 10_000_000 }));
    expect(r25.status).toBe('AD_HOC');
    if (r25.status === 'AD_HOC') {
      expect(r25.adHocPercent).toBeCloseTo(25, 5);
      expect(r25.classification).toBe('HIGH_RISK');
    }
  });

  it('NORMAL <= 3% — VẪN AD_HOC (counted vào thống kê)', () => {
    const r = detectAdHocDiscount(
      mkTx({ basePackageValue: 9_800_000 }),
      mkPkg({ defaultPrice: 10_000_000 }),
    );
    expect(r.status).toBe('AD_HOC');
    if (r.status === 'AD_HOC') {
      expect(r.adHocPercent).toBe(2);
      expect(r.classification).toBe('NORMAL');
    }
  });
});

describe('detectAdHocDiscount — Gói PT (isCustomQuantity)', () => {
  it('unitPrice < defaultUnitPrice → AD_HOC (baseline = defaultUnitPrice × quantity)', () => {
    const r = detectAdHocDiscount(
      mkTx({
        packageIsCustomQuantity: true,
        quantity: 10,
        unitPrice: 450_000,
        basePackageValue: 4_500_000,    // = 10 × 450k Sale nhập
      }),
      mkPkg({ isCustomQuantity: true, defaultUnitPrice: 500_000, defaultPrice: 0 }),
    );
    expect(r.status).toBe('AD_HOC');
    if (r.status === 'AD_HOC') {
      expect(r.baseline).toBe(5_000_000);  // 500k × 10
      expect(r.actual).toBe(4_500_000);
      expect(r.adHocAmount).toBe(500_000);
      expect(r.adHocPercent).toBe(10);
      expect(r.classification).toBe('LOW');
    }
  });

  it('PT unitPrice = defaultUnitPrice → NORMAL_PRICE', () => {
    const r = detectAdHocDiscount(
      mkTx({
        packageIsCustomQuantity: true,
        quantity: 10,
        unitPrice: 500_000,
        basePackageValue: 5_000_000,
      }),
      mkPkg({ isCustomQuantity: true, defaultUnitPrice: 500_000 }),
    );
    expect(r.status).toBe('NORMAL_PRICE');
  });

  it('PT thiếu defaultUnitPrice → UNKNOWN_BASELINE', () => {
    const r = detectAdHocDiscount(
      mkTx({ packageIsCustomQuantity: true, quantity: 10, basePackageValue: 4_000_000 }),
      mkPkg({ isCustomQuantity: true, defaultUnitPrice: undefined }),
    );
    expect(r.status).toBe('UNKNOWN_BASELINE');
  });

  it('PT thiếu quantity → UNKNOWN_BASELINE', () => {
    const r = detectAdHocDiscount(
      mkTx({ packageIsCustomQuantity: true, quantity: null, basePackageValue: 4_000_000 }),
      mkPkg({ isCustomQuantity: true, defaultUnitPrice: 500_000 }),
    );
    expect(r.status).toBe('UNKNOWN_BASELINE');
  });

  it('PT quantity = 0 → UNKNOWN_BASELINE', () => {
    const r = detectAdHocDiscount(
      mkTx({ packageIsCustomQuantity: true, quantity: 0, basePackageValue: 0 }),
      mkPkg({ isCustomQuantity: true, defaultUnitPrice: 500_000 }),
    );
    expect(r.status).toBe('UNKNOWN_BASELINE');
  });
});

describe('detectAdHocDiscount — Official promo wins', () => {
  it('actual < baseline + promoSnapshots non-empty → OFFICIAL_PROMO (KHÔNG flag ad-hoc)', () => {
    const r = detectAdHocDiscount(
      mkTx({
        basePackageValue: 4_000_000,
        promoSnapshots: [{ id: 'p1', code: 'P1', name: 'Test', type: 'percent', value: 20 }],
      }),
      mkPkg({ defaultPrice: 5_000_000 }),
    );
    expect(r.status).toBe('OFFICIAL_PROMO');
  });

  it('promoSnapshots empty array → AD_HOC (như no promo)', () => {
    const r = detectAdHocDiscount(
      mkTx({ basePackageValue: 4_000_000, promoSnapshots: [] }),
      mkPkg({ defaultPrice: 5_000_000 }),
    );
    expect(r.status).toBe('AD_HOC');
  });

  it('promoSnapshots undefined → AD_HOC', () => {
    const r = detectAdHocDiscount(
      mkTx({ basePackageValue: 4_000_000, promoSnapshots: undefined }),
      mkPkg({ defaultPrice: 5_000_000 }),
    );
    expect(r.status).toBe('AD_HOC');
  });
});

describe('detectAdHocDiscount — Edge cases', () => {
  it('basePackageValue undefined → fallback 0 → AD_HOC với 100%', () => {
    const r = detectAdHocDiscount(mkTx({ basePackageValue: undefined }), mkPkg({ defaultPrice: 5_000_000 }));
    expect(r.status).toBe('AD_HOC');
    if (r.status === 'AD_HOC') {
      expect(r.actual).toBe(0);
      expect(r.adHocPercent).toBe(100);
      expect(r.classification).toBe('HIGH_RISK');
    }
  });

  it('Snapshot wins fresh: tx.packageIsCustomQuantity=true overrides pkg.isCustomQuantity=false', () => {
    // Admin tắt isCustomQuantity sau khi tx tạo → tx vẫn dùng snapshot PT mode
    const r = detectAdHocDiscount(
      mkTx({
        packageIsCustomQuantity: true,
        quantity: 10,
        basePackageValue: 4_000_000,
      }),
      mkPkg({ isCustomQuantity: false, defaultUnitPrice: 500_000 }),
    );
    // Snapshot wins → PT mode → baseline = 500k × 10 = 5M
    expect(r.status).toBe('AD_HOC');
    if (r.status === 'AD_HOC') {
      expect(r.baseline).toBe(5_000_000);
    }
  });
});

// ─── buildAdHocSummary tests ───────────────────────────────────────────

describe('buildAdHocSummary — Aggregate', () => {
  it('empty list → empty summary', () => {
    const s = buildAdHocSummary([], new Map(), new Map());
    expect(s.totals.transactionsCount).toBe(0);
    expect(s.totals.totalAdHocAmount).toBe(0);
    expect(s.items).toHaveLength(0);
    expect(s.truncated).toBe(false);
    expect(s.topBranches).toHaveLength(0);
    expect(s.topSales).toHaveLength(0);
  });

  it('Mixed: 2 AD_HOC + 1 NORMAL_PRICE + 1 SKIP_PAYMENT + 1 OFFICIAL_PROMO', () => {
    const pkgMap = new Map<string, AdHocPackageInput>();
    pkgMap.set('pkg1', mkPkg({ defaultPrice: 10_000_000 }));

    const txs: AdHocTxInput[] = [
      mkTx({ id: 't1', basePackageValue: 8_000_000 }),                                  // AD_HOC 20% REVIEW
      mkTx({ id: 't2', basePackageValue: 9_500_000 }),                                  // AD_HOC 5% LOW
      mkTx({ id: 't3', basePackageValue: 10_000_000 }),                                 // NORMAL_PRICE
      mkTx({ id: 't4', transactionType: 'thanh_toan_not' }),                            // SKIP_PAYMENT
      mkTx({ id: 't5', basePackageValue: 8_000_000, promoSnapshots: [{ id: 'p1' }] }),  // OFFICIAL_PROMO
    ];

    const s = buildAdHocSummary(txs, pkgMap, new Map());

    expect(s.totals.transactionsCount).toBe(2);
    expect(s.totals.totalAdHocAmount).toBe(2_500_000);
    expect(s.totals.skipPaymentCount).toBe(1);
    expect(s.totals.officialPromoCount).toBe(1);

    expect(s.byClassification.REVIEW.count).toBe(1);
    expect(s.byClassification.REVIEW.amount).toBe(2_000_000);
    expect(s.byClassification.LOW.count).toBe(1);
    expect(s.byClassification.LOW.amount).toBe(500_000);
    expect(s.byClassification.NORMAL.count).toBe(0);
    expect(s.byClassification.HIGH_RISK.count).toBe(0);

    expect(s.items).toHaveLength(2);
    // HIGH_RISK > REVIEW > LOW > NORMAL → REVIEW trước LOW
    expect(s.items[0].txId).toBe('t1');
    expect(s.items[1].txId).toBe('t2');
  });

  it('NORMAL ≤3% VẪN counted vào thống kê tổng (chốt user)', () => {
    const pkgMap = new Map<string, AdHocPackageInput>();
    pkgMap.set('pkg1', mkPkg({ defaultPrice: 10_000_000 }));

    const txs: AdHocTxInput[] = [
      mkTx({ id: 't1', basePackageValue: 9_800_000 }),  // 2% NORMAL
    ];

    const s = buildAdHocSummary(txs, pkgMap, new Map());
    expect(s.totals.transactionsCount).toBe(1);     // CÓ count
    expect(s.totals.totalAdHocAmount).toBe(200_000);
    expect(s.byClassification.NORMAL.count).toBe(1);
    expect(s.byClassification.NORMAL.amount).toBe(200_000);
    expect(s.items).toHaveLength(1);
    expect(s.items[0].classification).toBe('NORMAL');
  });

  it('UNKNOWN_BASELINE → count separate, KHÔNG vào totals/items', () => {
    const txs: AdHocTxInput[] = [
      mkTx({ id: 't1' }),  // pkg null → UNKNOWN
    ];
    const s = buildAdHocSummary(txs, new Map(), new Map());
    expect(s.totals.transactionsCount).toBe(0);
    expect(s.totals.unknownBaselineCount).toBe(1);
    expect(s.items).toHaveLength(0);
  });

  it('Sort items: HIGH_RISK trước, tie-break amount DESC, tie-break date DESC', () => {
    const pkgMap = new Map<string, AdHocPackageInput>();
    pkgMap.set('pkg1', mkPkg({ defaultPrice: 10_000_000 }));

    const txs: AdHocTxInput[] = [
      mkTx({ id: 'lowA', date: '2026-06-15', basePackageValue: 9_500_000 }),  // LOW 5%
      mkTx({ id: 'highA', date: '2026-06-10', basePackageValue: 5_000_000 }),  // HIGH 50%
      mkTx({ id: 'highB', date: '2026-06-20', basePackageValue: 6_000_000 }),  // HIGH 40%
      mkTx({ id: 'reviewA', date: '2026-06-12', basePackageValue: 8_000_000 }), // REVIEW 20%
    ];
    const s = buildAdHocSummary(txs, pkgMap, new Map());
    // Expected: highA (50%, 5M) > highB (40%, 4M) > reviewA (20%, 2M) > lowA (5%, 500k)
    expect(s.items.map((i) => i.txId)).toEqual(['highA', 'highB', 'reviewA', 'lowA']);
  });

  it('Cap 200 items → truncated=true, totalItemsBeforeCap > 200', () => {
    const pkgMap = new Map<string, AdHocPackageInput>();
    pkgMap.set('pkg1', mkPkg({ defaultPrice: 10_000_000 }));

    // 250 AD_HOC tx
    const txs: AdHocTxInput[] = Array.from({ length: 250 }, (_, i) =>
      mkTx({ id: `t${i}`, basePackageValue: 8_000_000 }),
    );

    const s = buildAdHocSummary(txs, pkgMap, new Map());
    expect(s.totals.transactionsCount).toBe(250);
    expect(s.totalItemsBeforeCap).toBe(250);
    expect(s.truncated).toBe(true);
    expect(s.items).toHaveLength(200);
  });

  it('Top branches/sales aggregate đúng (sort amount DESC)', () => {
    const pkgMap = new Map<string, AdHocPackageInput>();
    pkgMap.set('pkg1', mkPkg({ defaultPrice: 10_000_000 }));

    const txs: AdHocTxInput[] = [
      mkTx({ id: 't1', branchId: 'HM' as any, saleId: 's1', saleName: 'A', basePackageValue: 5_000_000 }),  // 5M ad-hoc
      mkTx({ id: 't2', branchId: 'TK' as any, saleId: 's2', saleName: 'B', basePackageValue: 8_000_000 }),  // 2M ad-hoc
      mkTx({ id: 't3', branchId: 'HM' as any, saleId: 's1', saleName: 'A', basePackageValue: 9_000_000 }),  // 1M ad-hoc
    ];

    const s = buildAdHocSummary(txs, pkgMap, new Map());
    expect(s.topBranches[0]).toEqual({ branchId: 'HM', count: 2, amount: 6_000_000 });
    expect(s.topBranches[1]).toEqual({ branchId: 'TK', count: 1, amount: 2_000_000 });
    expect(s.topSales[0]).toEqual({ saleId: 's1', saleName: 'A', count: 2, amount: 6_000_000 });
    expect(s.topSales[1]).toEqual({ saleId: 's2', saleName: 'B', count: 1, amount: 2_000_000 });
  });

  it('batchStatusMap enriches batchStatus per tx', () => {
    const pkgMap = new Map<string, AdHocPackageInput>();
    pkgMap.set('pkg1', mkPkg({ defaultPrice: 10_000_000 }));
    const batchMap = new Map<string, string>();
    batchMap.set('t1', 'approved');

    const txs: AdHocTxInput[] = [mkTx({ id: 't1', basePackageValue: 5_000_000 })];
    const s = buildAdHocSummary(txs, pkgMap, batchMap);
    expect(s.items[0].batchStatus).toBe('approved');
  });

  it('tradeOffNote luôn present', () => {
    const s = buildAdHocSummary([], new Map(), new Map());
    expect(s.tradeOffNote).toContain('Compute on-read');
    expect(s.tradeOffNote).toContain('admin đổi giá');
  });
});
