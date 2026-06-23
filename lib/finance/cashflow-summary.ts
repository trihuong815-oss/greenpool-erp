// PR-CASH1G (2026-06-23) — Compute helpers tổng hợp tháng/năm Thu-Chi.
// PURE — không animation Firestore, không network. Dùng cho API + tests.

import type { BranchId } from '@/lib/branches';
import { BRANCH_BY_ID, BRANCHES } from '@/lib/branches';
import type { DailyCashflowReportDoc, DailyCashflowReportStatus } from './cashflow-report-types';
import type {
  MonthlySummary,
  YearlySummary,
  MonthRow,
  BranchRow,
  DaySummaryRow,
  CashflowStatusCounts,
} from './cashflow-summary-types';

export type ReportDoc = DailyCashflowReportDoc & { id: string };

function emptyMethodTotals() {
  return { cash: 0, transfer: 0, card: 0, total: 0 };
}
function emptyExpenseTotals() {
  return { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };
}
function emptyNetTotals() {
  return { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };
}

function emptyStatusCounts(): CashflowStatusCounts {
  return { submitted: 0, checked: 0, locked: 0, returned: 0, missing: 0 };
}

function classifyStatus(s: DailyCashflowReportStatus): keyof CashflowStatusCounts | null {
  if (s === 'submitted' || s === 'sent') return 'submitted';
  if (s === 'checked') return 'checked';
  if (s === 'locked') return 'locked';
  if (s === 'returned') return 'returned';
  return null;   // draft → không đếm
}

/** Số ngày trong tháng (1-12). YYYY-MM. */
export function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return 0;
  return new Date(y, m, 0).getDate();
}

/** VN-today (YYYY-MM-DD). */
function todayVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Số ngày "đã đi qua" trong tháng — dùng để estimate missing.
 *  - Tháng past: = daysInMonth.
 *  - Tháng hiện tại: = current day-of-month (1..today).
 *  - Tháng future: = 0. */
export function daysCountedUpTo(yearMonth: string, currentDate = todayVN()): number {
  const monthIso = yearMonth;
  const todayMonth = currentDate.slice(0, 7);
  if (todayMonth > monthIso) return daysInMonth(monthIso);                    // tháng past
  if (todayMonth < monthIso) return 0;                                         // tháng future
  return Number(currentDate.slice(8, 10));                                     // tháng hiện tại
}

// ─── Monthly summary ─────────────────────────────────────────────────────

export interface ComputeMonthlyInput {
  month: string;                       // YYYY-MM
  scope: 'system' | 'branch';
  branchId: BranchId | null;
  reports: ReportDoc[];                // đã filter scope theo permission
  currentDate?: string;                // YYYY-MM-DD (mock cho test)
}

export function computeMonthlySummary(input: ComputeMonthlyInput): MonthlySummary {
  const { month, scope, branchId, reports } = input;
  const totals = {
    revenue: emptyMethodTotals(),
    expense: emptyExpenseTotals(),
    net: emptyNetTotals(),
  };
  const statusCounts = emptyStatusCounts();
  const days: DaySummaryRow[] = [];
  let alertDays = 0;

  for (const r of reports) {
    if (r.date.slice(0, 7) !== month) continue;
    if (scope === 'branch' && r.branchId !== branchId) continue;

    const rev = r.revenueSource?.totalByMethod ?? { cash: 0, transfer: 0, card: 0, total: 0 };
    const exp = r.expense?.totalByMethod ?? { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };
    const net = r.net ?? { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };

    totals.revenue.cash += rev.cash; totals.revenue.transfer += rev.transfer;
    totals.revenue.card += rev.card; totals.revenue.total += rev.total;
    totals.expense.cash += exp.cash; totals.expense.transfer += exp.transfer;
    totals.expense.card += exp.card; totals.expense.other += exp.other;
    totals.expense.total += exp.total;
    totals.net.cash += net.cash; totals.net.transfer += net.transfer;
    totals.net.card += net.card; totals.net.other += net.other;
    totals.net.total += net.total;

    const bucket = classifyStatus(r.status);
    if (bucket) statusCounts[bucket]++;

    const alertCount = Array.isArray(r.alerts) ? r.alerts.length : 0;
    if (alertCount > 0) alertDays++;

    days.push({
      date: r.date,
      branchId: r.branchId,
      branchName: r.branchName ?? BRANCH_BY_ID[r.branchId]?.name ?? r.branchId,
      revenueTotal: rev.total,
      expenseTotal: exp.total,
      netTotal: net.total,
      status: r.status,
      locked: r.status === 'locked',
      alertCount,
      reportId: r.id,
    });
  }

  // Missing days: estimated.
  const inMonth = daysInMonth(month);
  const counted = daysCountedUpTo(month, input.currentDate);
  // Cho scope=branch: 1 báo cáo / ngày → expected = counted; missing = counted - reportsCount.
  // Cho scope=system: expected = counted × #branches.
  const expectedReports = scope === 'branch'
    ? counted
    : counted * BRANCHES.length;
  const actualReports = days.length;
  statusCounts.missing = Math.max(0, expectedReports - actualReports);

  // Sort days theo date DESC rồi branchId ASC
  days.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.branchId.localeCompare(b.branchId);
  });

  return {
    month, scope, branchId,
    daysInMonth: inMonth,
    daysCounted: counted,
    totals,
    statusCounts,
    alertDays,
    days,
  };
}

