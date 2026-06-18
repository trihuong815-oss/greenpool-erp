// V7 Promo (2026-06-18) — Unit tests cho công thức + combo validation.
// Tests CHUẨN KHÔNG SAI ở edge cases — vì user nhấn mạnh "công thức chuẩn không sai".

import { describe, it, expect } from 'vitest';
import {
  computeDiscount, validatePromoCombo, isDiscountType, isBonusType,
  type PromoType,
} from '@/lib/types/sales-program';

describe('computeDiscount — discount formula', () => {
  describe('percent', () => {
    it('10% của 1.000.000 = 100.000', () => {
      expect(computeDiscount(1_000_000, 'percent', 10)).toBe(100_000);
    });
    it('0% = 0', () => {
      expect(computeDiscount(1_000_000, 'percent', 0)).toBe(0);
    });
    it('100% = toàn bộ base', () => {
      expect(computeDiscount(500_000, 'percent', 100)).toBe(500_000);
    });
    it('>100% được cap về 100% (server clamp)', () => {
      expect(computeDiscount(500_000, 'percent', 150)).toBe(500_000);
    });
    it('âm % → 0 (clamp)', () => {
      expect(computeDiscount(500_000, 'percent', -10)).toBe(0);
    });
    it('round half (10% của 999 = 99.9 → 100)', () => {
      expect(computeDiscount(999, 'percent', 10)).toBe(100);
    });
    it('base = 0 → discount = 0', () => {
      expect(computeDiscount(0, 'percent', 10)).toBe(0);
    });
    it('base âm → 0', () => {
      expect(computeDiscount(-100, 'percent', 10)).toBe(0);
    });
  });

  describe('fixed_amount', () => {
    it('giảm 500.000 trên gói 5.000.000 = 500.000', () => {
      expect(computeDiscount(5_000_000, 'fixed_amount', 500_000)).toBe(500_000);
    });
    it('giảm > base → cap ở base (không cho âm)', () => {
      expect(computeDiscount(300_000, 'fixed_amount', 500_000)).toBe(300_000);
    });
    it('giảm 0 = 0', () => {
      expect(computeDiscount(1_000_000, 'fixed_amount', 0)).toBe(0);
    });
    it('giảm âm → 0', () => {
      expect(computeDiscount(1_000_000, 'fixed_amount', -100)).toBe(0);
    });
  });

  describe('bonus types — không giảm tiền', () => {
    it('bonus_sessions → discount = 0 (tặng buổi, không giảm tiền)', () => {
      expect(computeDiscount(5_000_000, 'bonus_sessions', 5)).toBe(0);
    });
    it('bonus_days → discount = 0 (tặng ngày, không giảm tiền)', () => {
      expect(computeDiscount(7_000_000, 'bonus_days', 30)).toBe(0);
    });
  });
});

describe('validatePromoCombo — rule 1 discount + 1 bonus, max 2', () => {
  it('rỗng → ok', () => {
    expect(validatePromoCombo([])).toEqual({ ok: true });
  });
  it('1 promo bất kỳ → ok', () => {
    expect(validatePromoCombo([{ promoType: 'percent' }])).toEqual({ ok: true });
    expect(validatePromoCombo([{ promoType: 'bonus_sessions' }])).toEqual({ ok: true });
  });
  it('1 discount + 1 bonus → ok', () => {
    expect(validatePromoCombo([{ promoType: 'percent' }, { promoType: 'bonus_sessions' }])).toEqual({ ok: true });
    expect(validatePromoCombo([{ promoType: 'fixed_amount' }, { promoType: 'bonus_days' }])).toEqual({ ok: true });
  });
  it('2 discount → reject', () => {
    const res = validatePromoCombo([{ promoType: 'percent' }, { promoType: 'fixed_amount' }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('1 mã giảm giá');
  });
  it('2 bonus → reject', () => {
    const res = validatePromoCombo([{ promoType: 'bonus_sessions' }, { promoType: 'bonus_days' }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('1 mã tặng');
  });
  it('> 2 promo → reject (tối đa 2)', () => {
    const res = validatePromoCombo([
      { promoType: 'percent' }, { promoType: 'bonus_sessions' }, { promoType: 'fixed_amount' },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('Tối đa 2');
  });
});

describe('isDiscountType / isBonusType — phân loại', () => {
  it('percent + fixed_amount → discount', () => {
    expect(isDiscountType('percent')).toBe(true);
    expect(isDiscountType('fixed_amount')).toBe(true);
    expect(isDiscountType('bonus_sessions')).toBe(false);
    expect(isDiscountType('bonus_days')).toBe(false);
  });
  it('bonus_sessions + bonus_days → bonus', () => {
    expect(isBonusType('bonus_sessions')).toBe(true);
    expect(isBonusType('bonus_days')).toBe(true);
    expect(isBonusType('percent')).toBe(false);
    expect(isBonusType('fixed_amount')).toBe(false);
  });
  it('mỗi promoType chỉ thuộc đúng 1 nhóm (no overlap)', () => {
    const all: PromoType[] = ['percent', 'fixed_amount', 'bonus_sessions', 'bonus_days'];
    for (const t of all) {
      expect(isDiscountType(t) !== isBonusType(t)).toBe(true);
    }
  });
});

describe('end-to-end scenarios mô phỏng /nhap', () => {
  // Gói cố định 5M, áp giảm 10% → khách trả 4.5M
  it('Non-PT + percent 10%', () => {
    const base = 5_000_000;
    const discount = computeDiscount(base, 'percent', 10);
    expect(discount).toBe(500_000);
    expect(base - discount).toBe(4_500_000);
  });
  // Gói PT 10 buổi × 600k = 6M, giảm 500k → khách trả 5.5M
  it('PT + fixed_amount 500k', () => {
    const qty = 10, up = 600_000;
    const base = qty * up;
    const discount = computeDiscount(base, 'fixed_amount', 500_000);
    expect(discount).toBe(500_000);
    expect(base - discount).toBe(5_500_000);
  });
  // Gói PT 10 buổi × 600k = 6M, tặng 2 buổi → khách trả 6M, nhận 12 buổi
  it('PT + bonus_sessions 2', () => {
    const qty = 10, up = 600_000, bonus = 2;
    const base = qty * up;
    const discount = computeDiscount(base, 'bonus_sessions', bonus);
    expect(discount).toBe(0); // tặng buổi không giảm tiền
    expect(base).toBe(6_000_000);
    // Số buổi thực nhận = qty + bonus (server track riêng bonusQuantity)
    expect(qty + bonus).toBe(12);
  });
  // Combo: gói 1 năm 7M, giảm 10% + tặng 30 ngày
  it('combo percent + bonus_days', () => {
    const base = 7_000_000;
    const discount = computeDiscount(base, 'percent', 10);
    expect(discount).toBe(700_000);
    expect(base - discount).toBe(6_300_000);
    // bonus_days là tracking field — không giảm tiền
    expect(computeDiscount(base, 'bonus_days', 30)).toBe(0);
  });
});
