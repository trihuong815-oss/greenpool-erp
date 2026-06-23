// PR-CASH1G (2026-06-23) — Types tổng hợp tháng/năm Thu-Chi.

import type { BranchId } from '@/lib/branches';
import type { DailyCashflowReportStatus } from './cashflow-report-types';

export interface MoneyByMethod {
  cash: number;
  transfer: number;
  card: number;
  other: number;     // chỉ EXPENSE có other; revenue.other = 0
  total: number;
}

export interface CashflowStatusCounts {
  /** submitted + sent — chưa kiểm tra */
  submitted: number;
  checked: number;
  locked: number;
  returned: number;
  /** ngày chưa có report nào (estimated) */
  missing: number;
}

export interface DaySummaryRow {
  date: string;            // YYYY-MM-DD
  branchId: BranchId;
  branchName: string;
  revenueTotal: number;
  expenseTotal: number;
  netTotal: number;
  status: DailyCashflowReportStatus;
  locked: boolean;
  alertCount: number;
  reportId: string;
}

export interface MonthlySummary {
  month: string;                   // YYYY-MM
  scope: 'system' | 'branch';
  branchId: BranchId | null;       // null khi system
  daysInMonth: number;             // 28/29/30/31
  daysCounted: number;             // số ngày tính missing đến (today nếu month hiện tại, daysInMonth nếu past)
  totals: {
    revenue: Omit<MoneyByMethod, 'other'>;   // revenue không có 'other'
    expense: MoneyByMethod;
    net: MoneyByMethod;
  };
  statusCounts: CashflowStatusCounts;
  alertDays: number;
  days: DaySummaryRow[];
}

export interface MonthRow {
  month: string;                   // YYYY-MM
  totalRevenue: number;
  totalExpense: number;
  net: number;
  submittedDays: number;
  checkedDays: number;
  lockedDays: number;
  returnedDays: number;
  missingDays: number;
  alertDays: number;
}

export interface BranchRow {
  branchId: BranchId;
  branchName: string;
  totalRevenue: number;
  totalExpense: number;
  net: number;
  submittedDays: number;
  lockedDays: number;
  returnedDays: number;
}

export interface YearlySummary {
  year: number;                    // YYYY
  scope: 'system' | 'branch';
  branchId: BranchId | null;
  totals: {
    revenue: Omit<MoneyByMethod, 'other'>;
    expense: MoneyByMethod;
    net: MoneyByMethod;
  };
  statusCounts: CashflowStatusCounts;
  alertDays: number;
  monthlyRows: MonthRow[];         // length=12, theo thứ tự tháng 1-12
  branchRows?: BranchRow[];        // chỉ scope=system
}