// ─── Yearly summary ──────────────────────────────────────────────────────

export interface ComputeYearlyInput {
  year: number;
  scope: 'system' | 'branch';
  branchId: BranchId | null;
  reports: ReportDoc[];
  currentDate?: string;
}

export function computeYearlySummary(input: ComputeYearlyInput): YearlySummary {
  const { year, scope, branchId, reports } = input;
  const yearStr = String(year);

  const totals = {
    revenue: emptyMethodTotals(),
    expense: emptyExpenseTotals(),
    net: emptyNetTotals(),
  };
  const statusCounts = emptyStatusCounts();
  let alertDays = 0;

  // Group theo month + branch
  const byMonth: Record<string, MonthRow> = {};
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    byMonth[`${yearStr}-${mm}`] = {
      month: `${yearStr}-${mm}`,
      totalRevenue: 0, totalExpense: 0, net: 0,
      submittedDays: 0, checkedDays: 0, lockedDays: 0, returnedDays: 0,
      missingDays: 0, alertDays: 0,
    };
  }

  const byBranch: Record<string, BranchRow> = {};

  let totalActualReports = 0;
  for (const r of reports) {
    if (r.date.slice(0, 4) !== yearStr) continue;
    if (scope === 'branch' && r.branchId !== branchId) continue;
    totalActualReports++;

    const rev = r.revenueSource?.totalByMethod ?? { cash: 0, transfer: 0, card: 0, total: 0 };
    const exp = r.expense?.totalByMethod ?? { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };
    const net = r.net ?? { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };

    totals.revenue.cash += rev.cash; totals.revenue.transfer += rev.transfer;
    totals.revenue.card += rev.card; totals.revenue.total += rev.total;
    totals.expense.cash += exp.cash; totals.expense.transfer += exp.transfer;
    totals.expense.card += exp.card; totals.expense.other += exp.other;
    totals.expense.total += exp.total;
    totals.net.cash += net.cash; totals.net.transfer += net.transfer;
    totals.net.card += net.card; totals.net.other += net.other;
    totals.net.total += net.total;

    const bucket = classifyStatus(r.status);
    if (bucket) statusCounts[bucket]++;

    const alertCount = Array.isArray(r.alerts) ? r.alerts.length : 0;
    if (alertCount > 0) alertDays++;

    const monthRow = byMonth[r.date.slice(0, 7)];
    if (monthRow) {
      monthRow.totalRevenue += rev.total;
      monthRow.totalExpense += exp.total;
      monthRow.net += net.total;
      if (bucket === 'submitted') monthRow.submittedDays++;
      else if (bucket === 'checked') monthRow.checkedDays++;
      else if (bucket === 'locked') monthRow.lockedDays++;
      else if (bucket === 'returned') monthRow.returnedDays++;
      if (alertCount > 0) monthRow.alertDays++;
    }

    if (scope === 'system') {
      const bId = r.branchId;
      const branchName = r.branchName ?? BRANCH_BY_ID[bId]?.name ?? bId;
      if (!byBranch[bId]) {
        byBranch[bId] = {
          branchId: bId, branchName,
          totalRevenue: 0, totalExpense: 0, net: 0,
          submittedDays: 0, lockedDays: 0, returnedDays: 0,
        };
      }
      const br = byBranch[bId];
      br.totalRevenue += rev.total;
      br.totalExpense += exp.total;
      br.net += net.total;
      if (bucket === 'submitted' || bucket === 'checked') br.submittedDays++;
      if (bucket === 'locked') br.lockedDays++;
      if (bucket === 'returned') br.returnedDays++;
    }
  }

  // Estimate missing days per month
  for (const mm of Object.keys(byMonth)) {
    const counted = daysCountedUpTo(mm, input.currentDate);
    const expectedReports = scope === 'branch' ? counted : counted * BRANCHES.length;
    const actualForMonth =
      byMonth[mm].submittedDays + byMonth[mm].checkedDays
      + byMonth[mm].lockedDays + byMonth[mm].returnedDays;
    byMonth[mm].missingDays = Math.max(0, expectedReports - actualForMonth);
  }

  // Total missing for year
  let totalCounted = 0;
  for (let m = 1; m <= 12; m++) {
    const mm = `${yearStr}-${String(m).padStart(2, '0')}`;
    totalCounted += daysCountedUpTo(mm, input.currentDate);
  }
  const expectedYearReports = scope === 'branch' ? totalCounted : totalCounted * BRANCHES.length;
  statusCounts.missing = Math.max(0, expectedYearReports - totalActualReports);

  const monthlyRows: MonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = `${yearStr}-${String(m).padStart(2, '0')}`;
    monthlyRows.push(byMonth[mm]);
  }

  const branchRows = scope === 'system'
    ? Object.values(byBranch).sort((a, b) => a.branchId.localeCompare(b.branchId))
    : undefined;

  return {
    year, scope, branchId,
    totals, statusCounts, alertDays,
    monthlyRows,
    branchRows,
  };
}
