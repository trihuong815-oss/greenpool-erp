// PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24) — Pure helper tests.

import { describe, it, expect } from 'vitest';
import {
  getActivePaymentFields,
  isSplitPayment,
  normalizePaymentBreakdown,
  validatePaymentBreakdown,
  deriveBreakdownFromLegacy,
  resolveBreakdown,
  breakdownMatchesTotal,
  EMPTY_BREAKDOWN,
} from '@/lib/sales-v2/payment-split';

describe('getActivePaymentFields', () => {
  it('tien_mat → [cash]', () => expect(getActivePaymentFields('tien_mat')).toEqual(['cash']));
  it('chuyen_khoan → [transfer]', () => expect(getActivePaymentFields('chuyen_khoan')).toEqual(['transfer']));
  it('pos → [card]', () => expect(getActivePaymentFields('pos')).toEqual(['card']));
  it('tien_mat_chuyen_khoan → [cash, transfer]', () => expect(getActivePaymentFields('tien_mat_chuyen_khoan')).toEqual(['cash', 'transfer']));
  it('tien_mat_pos → [cash, card]', () => expect(getActivePaymentFields('tien_mat_pos')).toEqual(['cash', 'card']));
  it('chuyen_khoan_pos → [transfer, card]', () => expect(getActivePaymentFields('chuyen_khoan_pos')).toEqual(['transfer', 'card']));
});

describe('isSplitPayment', () => {
  it.each(['tien_mat', 'chuyen_khoan', 'pos'] as const)('%s → false', (m) => expect(isSplitPayment(m)).toBe(false));
  it.each(['tien_mat_chuyen_khoan', 'tien_mat_pos', 'chuyen_khoan_pos'] as const)('%s → true', (m) => expect(isSplitPayment(m)).toBe(true));
});

describe('normalizePaymentBreakdown — single method', () => {
  it('tien_mat: collectedToday → cash', () => {
    expect(normalizePaymentBreakdown('tien_mat', 1_000_000)).toEqual({ cash: 1_000_000, transfer: 0, card: 0 });
  });
  it('chuyen_khoan: collectedToday → transfer', () => {
    expect(normalizePaymentBreakdown('chuyen_khoan', 500_000)).toEqual({ cash: 0, transfer: 500_000, card: 0 });
  });
  it('pos: collectedToday → card', () => {
    expect(normalizePaymentBreakdown('pos', 700_000)).toEqual({ cash: 0, transfer: 0, card: 700_000 });
  });
  it('single method ignore breakdownInput nếu có', () => {
    // input có cash=999 nhưng method=chuyen_khoan → vẫn dùng collectedToday cho transfer
    expect(normalizePaymentBreakdown('chuyen_khoan', 800_000, { cash: 999, transfer: 1, card: 2 })).toEqual({ cash: 0, transfer: 800_000, card: 0 });
  });
});

describe('normalizePaymentBreakdown — split method', () => {
  it('cash_transfer: dùng 2 ô active từ input, ô khác = 0', () => {
    expect(normalizePaymentBreakdown('tien_mat_chuyen_khoan', 1_000_000, { cash: 300_000, transfer: 700_000, card: 999 }))
      .toEqual({ cash: 300_000, transfer: 700_000, card: 0 });
  });
  it('cash_pos', () => {
    expect(normalizePaymentBreakdown('tien_mat_pos', 1_000_000, { cash: 200_000, transfer: 999, card: 800_000 }))
      .toEqual({ cash: 200_000, transfer: 0, card: 800_000 });
  });
  it('transfer_pos', () => {
    expect(normalizePaymentBreakdown('chuyen_khoan_pos', 1_000_000, { cash: 999, transfer: 400_000, card: 600_000 }))
      .toEqual({ cash: 0, transfer: 400_000, card: 600_000 });
  });
  it('split method without breakdown input → all 0 (caller validate sẽ reject)', () => {
    expect(normalizePaymentBreakdown('tien_mat_chuyen_khoan', 1_000_000)).toEqual({ cash: 0, transfer: 0, card: 0 });
  });
});

