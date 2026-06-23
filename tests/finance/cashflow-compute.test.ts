// PR-CASH1B (2026-06-23) — Test compute aggregate/net/alerts.

import { describe, it, expect } from 'vitest';
import {
  aggregateExpenses,
  computeNet,
  computeAlerts,
  hasRevenueChanged,
} from '@/lib/finance/cashflow-compute';
import type { BranchDailyExpenseDoc } from '@/lib/finance/expense-types';
import type { RevenueSource } from '@/lib/finance/cashflow-report-types';

type ExpenseSlim = Pick<BranchDailyExpenseDoc, 'amount' | 'paymentMethod' | 'status'>;

function expense(amount: number, paymentMethod: any, status: any): ExpenseSlim {
  return { amount, paymentMethod, status };
}

function revenueSource(cash: number, transfer: number, card: number): RevenueSource {
  return {
    sourceType: 'daily_revenue_reconciliation_summary',
    sourceDate: '2026-06-23',
    sourceBranchId: 'HM' as any,
    totalByMethod: { cash, transfer, card, total: cash + transfer + card },
    total: cash + transfer + card,
    fetchedAt: {} as any,
  };
}

// ─── aggregateExpenses ─────────────────────────────────────────────────

describe('aggregateExpenses', () => {
  it('chỉ recorded vào totals; draft/returned/voided skip', () => {
    const list: ExpenseSlim[] = [
      expense(100000, 'cash', 'recorded'),
      expense(200000, 'cash', 'draft'),         // skip
      expense(300000, 'transfer', 'recorded'),
      expense(400000, 'cash', 'returned'),      // skip — count returnedCount
      expense(500000, 'card', 'voided'),         // skip — count voidedCount
      expense(150000, 'other', 'recorded'),
    ];
    const result = aggregateExpenses(list, ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);

    expect(result.totalByMethod.cash).toBe(100000);
    expect(result.totalByMethod.transfer).toBe(300000);
    expect(result.totalByMethod.card).toBe(0);
    expect(result.totalByMethod.other).toBe(150000);
    expect(result.totalByMethod.total).toBe(550000);
    expect(result.count).toBe(3);
    expect(result.returnedCount).toBe(1);
    expect(result.voidedCount).toBe(1);
    expect(result.expenseEntryIds).toEqual(['e1', 'e3', 'e6']);
  });

  it('empty list → empty aggregate', () => {
    const result = aggregateExpenses([], []);
    expect(result.totalByMethod.total).toBe(0);
    expect(result.count).toBe(0);
    expect(result.expenseEntryIds).toEqual([]);
  });

  it('invalid amount (negative/NaN) skip', () => {
    const list: ExpenseSlim[] = [
      expense(-100, 'cash', 'recorded'),       // negative skip
      expense(NaN, 'cash', 'recorded'),         // NaN skip
      expense(100000, 'cash', 'recorded'),     // valid
    ];
    const result = aggregateExpenses(list, ['e1', 'e2', 'e3']);
    expect(result.totalByMethod.cash).toBe(100000);
    expect(result.count).toBe(1);
    expect(result.expenseEntryIds).toEqual(['e3']);
  });
});

// ─── computeNet ────────────────────────────────────────────────────────

describe('computeNet', () => {
  it('net = revenue - expense per method', () => {
    const revenue = revenueSource(1000000, 500000, 200000);
    const expense = aggregateExpenses(
      [
        { amount: 300000, paymentMethod: 'cash', status: 'recorded' },
        { amount: 100000, paymentMethod: 'transfer', status: 'recorded' },
        { amount: 50000, paymentMethod: 'card', status: 'recorded' },
        { amount: 80000, paymentMethod: 'other', status: 'recorded' },
      ],
      ['1', '2', '3', '4'],
    );
    const net = computeNet(revenue, expense);
    expect(net.cash).toBe(700000);
    expect(net.transfer).toBe(400000);
    expect(net.card).toBe(150000);
    expect(net.other).toBe(-80000);             // revenue=0, net luôn âm
    expect(net.total).toBe(1700000 - 530000);  // = 1170000
  });

  it('expense > revenue → net negative', () => {
    const revenue = revenueSource(100000, 0, 0);
    const expense = aggregateExpenses(
      [{ amount: 500000, paymentMethod: 'cash', status: 'recorded' }],
      ['1'],
    );
    const net = computeNet(revenue, expense);
    expect(net.cash).toBe(-400000);
    expect(net.total).toBe(-400000);
  });
});

