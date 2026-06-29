// PR-SUMMARY-04B (2026-06-29) — Tests cho active-month / unlocked-month raw guard.
//
// Helper is PURE — no Firestore. Tests inject currentMonth + isMonthLocked to
// cover every branch deterministically.

import { describe, it, expect } from 'vitest';
import {
  getMonthlySummaryReadStrategy,
  type SummaryReadStrategyInput,
} from '@/lib/sales-v2/monthly-summary-read-strategy';

// ─── Fixture builder ────────────────────────────────────────────────

function buildInput(overrides: Partial<SummaryReadStrategyInput> = {}): SummaryReadStrategyInput {
  return {
    requestedMonth: '2026-05',   // historical by default
    currentMonth:   '2026-06',
    scopeRole: 'qlcs',
    scopeBranchId: 'HM',
    isMonthLocked: true,         // locked by default
    ...overrides,
  };
}

// ─── Reject paths (PR-04 baseline) ──────────────────────────────────

describe('rejects sale scope unconditionally', () => {
  it('sale + any month + locked + valid branch → raw', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'sale',
      requestedMonth: '2025-01',
      isMonthLocked: true,
    }));
    expect(r).toEqual({ useSummary: false, reason: 'sale-scope' });
  });

  it('sale + null branchId → still sale-scope (checked first)', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'sale',
      scopeBranchId: null,
    }));
    expect(r.useSummary).toBe(false);
    expect(r.reason).toBe('sale-scope');
  });
});

describe('rejects top scope without branchId', () => {
  it('top + null branchId → top-all-branches', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'top',
      scopeBranchId: null,
    }));
    expect(r).toEqual({ useSummary: false, reason: 'top-all-branches' });
  });

  it('top + empty string branchId → top-all-branches', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'top',
      scopeBranchId: '',
    }));
    expect(r.useSummary).toBe(false);
    expect(r.reason).toBe('top-all-branches');
  });
});

describe('rejects invalid branch', () => {
  it('qlcs + invalid branchId → invalid-branch', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeBranchId: 'XX_NOT_A_BRANCH',
    }));
    expect(r).toEqual({ useSummary: false, reason: 'invalid-branch' });
  });

  it('accountant + lowercase (case-sensitive) → invalid-branch', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'accountant',
      scopeBranchId: 'hm',
    }));
    expect(r.useSummary).toBe(false);
    expect(r.reason).toBe('invalid-branch');
  });

  it('top + invalid branchId → invalid-branch (not top-all-branches)', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'top',
      scopeBranchId: 'BAD',
    }));
    expect(r.reason).toBe('invalid-branch');
  });
});

// ─── ACTIVE-MONTH GUARD (the core of PR-04B) ────────────────────────

describe('rejects active month even when everything else passes', () => {
  it('qlcs + valid branch + month === currentMonth + locked → still RAW (active-month)', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      requestedMonth: '2026-06',
      currentMonth:   '2026-06',
      isMonthLocked:  true,     // even if locked!
    }));
    expect(r).toEqual({ useSummary: false, reason: 'active-month' });
  });

  it('top + branchId + current month → active-month wins over eligible', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'top',
      scopeBranchId: '24',
      requestedMonth: '2026-06',
      currentMonth: '2026-06',
      isMonthLocked: true,
    }));
    expect(r.reason).toBe('active-month');
    expect(r.useSummary).toBe(false);
  });

  it('accountant + current month + unlocked → active-month (precedence over unlocked-month)', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'accountant',
      requestedMonth: '2026-06',
      currentMonth:   '2026-06',
      isMonthLocked: false,
    }));
    // active-month check comes BEFORE unlocked-month check
    expect(r.reason).toBe('active-month');
  });
});

// ─── UNLOCKED-MONTH GUARD ───────────────────────────────────────────

