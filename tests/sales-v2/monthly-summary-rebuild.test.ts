// PR-SUMMARY-03-WRITE-REBUILD-JOB (2026-06-29) — Tests cho pure helpers.
//
// CHỈ test các pure function (isValidMonth, getCurrentAndPreviousMonth,
// assertValidMonth, assertValidBranchId). Service rebuild dùng Firestore
// admin → cần mock phức tạp, defer cho integration test sau.
//
// LƯU Ý: import từ rebuild module CHỈ extract pure parts. Import full
// rebuild service sẽ trigger 'server-only' guard trong vitest node env
// nếu shim không cover — đã có alias tests/__mocks__/server-only.ts.

import { describe, it, expect } from 'vitest';
import {
  isValidMonth,
  assertValidMonth,
  assertValidBranchId,
  getCurrentAndPreviousMonth,
  RebuildValidationError,
  REBUILD_HARD_LIMIT,
} from '@/lib/sales-v2/monthly-summary-rebuild';

describe('isValidMonth', () => {
  it.each([
    ['2026-01', true],
    ['2026-12', true],
    ['2024-06', true],
    ['2030-09', true],
  ])('%s → %s (valid YYYY-MM)', (input, expected) => {
    expect(isValidMonth(input)).toBe(expected);
  });

  it.each([
    ['2026-1', false],         // 1 digit month
    ['26-01', false],          // 2 digit year
    ['2026/01', false],        // wrong separator
    ['2026-01-15', false],     // date format
    ['', false],
    ['abc', false],
    ['2026-13', true],         // KHÔNG validate range tháng — chỉ format
    ['9999-99', true],         // same
  ])('%s → %s', (input, expected) => {
    expect(isValidMonth(input)).toBe(expected);
  });
});

describe('assertValidMonth', () => {
  it('valid → không throw', () => {
    expect(() => assertValidMonth('2026-06')).not.toThrow();
  });

  it('invalid → throw RebuildValidationError 400', () => {
    expect(() => assertValidMonth('bad')).toThrow(RebuildValidationError);
    try {
      assertValidMonth('bad');
    } catch (err) {
      expect((err as RebuildValidationError).status).toBe(400);
      expect((err as RebuildValidationError).message).toContain('YYYY-MM');
    }
  });
});

describe('assertValidBranchId', () => {
  it.each(['HM', 'TK', 'CTT', '24', 'TT'])('valid %s → không throw', (id) => {
    expect(() => assertValidBranchId(id)).not.toThrow();
  });

  it.each(['XX', 'hm', '', 'NCT24', 'GP-HM'])('invalid %s → throw 400', (id) => {
    expect(() => assertValidBranchId(id)).toThrow(RebuildValidationError);
  });
});

describe('getCurrentAndPreviousMonth', () => {
  it('giữa tháng 6 → current=06, previous=05', () => {
    // 2026-06-15 10:00 UTC = 17:00 VN (cùng ngày 15-06)
    const ms = Date.UTC(2026, 5, 15, 10, 0); // month index 5 = June
    const r = getCurrentAndPreviousMonth(ms);
    expect(r.current).toBe('2026-06');
    expect(r.previous).toBe('2026-05');
  });

  it('tháng 1 → previous = tháng 12 năm trước', () => {
    const ms = Date.UTC(2026, 0, 15, 0, 0); // 2026-01-15
    const r = getCurrentAndPreviousMonth(ms);
    expect(r.current).toBe('2026-01');
    expect(r.previous).toBe('2025-12');
  });

  it('tháng 12 → previous = tháng 11 cùng năm', () => {
    const ms = Date.UTC(2026, 11, 15, 0, 0);
    const r = getCurrentAndPreviousMonth(ms);
    expect(r.current).toBe('2026-12');
    expect(r.previous).toBe('2026-11');
  });

  it('UTC 17:00 ngày cuối tháng = VN 00:00 ngày 1 tháng sau → current sang tháng mới', () => {
    // 2026-06-30 17:00 UTC = 2026-07-01 00:00 VN
    const ms = Date.UTC(2026, 5, 30, 17, 0);
    const r = getCurrentAndPreviousMonth(ms);
    expect(r.current).toBe('2026-07');
    expect(r.previous).toBe('2026-06');
  });

  it('format luôn YYYY-MM (zero-pad)', () => {
    const ms = Date.UTC(2026, 2, 5, 5, 0); // March
    const r = getCurrentAndPreviousMonth(ms);
    expect(r.current).toBe('2026-03');
    expect(r.previous).toBe('2026-02');
    expect(r.current).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('REBUILD_HARD_LIMIT', () => {
  it('= 20000 (cushion 5x so với current peak ~4000 tx/branch/month)', () => {
    expect(REBUILD_HARD_LIMIT).toBe(20_000);
  });
});

describe('RebuildValidationError', () => {
  it('có name + status properties', () => {
    const err = new RebuildValidationError(400, 'test message');
    expect(err.name).toBe('RebuildValidationError');
    expect(err.status).toBe(400);
    expect(err.message).toBe('test message');
    expect(err).toBeInstanceOf(Error);
  });
});
