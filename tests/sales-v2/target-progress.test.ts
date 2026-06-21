// PR-TK3A (2026-06-21) — Unit test pure helpers compute target progress.

import { describe, it, expect } from 'vitest';
import {
  computeTargetStatus,
  buildTargetSummary,
  parseMonth,
} from '@/lib/sales-v2/target-progress';

describe('parseMonth', () => {
  it('YYYY-MM → year + monthIndex (0-11)', () => {
    expect(parseMonth('2026-01')).toEqual({ year: 2026, monthIndex: 0 });
    expect(parseMonth('2026-06')).toEqual({ year: 2026, monthIndex: 5 });
    expect(parseMonth('2026-12')).toEqual({ year: 2026, monthIndex: 11 });
  });
});

describe('computeTargetStatus', () => {
  it('target null/0 → not_set', () => {
    expect(computeTargetStatus(null, null, 50)).toBe('not_set');
    expect(computeTargetStatus(0, 0, 50)).toBe('not_set');
    expect(computeTargetStatus(100, null, 50)).toBe('not_set');
  });

  it('percentComplete >= 100 → achieved', () => {
    expect(computeTargetStatus(100, 100, 50)).toBe('achieved');
    expect(computeTargetStatus(100, 120, 50)).toBe('achieved');
  });

  it('percentComplete >= daysElapsed → on_track', () => {
    expect(computeTargetStatus(100, 60, 50)).toBe('on_track');
    expect(computeTargetStatus(100, 50, 50)).toBe('on_track');  // bằng = on_track
  });

  it('progressGap >= -10 → watch', () => {
    expect(computeTargetStatus(100, 40, 50)).toBe('watch');     // gap=-10
    expect(computeTargetStatus(100, 41, 50)).toBe('watch');     // gap=-9
  });

  it('progressGap < -10 → behind', () => {
    expect(computeTargetStatus(100, 30, 50)).toBe('behind');    // gap=-20
    expect(computeTargetStatus(100, 0, 50)).toBe('behind');     // gap=-50
  });
});

describe('buildTargetSummary', () => {
  it('target null → status=not_set, fields null', () => {
    const t = buildTargetSummary('branch', null, 5_000_000, '2026-06');
    expect(t.status).toBe('not_set');
    expect(t.targetRevenue).toBeNull();
    expect(t.percentComplete).toBeNull();
    expect(t.remaining).toBeNull();
    expect(t.progressGap).toBeNull();
    expect(t.actualRevenue).toBe(5_000_000);
  });

  it('target=0 → coi như chưa đặt', () => {
    const t = buildTargetSummary('branch', 0, 5_000_000, '2026-06');
    expect(t.status).toBe('not_set');
    expect(t.targetRevenue).toBeNull();
  });

  it('actual >= target → status=achieved + remaining=0', () => {
    const t = buildTargetSummary('branch', 10_000_000, 10_000_000, '2026-01');
    expect(t.status).toBe('achieved');
    expect(t.percentComplete).toBe(100);
    expect(t.remaining).toBe(0);
  });

  it('actual > target → remaining=0 (không âm)', () => {
    const t = buildTargetSummary('branch', 10_000_000, 15_000_000, '2026-01');
    expect(t.status).toBe('achieved');
    expect(t.percentComplete).toBe(150);
    expect(t.remaining).toBe(0);
  });

  it('tháng quá khứ → daysElapsedPercent=100', () => {
    // 2025-01 chắc chắn quá khứ
    const t = buildTargetSummary('branch', 10_000_000, 5_000_000, '2025-01');
    expect(t.daysElapsedPercent).toBe(100);
    expect(t.status).toBe('behind');  // 50% < 100% time → behind
  });

  it('tháng tương lai → daysElapsedPercent=0', () => {
    // 2030-12 chắc chắn tương lai
    const t = buildTargetSummary('branch', 10_000_000, 0, '2030-12');
    expect(t.daysElapsedPercent).toBe(0);
    expect(t.status).toBe('on_track');  // 0% >= 0% → on_track
  });

  it('scope giữ nguyên qua output', () => {
    expect(buildTargetSummary('sale', 1_000_000, 500_000, '2025-01').scope).toBe('sale');
    expect(buildTargetSummary('branch', 1_000_000, 500_000, '2025-01').scope).toBe('branch');
    expect(buildTargetSummary('system', 1_000_000, 500_000, '2025-01').scope).toBe('system');
    expect(buildTargetSummary('none', null, 0, '2025-01').scope).toBe('none');
  });

  it('regression PR-TK3A: full case Sale đạt 70% tháng quá khứ', () => {
    const t = buildTargetSummary('sale', 100_000_000, 70_000_000, '2025-06');
    expect(t.targetRevenue).toBe(100_000_000);
    expect(t.actualRevenue).toBe(70_000_000);
    expect(t.percentComplete).toBe(70);
    expect(t.remaining).toBe(30_000_000);
    expect(t.daysElapsedPercent).toBe(100);
    expect(t.progressGap).toBe(-30);
    expect(t.status).toBe('behind');
  });
});