describe('rejects historical month if not locked', () => {
  it('qlcs + valid branch + past month + UNLOCKED → raw (unlocked-month)', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      requestedMonth: '2026-04',
      currentMonth:   '2026-06',
      isMonthLocked:  false,
    }));
    expect(r).toEqual({ useSummary: false, reason: 'unlocked-month' });
  });

  it('top + branchId + past month + UNLOCKED → unlocked-month', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'top',
      scopeBranchId: 'TT',
      requestedMonth: '2026-03',
      currentMonth: '2026-06',
      isMonthLocked: false,
    }));
    expect(r.reason).toBe('unlocked-month');
  });
});

// ─── ELIGIBLE PATH (only branch where useSummary=true) ──────────────

describe('approves locked historical branch scope (the ONLY useSummary=true path)', () => {
  it('qlcs + valid branch + past month + LOCKED → eligible', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      requestedMonth: '2026-05',
      currentMonth:   '2026-06',
      isMonthLocked:  true,
    }));
    expect(r).toEqual({ useSummary: true, reason: 'eligible' });
  });

  it('accountant + valid branch + past month + LOCKED → eligible', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'accountant',
      scopeBranchId: 'CTT',
      requestedMonth: '2026-04',
      currentMonth: '2026-06',
      isMonthLocked: true,
    }));
    expect(r).toEqual({ useSummary: true, reason: 'eligible' });
  });

  it('top + branchId + past month + LOCKED → eligible (top with branch filter is summary-capable)', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'top',
      scopeBranchId: '24',
      requestedMonth: '2026-01',
      currentMonth: '2026-06',
      isMonthLocked: true,
    }));
    expect(r).toEqual({ useSummary: true, reason: 'eligible' });
  });

  it('eligible across all 5 canonical branches', () => {
    for (const bid of ['HM', 'TK', 'CTT', '24', 'TT']) {
      const r = getMonthlySummaryReadStrategy(buildInput({ scopeBranchId: bid }));
      expect(r.useSummary).toBe(true);
      expect(r.reason).toBe('eligible');
    }
  });
});

// ─── PRECEDENCE / ORDER GUARANTEES ─────────────────────────────────

describe('rule precedence — order matters', () => {
  it('sale + current month → sale-scope (not active-month) — sale evaluated first', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'sale',
      requestedMonth: '2026-06',
      currentMonth: '2026-06',
    }));
    expect(r.reason).toBe('sale-scope');
  });

  it('top + null branchId + current month → top-all-branches (not active-month)', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeRole: 'top',
      scopeBranchId: null,
      requestedMonth: '2026-06',
      currentMonth: '2026-06',
    }));
    expect(r.reason).toBe('top-all-branches');
  });

  it('invalid branchId + current month → invalid-branch (not active-month)', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      scopeBranchId: 'INVALID',
      requestedMonth: '2026-06',
      currentMonth: '2026-06',
    }));
    expect(r.reason).toBe('invalid-branch');
  });

  it('active-month evaluated BEFORE unlocked-month (current month always wins)', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      requestedMonth: '2026-06',
      currentMonth: '2026-06',
      isMonthLocked: false, // unlocked too — but active-month is the reason
    }));
    expect(r.reason).toBe('active-month');
  });
});

// ─── REGRESSION smoke: previous month + locked is the smoke target ─

describe('smoke: real production scenario', () => {
  it('Smoke matching PR-SUMMARY-05 success case (HM 2026-06 active) → raw via active-month', () => {
    // Same data as user's manual smoke: HM, current month 2026-06.
    const r = getMonthlySummaryReadStrategy(buildInput({
      requestedMonth: '2026-06',
      currentMonth: '2026-06',
      scopeBranchId: 'HM',
      isMonthLocked: false, // typical state for active month
    }));
    expect(r.useSummary).toBe(false);
    expect(r.reason).toBe('active-month');
  });

  it('Last month (2026-05) locked by TP_KE → summary-eligible', () => {
    const r = getMonthlySummaryReadStrategy(buildInput({
      requestedMonth: '2026-05',
      currentMonth: '2026-06',
      scopeBranchId: '24',
      isMonthLocked: true,
    }));
    expect(r.useSummary).toBe(true);
  });
});
