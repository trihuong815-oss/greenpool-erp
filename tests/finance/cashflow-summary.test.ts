// PR-CASH1G (2026-06-23) — Tests cho compute helpers.

import { describe, it, expect } from 'vitest';
import {
  computeMonthlySummary,
  computeYearlySummary,
  daysInMonth,
  daysCountedUpTo,
  type ReportDoc,
} from '@/lib/finance/cashflow-summary';

function makeReport(opts: {
  id: string;
  date: string;
  branchId: string;
  status: 'submitted' | 'sent' | 'checked' | 'locked' | 'returned' | 'draft';
  revenueTotal: number;
  expenseTotal: number;
  netTotal: number;
  alerts?: any[];
}): ReportDoc {
  return {
    id: opts.id,
    date: opts.date,
    month: opts.date.slice(0, 7),
    branchId: opts.branchId as any,
    branchName: `Branch ${opts.branchId}`,
    status: opts.status,
    revenueSource: {
      sourceType: 'daily_revenue_reconciliation_summary',
      sourceDate: opts.date,
      sourceBranchId: opts.branchId as any,
      totalByMethod: { cash: opts.revenueTotal, transfer: 0, card: 0, total: opts.revenueTotal },
      total: opts.revenueTotal,
      fetchedAt: new Date(0) as any,
    },
    expense: {
      totalByMethod: { cash: opts.expenseTotal, transfer: 0, card: 0, other: 0, total: opts.expenseTotal },
      expenseEntryIds: [],
      count: 0,
      returnedCount: 0,
      voidedCount: 0,
    },
    net: { cash: opts.netTotal, transfer: 0, card: 0, other: 0, total: opts.netTotal },
    sourceRefs: { revenueSummaryId: null, revenueDate: opts.date, revenueBranchId: opts.branchId as any, expenseEntryIds: [] },
    reportVersion: 1,
    previousReportId: null,
    revisions: [],
    submittedBy: 'u1', submittedByName: 'NV1', submittedAt: new Date(0) as any,
    sentTo: { treasurerUserIds: [], accountingManagerUserIds: [], supervisionUserIds: [], leadershipUserIds: [] },
    sentAt: null,
    checkedBy: null, checkedByName: null, checkedAt: null, checkNote: null,
    returnedBy: null, returnedByName: null, returnedAt: null, returnReason: null,
    lockedBy: null, lockedByName: null, lockedAt: null,
    generatedBy: 'u1', generatedAt: new Date(0) as any,
    alerts: opts.alerts ?? [],
    createdAt: new Date(0) as any,
    updatedAt: new Date(0) as any,
  } as any;
}

describe('daysInMonth', () => {
  it('2026-02 (non-leap) → 28', () => expect(daysInMonth('2026-02')).toBe(28));
  it('2024-02 (leap) → 29', () => expect(daysInMonth('2024-02')).toBe(29));
  it('2026-04 → 30', () => expect(daysInMonth('2026-04')).toBe(30));
  it('2026-01 → 31', () => expect(daysInMonth('2026-01')).toBe(31));
});

describe('daysCountedUpTo', () => {
  it('Tháng past → daysInMonth', () => {
    expect(daysCountedUpTo('2026-05', '2026-06-15')).toBe(31);
  });
  it('Tháng future → 0', () => {
    expect(daysCountedUpTo('2026-07', '2026-06-15')).toBe(0);
  });
  it('Tháng hiện tại → ngày hiện tại', () => {
    expect(daysCountedUpTo('2026-06', '2026-06-15')).toBe(15);
  });
});

describe('computeMonthlySummary — branch scope', () => {
  it('Sum revenue/expense/net 3 ngày 1 branch', () => {
    const reports = [
      makeReport({ id: 'r1', date: '2026-06-01', branchId: 'HM', status: 'checked', revenueTotal: 1000, expenseTotal: 300, netTotal: 700 }),
      makeReport({ id: 'r2', date: '2026-06-02', branchId: 'HM', status: 'submitted', revenueTotal: 2000, expenseTotal: 500, netTotal: 1500 }),
      makeReport({ id: 'r3', date: '2026-06-03', branchId: 'TK', status: 'checked', revenueTotal: 9999, expenseTotal: 9999, netTotal: 0 }), // KHÔNG count vì branch=TK
    ];
    const s = computeMonthlySummary({ month: '2026-06', scope: 'branch', branchId: 'HM' as any, reports, currentDate: '2026-06-30' });
    expect(s.totals.revenue.total).toBe(3000);
    expect(s.totals.expense.total).toBe(800);
    expect(s.totals.net.total).toBe(2200);
    expect(s.days.length).toBe(2);
    expect(s.statusCounts.checked).toBe(1);
    expect(s.statusCounts.submitted).toBe(1);
  });

  it('Missing days = daysCounted - reportsCount cho branch', () => {
    const reports = [
      makeReport({ id: 'r1', date: '2026-06-01', branchId: 'HM', status: 'checked', revenueTotal: 0, expenseTotal: 0, netTotal: 0 }),
      makeReport({ id: 'r2', date: '2026-06-02', branchId: 'HM', status: 'checked', revenueTotal: 0, expenseTotal: 0, netTotal: 0 }),
    ];
    const s = computeMonthlySummary({ month: '2026-06', scope: 'branch', branchId: 'HM' as any, reports, currentDate: '2026-06-10' });
    expect(s.daysCounted).toBe(10);
    expect(s.statusCounts.missing).toBe(8);   // 10 - 2 = 8
  });
});

