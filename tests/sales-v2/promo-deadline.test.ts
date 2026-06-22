// PR-PROMO1A (2026-06-22) — Deadline helper tests.

import { describe, it, expect } from 'vitest';
import {
  getDeadlineMonth,
  getDeadlineStatus,
  getDeadlineMessage,
  getDeadlineTone,
  PROMO_DEADLINE_DAY,
  PROMO_REMINDER_LEAD_DAYS,
} from '@/lib/sales-v2/promo-deadline';

// VN time helpers
const VN_OFFSET = 7 * 3600 * 1000;
/** ms epoch tương ứng với một thời điểm VN local. */
function vnTime(year: number, monthHuman: number, day: number, hour = 12): number {
  return Date.UTC(year, monthHuman - 1, day, hour) - VN_OFFSET;
}

describe('PROMO_DEADLINE_DAY constants', () => {
  it('day 25 + lead 2', () => {
    expect(PROMO_DEADLINE_DAY).toBe(25);
    expect(PROMO_REMINDER_LEAD_DAYS).toBe(2);
  });
});

describe('getDeadlineMonth', () => {
  it('tháng giữa năm: target=2026-07 → deadline tháng 6', () => {
    expect(getDeadlineMonth('2026-07')).toEqual({ year: 2026, month: 6 });
  });

  it('tháng 1 rollover năm trước', () => {
    expect(getDeadlineMonth('2026-01')).toEqual({ year: 2025, month: 12 });
  });

  it('format invalid → null', () => {
    expect(getDeadlineMonth('2026')).toBeNull();
    expect(getDeadlineMonth('2026-13')).toBeNull();
    expect(getDeadlineMonth('2026-00')).toBeNull();
    expect(getDeadlineMonth('abc')).toBeNull();
  });
});

describe('getDeadlineStatus — same deadline month (target 2026-07 → deadline 2026-06-25)', () => {
  const target = '2026-07';

  it('ngày 20 (chưa tới D-2) → no_warning', () => {
    expect(getDeadlineStatus(target, vnTime(2026, 6, 20))).toBe('no_warning');
  });

  it('ngày 22 (chưa tới D-2 vì lead=2 → D-2 = 23) → no_warning', () => {
    expect(getDeadlineStatus(target, vnTime(2026, 6, 22))).toBe('no_warning');
  });

  it('ngày 23 (= D-2) → reminder_d2', () => {
    expect(getDeadlineStatus(target, vnTime(2026, 6, 23))).toBe('reminder_d2');
  });

  it('ngày 24 (= D-1) → reminder_d2', () => {
    expect(getDeadlineStatus(target, vnTime(2026, 6, 24))).toBe('reminder_d2');
  });

  it('ngày 25 (= D) → d_day', () => {
    expect(getDeadlineStatus(target, vnTime(2026, 6, 25))).toBe('d_day');
  });

  it('ngày 26 (= D+1) → overdue', () => {
    expect(getDeadlineStatus(target, vnTime(2026, 6, 26))).toBe('overdue');
  });

  it('ngày 30 cuối tháng deadline → overdue', () => {
    expect(getDeadlineStatus(target, vnTime(2026, 6, 30))).toBe('overdue');
  });
});

describe('getDeadlineStatus — cross-month boundaries', () => {
  it('tháng trước deadline (now=2026-05-25, target=2026-07 → deadline 2026-06) → no_warning', () => {
    expect(getDeadlineStatus('2026-07', vnTime(2026, 5, 25))).toBe('no_warning');
  });

  it('sang tháng sau deadline (now=2026-07-01, target=2026-07) → overdue', () => {
    expect(getDeadlineStatus('2026-07', vnTime(2026, 7, 1))).toBe('overdue');
  });

  it('rollover năm: target=2026-01 → deadline=2025-12-25. now=2025-12-23 → reminder', () => {
    expect(getDeadlineStatus('2026-01', vnTime(2025, 12, 23))).toBe('reminder_d2');
  });

  it('rollover năm: target=2026-01, now=2025-12-25 → d_day', () => {
    expect(getDeadlineStatus('2026-01', vnTime(2025, 12, 25))).toBe('d_day');
  });

  it('rollover năm: target=2026-01, now=2026-01-01 → overdue', () => {
    expect(getDeadlineStatus('2026-01', vnTime(2026, 1, 1))).toBe('overdue');
  });
});

describe('getDeadlineStatus — invalid target month', () => {
  it('invalid → no_warning (fallback safe)', () => {
    expect(getDeadlineStatus('abc', Date.UTC(2026, 5, 25))).toBe('no_warning');
    expect(getDeadlineStatus('', Date.UTC(2026, 5, 25))).toBe('no_warning');
  });
});

describe('getDeadlineMessage', () => {
  it('no_warning → empty string', () => {
    expect(getDeadlineMessage('no_warning', '2026-07')).toBe('');
  });

  it('reminder_d2 → có ngày deadline + tháng target', () => {
    const msg = getDeadlineMessage('reminder_d2', '2026-07');
    expect(msg).toContain('25/06');
    expect(msg).toContain('07/2026');
    expect(msg).toContain('Còn');
  });

  it('d_day → text "hạn cuối"', () => {
    const msg = getDeadlineMessage('d_day', '2026-07');
    expect(msg).toContain('hạn cuối');
    expect(msg).toContain('25/06');
  });

  it('overdue → text "quá hạn" + "nộp muộn"', () => {
    const msg = getDeadlineMessage('overdue', '2026-07');
    expect(msg).toContain('quá hạn');
    expect(msg).toContain('nộp muộn');
  });
});

describe('getDeadlineTone', () => {
  it.each([
    ['no_warning', 'slate'],
    ['reminder_d2', 'amber'],
    ['d_day', 'orange'],
    ['overdue', 'rose'],
  ] as const)('%s → %s', (status, tone) => {
    expect(getDeadlineTone(status)).toBe(tone);
  });
});