// ─── computeAlerts ─────────────────────────────────────────────────────

describe('computeAlerts', () => {
  it('revenue=0 → DAILY_REVENUE_ZERO', () => {
    const revenue = revenueSource(0, 0, 0);
    const expense = aggregateExpenses([], []);
    const net = computeNet(revenue, expense);
    const alerts = computeAlerts(revenue, expense, net);
    const codes = alerts.map((a) => a.code);
    expect(codes).toContain('DAILY_REVENUE_ZERO');
  });

  it('expense.other > 0 → EXPENSE_HAS_OTHER_PAYMENT_METHOD', () => {
    const revenue = revenueSource(1000000, 0, 0);
    const expense = aggregateExpenses(
      [{ amount: 50000, paymentMethod: 'other', status: 'recorded' }],
      ['1'],
    );
    const net = computeNet(revenue, expense);
    const alerts = computeAlerts(revenue, expense, net);
    expect(alerts.map((a) => a.code)).toContain('EXPENSE_HAS_OTHER_PAYMENT_METHOD');
  });

  it('returnedCount > 0 → EXPENSE_RETURNED_EXISTS', () => {
    const revenue = revenueSource(1000000, 0, 0);
    const expense = aggregateExpenses(
      [{ amount: 100000, paymentMethod: 'cash', status: 'returned' }],
      ['1'],
    );
    const net = computeNet(revenue, expense);
    const alerts = computeAlerts(revenue, expense, net);
    expect(alerts.map((a) => a.code)).toContain('EXPENSE_RETURNED_EXISTS');
  });

  it('net.cash < 0 → NET_NEGATIVE_CASH', () => {
    const revenue = revenueSource(100000, 0, 0);
    const expense = aggregateExpenses(
      [{ amount: 500000, paymentMethod: 'cash', status: 'recorded' }],
      ['1'],
    );
    const net = computeNet(revenue, expense);
    const alerts = computeAlerts(revenue, expense, net);
    expect(alerts.map((a) => a.code)).toContain('NET_NEGATIVE_CASH');
  });

  it('revenue incomplete signals → DAILY_REVENUE_MAY_BE_INCOMPLETE', () => {
    const revenue = revenueSource(1000000, 0, 0);
    const expense = aggregateExpenses([], []);
    const net = computeNet(revenue, expense);
    const alerts = computeAlerts(revenue, expense, net, {
      revenueIncomplete: { receptionDraft: true, salesBatchPending: true },
    });
    expect(alerts.map((a) => a.code)).toContain('DAILY_REVENUE_MAY_BE_INCOMPLETE');
  });

  it('voucherDuplicate → EXPENSE_VOUCHER_DUPLICATE', () => {
    const revenue = revenueSource(1000000, 0, 0);
    const expense = aggregateExpenses([], []);
    const net = computeNet(revenue, expense);
    const alerts = computeAlerts(revenue, expense, net, { voucherDuplicateExists: true });
    expect(alerts.map((a) => a.code)).toContain('EXPENSE_VOUCHER_DUPLICATE');
  });

  it('happy path no alerts', () => {
    const revenue = revenueSource(1000000, 500000, 200000);
    const expense = aggregateExpenses(
      [{ amount: 300000, paymentMethod: 'cash', status: 'recorded' }],
      ['1'],
    );
    const net = computeNet(revenue, expense);
    const alerts = computeAlerts(revenue, expense, net);
    expect(alerts).toEqual([]);
  });
});

// ─── hasRevenueChanged ─────────────────────────────────────────────────

describe('hasRevenueChanged', () => {
  it('identical → false', () => {
    expect(hasRevenueChanged(revenueSource(100, 200, 300), revenueSource(100, 200, 300))).toBe(false);
  });

  it('cash diff → true', () => {
    expect(hasRevenueChanged(revenueSource(100, 0, 0), revenueSource(150, 0, 0))).toBe(true);
  });

  it('total diff → true', () => {
    const a = revenueSource(100, 100, 100);
    const b = { ...revenueSource(100, 100, 100), totalByMethod: { cash: 100, transfer: 100, card: 100, total: 999 } };
    expect(hasRevenueChanged(a, b)).toBe(true);
  });
});