describe('validatePaymentBreakdown', () => {
  it('single tien_mat hợp lệ', () => {
    expect(validatePaymentBreakdown('tien_mat', 1_000_000, { cash: 1_000_000, transfer: 0, card: 0 })).toEqual({ ok: true });
  });
  it('split: 2 ô active > 0 + tổng khớp → OK', () => {
    expect(validatePaymentBreakdown('tien_mat_chuyen_khoan', 1_000_000, { cash: 300_000, transfer: 700_000, card: 0 })).toEqual({ ok: true });
  });
  it('split thiếu 1 ô active → FAIL', () => {
    const r = validatePaymentBreakdown('tien_mat_chuyen_khoan', 1_000_000, { cash: 1_000_000, transfer: 0, card: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('2 hình thức thanh toán');
  });
  it('split: ô inactive > 0 → FAIL', () => {
    const r = validatePaymentBreakdown('tien_mat_chuyen_khoan', 1_000_000, { cash: 300_000, transfer: 700_000, card: 100 });
    expect(r.ok).toBe(false);
  });
  it('single: ô inactive > 0 → FAIL (vd tien_mat nhưng transfer > 0)', () => {
    const r = validatePaymentBreakdown('tien_mat', 1_000_000, { cash: 1_000_000, transfer: 1, card: 0 });
    expect(r.ok).toBe(false);
  });
  it('tổng mismatch → FAIL', () => {
    const r = validatePaymentBreakdown('tien_mat_chuyen_khoan', 1_000_000, { cash: 300_000, transfer: 600_000, card: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('không khớp');
  });
  it('giá trị âm → FAIL', () => {
    const r = validatePaymentBreakdown('tien_mat_chuyen_khoan', 1_000_000, { cash: -100, transfer: 1_000_100, card: 0 });
    expect(r.ok).toBe(false);
  });
  it('NaN → FAIL', () => {
    const r = validatePaymentBreakdown('tien_mat', 1_000_000, { cash: NaN, transfer: 0, card: 0 });
    expect(r.ok).toBe(false);
  });
});

describe('deriveBreakdownFromLegacy', () => {
  it('tien_mat 500k → cash 500k', () => expect(deriveBreakdownFromLegacy('tien_mat', 500_000)).toEqual({ cash: 500_000, transfer: 0, card: 0 }));
  it('chuyen_khoan 800k → transfer 800k', () => expect(deriveBreakdownFromLegacy('chuyen_khoan', 800_000)).toEqual({ cash: 0, transfer: 800_000, card: 0 }));
  it('pos 1tr → card 1tr', () => expect(deriveBreakdownFromLegacy('pos', 1_000_000)).toEqual({ cash: 0, transfer: 0, card: 1_000_000 }));
  it('combo method legacy fallback → all 0 (defensive)', () => {
    expect(deriveBreakdownFromLegacy('tien_mat_chuyen_khoan', 1_000_000)).toEqual({ cash: 0, transfer: 0, card: 0 });
  });
});

describe('resolveBreakdown — doc reader', () => {
  it('doc có paymentBreakdown → dùng nguyên', () => {
    expect(resolveBreakdown({ paymentMethod: 'tien_mat_chuyen_khoan', collectedToday: 1_000_000, paymentBreakdown: { cash: 300_000, transfer: 700_000, card: 0 } }))
      .toEqual({ cash: 300_000, transfer: 700_000, card: 0 });
  });
  it('doc không có paymentBreakdown → fallback legacy', () => {
    expect(resolveBreakdown({ paymentMethod: 'tien_mat', collectedToday: 500_000 }))
      .toEqual({ cash: 500_000, transfer: 0, card: 0 });
  });
  it('doc có paymentBreakdown null → fallback legacy', () => {
    expect(resolveBreakdown({ paymentMethod: 'chuyen_khoan', collectedToday: 800_000, paymentBreakdown: null }))
      .toEqual({ cash: 0, transfer: 800_000, card: 0 });
  });
});

describe('Aggregation invariant — daily summary case', () => {
  it('3 giao dịch split → cash 500k / transfer 1.1tr / card 1.4tr / total 3tr', () => {
    const txs = [
      { paymentMethod: 'tien_mat_chuyen_khoan' as const, collectedToday: 1_000_000, paymentBreakdown: { cash: 300_000, transfer: 700_000, card: 0 } },
      { paymentMethod: 'tien_mat_pos' as const, collectedToday: 1_000_000, paymentBreakdown: { cash: 200_000, transfer: 0, card: 800_000 } },
      { paymentMethod: 'chuyen_khoan_pos' as const, collectedToday: 1_000_000, paymentBreakdown: { cash: 0, transfer: 400_000, card: 600_000 } },
    ];
    let cash = 0, transfer = 0, card = 0;
    for (const tx of txs) {
      const b = resolveBreakdown(tx);
      cash += b.cash; transfer += b.transfer; card += b.card;
    }
    expect(cash).toBe(500_000);
    expect(transfer).toBe(1_100_000);
    expect(card).toBe(1_400_000);
    expect(cash + transfer + card).toBe(3_000_000);
  });

  it('Mix legacy + split → tổng đúng nhờ resolveBreakdown fallback', () => {
    const txs = [
      { paymentMethod: 'tien_mat' as const, collectedToday: 500_000 },                      // legacy
      { paymentMethod: 'chuyen_khoan' as const, collectedToday: 800_000 },                  // legacy
      { paymentMethod: 'tien_mat_pos' as const, collectedToday: 1_000_000, paymentBreakdown: { cash: 400_000, transfer: 0, card: 600_000 } },
    ];
    let cash = 0, transfer = 0, card = 0;
    for (const tx of txs) {
      const b = resolveBreakdown(tx);
      cash += b.cash; transfer += b.transfer; card += b.card;
    }
    expect(cash).toBe(900_000);       // 500 legacy + 400 split
    expect(transfer).toBe(800_000);   // 800 legacy
    expect(card).toBe(600_000);       // 600 split
  });
});

describe('breakdownMatchesTotal', () => {
  it('exact match → true', () => expect(breakdownMatchesTotal({ cash: 300, transfer: 700, card: 0 }, 1000)).toBe(true));
  it('mismatch → false', () => expect(breakdownMatchesTotal({ cash: 300, transfer: 600, card: 0 }, 1000)).toBe(false));
  it('EMPTY = 0 → 0 match', () => expect(breakdownMatchesTotal(EMPTY_BREAKDOWN, 0)).toBe(true));
});
