// PR-CASH-DATE-RANGE-UX (2026-06-24) — Pure helper tests.

import { describe, it, expect } from 'vitest';
import {
  addDaysISO,
  ymd,
  lastDayOfMonth,
  parseYmd,
  computeDateRange,
  detectDatePreset,
  rangeDays,
  isValidDateRange,
  computeMonthRange,
  detectMonthPreset,
  addMonths,
  monthOf,
  rangeMonths,
  isValidMonthRange,
  listMonthsInRange,
  listYearsInRange,
} from '@/lib/finance/date-presets';

const TODAY = '2026-06-24';

describe('addDaysISO + ymd + parse', () => {
  it('addDaysISO +1', () => expect(addDaysISO('2026-06-24', 1)).toBe('2026-06-25'));
  it('addDaysISO -1', () => expect(addDaysISO('2026-06-01', -1)).toBe('2026-05-31'));
  it('addDaysISO cross year', () => expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01'));
  it('ymd pads', () => expect(ymd(2026, 3, 5)).toBe('2026-03-05'));
  it('lastDayOfMonth Feb 2024 (leap)', () => expect(lastDayOfMonth(2024, 2)).toBe(29));
  it('lastDayOfMonth Feb 2025 (non-leap)', () => expect(lastDayOfMonth(2025, 2)).toBe(28));
  it('lastDayOfMonth Apr', () => expect(lastDayOfMonth(2026, 4)).toBe(30));
  it('parseYmd valid', () => expect(parseYmd('2026-06-24')).toEqual({ year: 2026, month: 6, day: 24 }));
  it('parseYmd invalid', () => expect(parseYmd('abc')).toBeNull());
});

describe('computeDateRange — presets', () => {
  it('today = same day', () => expect(computeDateRange('today', TODAY)).toEqual({ dateFrom: TODAY, dateTo: TODAY }));
  it('yesterday = T-1', () => expect(computeDateRange('yesterday', TODAY)).toEqual({ dateFrom: '2026-06-23', dateTo: '2026-06-23' }));
  it('last7 = T-6 → T (7 ngày)', () => expect(computeDateRange('last7', TODAY)).toEqual({ dateFrom: '2026-06-18', dateTo: TODAY }));
  it('last30 = T-29 → T', () => expect(computeDateRange('last30', TODAY)).toEqual({ dateFrom: '2026-05-26', dateTo: TODAY }));
  it('thisMonth = 01 → T (KHÔNG vượt today)', () => expect(computeDateRange('thisMonth', TODAY)).toEqual({ dateFrom: '2026-06-01', dateTo: TODAY }));
  it('lastMonth = full tháng trước', () => expect(computeDateRange('lastMonth', TODAY)).toEqual({ dateFrom: '2026-05-01', dateTo: '2026-05-31' }));
  it('lastMonth cross-year (T = Jan)', () => expect(computeDateRange('lastMonth', '2026-01-15')).toEqual({ dateFrom: '2025-12-01', dateTo: '2025-12-31' }));
  it('lastMonth Feb leap year', () => expect(computeDateRange('lastMonth', '2024-03-15')).toEqual({ dateFrom: '2024-02-01', dateTo: '2024-02-29' }));
  it('custom → null (caller dùng range riêng)', () => expect(computeDateRange('custom', TODAY)).toBeNull());
});

describe('detectDatePreset — round-trip', () => {
  it('today round-trip', () => expect(detectDatePreset({ dateFrom: TODAY, dateTo: TODAY }, TODAY)).toBe('today'));
  it('lastMonth round-trip', () => expect(detectDatePreset({ dateFrom: '2026-05-01', dateTo: '2026-05-31' }, TODAY)).toBe('lastMonth'));
  it('random range → custom', () => expect(detectDatePreset({ dateFrom: '2026-06-10', dateTo: '2026-06-20' }, TODAY)).toBe('custom'));
  it('thisMonth round-trip', () => expect(detectDatePreset({ dateFrom: '2026-06-01', dateTo: TODAY }, TODAY)).toBe('thisMonth'));
});

describe('rangeDays + isValidDateRange', () => {
  it('rangeDays 1 day = 1', () => expect(rangeDays({ dateFrom: TODAY, dateTo: TODAY })).toBe(1));
  it('rangeDays 7 days', () => expect(rangeDays({ dateFrom: '2026-06-18', dateTo: '2026-06-24' })).toBe(7));
  it('rangeDays 31 days', () => expect(rangeDays({ dateFrom: '2026-06-01', dateTo: '2026-07-01' })).toBe(31));
  it('isValid OK', () => expect(isValidDateRange({ dateFrom: TODAY, dateTo: TODAY })).toBe(true));
  it('isValid from > to → false', () => expect(isValidDateRange({ dateFrom: '2026-06-25', dateTo: '2026-06-24' })).toBe(false));
  it('isValid bad format → false', () => expect(isValidDateRange({ dateFrom: 'abc', dateTo: TODAY })).toBe(false));
});

describe('monthOf + addMonths', () => {
  it('monthOf', () => expect(monthOf('2026-06-24')).toBe('2026-06'));
  it('addMonths +1', () => expect(addMonths('2026-06', 1)).toBe('2026-07'));
  it('addMonths -1 cross-year', () => expect(addMonths('2026-01', -1)).toBe('2025-12'));
  it('addMonths +12', () => expect(addMonths('2026-06', 12)).toBe('2027-06'));
});

describe('computeMonthRange', () => {
  it('thisMonth', () => expect(computeMonthRange('thisMonth', TODAY)).toEqual({ monthFrom: '2026-06', monthTo: '2026-06' }));
  it('lastMonth', () => expect(computeMonthRange('lastMonth', TODAY)).toEqual({ monthFrom: '2026-05', monthTo: '2026-05' }));
  it('last3 (3 tháng gần nhất)', () => expect(computeMonthRange('last3', TODAY)).toEqual({ monthFrom: '2026-04', monthTo: '2026-06' }));
  it('last6', () => expect(computeMonthRange('last6', TODAY)).toEqual({ monthFrom: '2026-01', monthTo: '2026-06' }));
  it('custom → null', () => expect(computeMonthRange('custom', TODAY)).toBeNull());
});

describe('detectMonthPreset', () => {
  it('thisMonth round-trip', () => expect(detectMonthPreset({ monthFrom: '2026-06', monthTo: '2026-06' }, TODAY)).toBe('thisMonth'));
  it('last3 round-trip', () => expect(detectMonthPreset({ monthFrom: '2026-04', monthTo: '2026-06' }, TODAY)).toBe('last3'));
  it('arbitrary → custom', () => expect(detectMonthPreset({ monthFrom: '2026-03', monthTo: '2026-05' }, TODAY)).toBe('custom'));
});

describe('rangeMonths + isValidMonthRange + list', () => {
  it('rangeMonths 1', () => expect(rangeMonths({ monthFrom: '2026-06', monthTo: '2026-06' })).toBe(1));
  it('rangeMonths 12', () => expect(rangeMonths({ monthFrom: '2026-01', monthTo: '2026-12' })).toBe(12));
  it('rangeMonths cross-year', () => expect(rangeMonths({ monthFrom: '2025-11', monthTo: '2026-02' })).toBe(4));
  it('isValid OK', () => expect(isValidMonthRange({ monthFrom: '2026-06', monthTo: '2026-08' })).toBe(true));
  it('isValid from > to → false', () => expect(isValidMonthRange({ monthFrom: '2026-08', monthTo: '2026-06' })).toBe(false));
  it('listMonthsInRange 3 tháng', () => expect(listMonthsInRange({ monthFrom: '2026-04', monthTo: '2026-06' })).toEqual(['2026-04', '2026-05', '2026-06']));
  it('listMonthsInRange cross-year', () => expect(listMonthsInRange({ monthFrom: '2025-11', monthTo: '2026-02' })).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']));
});

describe('listYearsInRange', () => {
  it('3 năm', () => expect(listYearsInRange({ yearFrom: 2024, yearTo: 2026 })).toEqual([2024, 2025, 2026]));
  it('1 năm', () => expect(listYearsInRange({ yearFrom: 2026, yearTo: 2026 })).toEqual([2026]));
  it('from > to → []', () => expect(listYearsInRange({ yearFrom: 2027, yearTo: 2026 })).toEqual([]));
});