describe('computeMonthlySummary — system scope', () => {
  it('Count across all branches', () => {
    const reports = [
      makeReport({ id: 'r1', date: '2026-06-01', branchId: 'HM', status: 'checked', revenueTotal: 1000, expenseTotal: 100, netTotal: 900 }),
      makeReport({ id: 'r2', date: '2026-06-01', branchId: 'TK', status: 'checked', revenueTotal: 2000, expenseTotal: 200, netTotal: 1800 }),
    ];
    const s = computeMonthlySummary({ month: '2026-06', scope: 'system', branchId: null, reports, currentDate: '2026-06-30' });
    expect(s.totals.revenue.total).toBe(3000);
    expect(s.totals.expense.total).toBe(300);
    expect(s.days.length).toBe(2);
  });

  it('Missing = daysCounted × 5 branches - reportsCount', () => {
    const reports = [
      makeReport({ id: 'r1', date: '2026-06-01', branchId: 'HM', status: 'checked', revenueTotal: 0, expenseTotal: 0, netTotal: 0 }),
    ];
    const s = computeMonthlySummary({ month: '2026-06', scope: 'system', branchId: null, reports, currentDate: '2026-06-01' });
    expect(s.daysCounted).toBe(1);
    expect(s.statusCounts.missing).toBe(4);   // 1*5 - 1 = 4
  });
});

describe('computeYearlySummary', () => {
  it('12 month rows + correct month-bucketing', () => {
    const reports = [
      makeReport({ id: 'a', date: '2026-03-15', branchId: 'HM', status: 'checked', revenueTotal: 1000, expenseTotal: 100, netTotal: 900 }),
      makeReport({ id: 'b', date: '2026-06-15', branchId: 'HM', status: 'checked', revenueTotal: 2000, expenseTotal: 200, netTotal: 1800 }),
      makeReport({ id: 'c', date: '2026-11-15', branchId: 'TK', status: 'locked', revenueTotal: 3000, expenseTotal: 300, netTotal: 2700 }),
    ];
    const s = computeYearlySummary({ year: 2026, scope: 'system', branchId: null, reports, currentDate: '2026-12-31' });
    expect(s.monthlyRows.length).toBe(12);
    expect(s.monthlyRows[2].totalRevenue).toBe(1000); // March (index 2)
    expect(s.monthlyRows[5].totalRevenue).toBe(2000); // June
    expect(s.monthlyRows[10].totalRevenue).toBe(3000); // November
    expect(s.totals.revenue.total).toBe(6000);
    expect(s.totals.expense.total).toBe(600);
    expect(s.totals.net.total).toBe(5400);
    expect(s.statusCounts.locked).toBe(1);
    expect(s.statusCounts.checked).toBe(2);
  });

  it('Branch scope filter excludes other branches', () => {
    const reports = [
      makeReport({ id: 'a', date: '2026-06-01', branchId: 'HM', status: 'checked', revenueTotal: 1000, expenseTotal: 0, netTotal: 1000 }),
      makeReport({ id: 'b', date: '2026-06-02', branchId: 'TK', status: 'checked', revenueTotal: 5000, expenseTotal: 0, netTotal: 5000 }),
    ];
    const s = computeYearlySummary({ year: 2026, scope: 'branch', branchId: 'HM' as any, reports, currentDate: '2026-12-31' });
    expect(s.totals.revenue.total).toBe(1000);  // chỉ HM
  });

  it('branchRows chỉ có khi scope=system', () => {
    const reports = [
      makeReport({ id: 'a', date: '2026-06-01', branchId: 'HM', status: 'checked', revenueTotal: 1000, expenseTotal: 0, netTotal: 1000 }),
      makeReport({ id: 'b', date: '2026-06-01', branchId: 'TK', status: 'checked', revenueTotal: 2000, expenseTotal: 0, netTotal: 2000 }),
    ];
    const system = computeYearlySummary({ year: 2026, scope: 'system', branchId: null, reports, currentDate: '2026-12-31' });
    expect(system.branchRows?.length).toBe(2);

    const branch = computeYearlySummary({ year: 2026, scope: 'branch', branchId: 'HM' as any, reports, currentDate: '2026-12-31' });
    expect(branch.branchRows).toBeUndefined();
  });

  it('Alerts day counted', () => {
    const reports = [
      makeReport({ id: 'a', date: '2026-06-01', branchId: 'HM', status: 'checked', revenueTotal: 0, expenseTotal: 0, netTotal: 0, alerts: [{ code: 'X' }] }),
      makeReport({ id: 'b', date: '2026-06-02', branchId: 'HM', status: 'checked', revenueTotal: 0, expenseTotal: 0, netTotal: 0, alerts: [] }),
    ];
    const s = computeMonthlySummary({ month: '2026-06', scope: 'branch', branchId: 'HM' as any, reports, currentDate: '2026-06-30' });
    expect(s.alertDays).toBe(1);
  });
});
