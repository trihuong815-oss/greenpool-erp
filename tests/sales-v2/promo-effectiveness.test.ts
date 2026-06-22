// PR-TK4C (2026-06-22) — Unit test compute helper hiệu quả khuyến mãi tương đối.

import { describe, it, expect } from 'vitest';
import { buildPromoEffectiveness, median } from '@/lib/sales-v2/promo-effectiveness';

describe('median helper', () => {
  it('empty → 0', () => {
    expect(median([])).toBe(0);
  });
  it('single value', () => {
    expect(median([100])).toBe(100);
  });
  it('odd length', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
    expect(median([5, 1, 3, 4, 2])).toBe(3);  // unsorted input OK
  });
  it('even length → average', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('buildPromoEffectiveness', () => {
  it('empty/undefined input → empty array', () => {
    expect(buildPromoEffectiveness(undefined, 100)).toEqual([]);
    expect(buildPromoEffectiveness({}, 100)).toEqual([]);
  });

  it('no totalSystemSales → salesShare=0 nhưng vẫn tính các metric khác', () => {
    const rows = buildPromoEffectiveness({
      KM01: { code: 'KM01', name: 'Test', type: 'percent', count: 10, discount: 1_000_000, bonusSessions: 0, bonusDays: 0, sales: 10_000_000 },
    }, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].salesShare).toBe(0);
    expect(rows[0].costRatio).toBe(10);  // 1M / 10M = 10%
  });

  it('promoSales=0 → costRatio=0, arpc=0 (không chia cho 0)', () => {
    const rows = buildPromoEffectiveness({
      KM01: { code: 'KM01', name: 'Test', type: 'percent', count: 5, discount: 100_000, bonusSessions: 0, bonusDays: 0, sales: 0 },
    }, 100_000_000);
    expect(rows[0].costRatio).toBe(0);
    expect(rows[0].arpc).toBe(0);
    expect(rows[0].salesShare).toBe(0);
  });

  it('count=0 → arpc=0 + classification=insufficient_data', () => {
    const rows = buildPromoEffectiveness({
      KM01: { code: 'KM01', name: 'Test', type: 'percent', count: 0, discount: 0, bonusSessions: 0, bonusDays: 0, sales: 0 },
    }, 100_000_000);
    expect(rows[0].arpc).toBe(0);
    expect(rows[0].classification).toBe('insufficient_data');
  });

  it('classification HIGH: cost<15% + sales >= median + count >= 5', () => {
    // 2 promo: 1 high, 1 normal-ish. Median sales = 25M (avg 20M + 30M).
    const rows = buildPromoEffectiveness({
      KM01: { code: 'KM01', name: 'High', type: 'percent', count: 10, discount: 1_500_000, bonusSessions: 0, bonusDays: 0, sales: 30_000_000 },
      KM02: { code: 'KM02', name: 'Lower', type: 'percent', count: 8, discount: 4_000_000, bonusSessions: 0, bonusDays: 0, sales: 20_000_000 },
    }, 100_000_000);
    const high = rows.find((r) => r.code === 'KM01')!;
    expect(high.costRatio).toBe(5);  // 1.5M / 30M = 5%
    expect(high.classification).toBe('high');
    expect(high.recommendation).toBe('Nên duy trì');
  });

  it('classification REVIEW: cost>30% + sales < median + count >= 5', () => {
    const rows = buildPromoEffectiveness({
      KM01: { code: 'KM01', name: 'Good', type: 'percent', count: 10, discount: 1_000_000, bonusSessions: 0, bonusDays: 0, sales: 50_000_000 },
      KM02: { code: 'KM02', name: 'Bad', type: 'percent', count: 8, discount: 4_000_000, bonusSessions: 0, bonusDays: 0, sales: 10_000_000 },
    }, 100_000_000);
    const review = rows.find((r) => r.code === 'KM02')!;
    expect(review.costRatio).toBe(40);  // 4M / 10M = 40%
    expect(review.classification).toBe('review');
    expect(review.recommendation).toBe('Cần xem lại');
  });

  it('classification INSUFFICIENT_DATA: count < 5 bất kể cost ratio', () => {
    const rows = buildPromoEffectiveness({
      KM01: { code: 'KM01', name: 'New', type: 'percent', count: 3, discount: 100_000, bonusSessions: 0, bonusDays: 0, sales: 50_000_000 },
    }, 100_000_000);
    expect(rows[0].classification).toBe('insufficient_data');
    expect(rows[0].recommendation).toBe('Cần thêm dữ liệu');
  });

  it('classification NORMAL: trường hợp giữa (vd cost 15-30% hoặc sales >= median nhưng cost > 15%)', () => {
    const rows = buildPromoEffectiveness({
      KM01: { code: 'KM01', name: 'Mid', type: 'percent', count: 10, discount: 2_500_000, bonusSessions: 0, bonusDays: 0, sales: 20_000_000 },
      KM02: { code: 'KM02', name: 'Other', type: 'percent', count: 10, discount: 1_000_000, bonusSessions: 0, bonusDays: 0, sales: 30_000_000 },
    }, 100_000_000);
    const mid = rows.find((r) => r.code === 'KM01')!;
    expect(mid.costRatio).toBeCloseTo(12.5);  // 2.5M / 20M
    // sales=20M < median 25M → KHÔNG high. cost 12.5% < 30% nhưng KHÔNG > 30% → KHÔNG review.
    // Wait: spec high = cost < 15% AND sales >= median. KM01 cost 12.5% < 15% ✅ NHƯNG sales 20M < median 25M → fail high → normal.
    expect(mid.classification).toBe('normal');
  });

  it('median tính chỉ trên promo có sales > 0 (ignore 0)', () => {
    // 3 promo: 100M, 0, 50M → median chỉ 75M (avg 50+100) thay vì 50M nếu count cả 0.
    const rows = buildPromoEffectiveness({
      A: { code: 'A', name: 'A', type: 'percent', count: 10, discount: 1_000_000, bonusSessions: 0, bonusDays: 0, sales: 100_000_000 },
      B: { code: 'B', name: 'B', type: 'percent', count: 10, discount: 0, bonusSessions: 0, bonusDays: 0, sales: 0 },
      C: { code: 'C', name: 'C', type: 'percent', count: 10, discount: 1_000_000, bonusSessions: 0, bonusDays: 0, sales: 50_000_000 },
    }, 1_000_000_000);
    // median([50M, 100M]) = 75M
    // A: sales 100M >= 75M ✅ + cost 1% < 15% ✅ + count 10 ≥ 5 ✅ → high
    expect(rows.find((r) => r.code === 'A')!.classification).toBe('high');
    // C: sales 50M < 75M → fail high → normal (cost 2% < 30% nhưng sales < median nên KHÔNG review chuẩn vì cost không > 30%)
    expect(rows.find((r) => r.code === 'C')!.classification).toBe('normal');
  });

  it('sort theo promoSales DESC', () => {
    const rows = buildPromoEffectiveness({
      A: { code: 'A', name: 'A', type: 'percent', count: 5, discount: 0, bonusSessions: 0, bonusDays: 0, sales: 10_000_000 },
      B: { code: 'B', name: 'B', type: 'percent', count: 5, discount: 0, bonusSessions: 0, bonusDays: 0, sales: 50_000_000 },
      C: { code: 'C', name: 'C', type: 'percent', count: 5, discount: 0, bonusSessions: 0, bonusDays: 0, sales: 30_000_000 },
    }, 1_000_000_000);
    expect(rows.map((r) => r.code)).toEqual(['B', 'C', 'A']);
  });

  it('handle sales undefined (backward compat) → 0', () => {
    const rows = buildPromoEffectiveness({
      KM01: { code: 'KM01', name: 'Old API', type: 'percent', count: 5, discount: 100_000, bonusSessions: 0, bonusDays: 0 },
      // sales missing
    }, 100_000_000);
    expect(rows[0].promoSales).toBe(0);
    expect(rows[0].costRatio).toBe(0);
  });

  it('effectivenessScore: max sales = 100, others normalized', () => {
    const rows = buildPromoEffectiveness({
      A: { code: 'A', name: 'A', type: 'percent', count: 5, discount: 0, bonusSessions: 0, bonusDays: 0, sales: 100_000_000 },
      B: { code: 'B', name: 'B', type: 'percent', count: 5, discount: 0, bonusSessions: 0, bonusDays: 0, sales: 50_000_000 },
    }, 1_000_000_000);
    const a = rows.find((r) => r.code === 'A')!;
    const b = rows.find((r) => r.code === 'B')!;
    expect(a.effectivenessScore).toBe(100);
    expect(b.effectivenessScore).toBe(50);
  });
});
