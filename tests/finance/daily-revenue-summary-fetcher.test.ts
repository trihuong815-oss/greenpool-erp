// PR-CASH1B (2026-06-23) — Smoke test fetcher returns valid shape on invalid input.
// Full integration test cần Firestore emulator (defer).

import { describe, it, expect } from 'vitest';
import { fetchDailyRevenueSummary } from '@/lib/finance/daily-revenue-summary-fetcher';

describe('fetchDailyRevenueSummary — input validation', () => {
  it('invalid branchId → error', async () => {
    const result = await fetchDailyRevenueSummary('2026-06-23', 'INVALID' as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/branchId/);
  });

  it('invalid date format → error', async () => {
    const result = await fetchDailyRevenueSummary('06/23/2026', 'HM' as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/date/);
  });

  it('empty date → error', async () => {
    const result = await fetchDailyRevenueSummary('', 'HM' as any);
    expect(result.ok).toBe(false);
  });
});
