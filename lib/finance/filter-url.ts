// PR-CASH-FILTERS (2026-06-24) — URL query state helpers cho 2 module finance.
//
// Reload/F5 giữ filter · copy URL gửi người khác giữ filter · Back/Forward trình duyệt OK.
// Invalid query → sanitize an toàn về default, KHÔNG crash, KHÔNG lộ data ngoài quyền
// (branchId scope vẫn enforce server-side).

import type { ExpenseFilters } from './filter-expenses';
import { sanitizeExpenseFilters } from './filter-expenses';
import type { CashflowReportFilters } from './filter-cashflow-reports';
import { sanitizeCashflowReportFilters } from './filter-cashflow-reports';

/** Đọc query param đơn (string|null) — wrap để test dễ. */
type Reader = (key: string) => string | null;

export function readExpenseFiltersFromQuery(read: Reader): ExpenseFilters {
  return sanitizeExpenseFilters({
    voucherNo: read('voucherNo') ?? '',
    keyword: read('keyword') ?? '',
    counterpartyName: read('counterpartyName') ?? '',
    paymentMethod: read('paymentMethod') ?? '',
    expenseCategory: read('expenseCategory') ?? '',
    expenseBasisType: read('expenseBasisType') ?? '',
    status: read('status') ?? '',
    amountMin: read('amountMin'),
    amountMax: read('amountMax'),
  });
}

/** Serialize ExpenseFilters → URLSearchParams updates (set if active, delete if default). */
export function writeExpenseFiltersToParams(filters: ExpenseFilters, params: URLSearchParams): void {
  const setOrDel = (key: string, val: string) => {
    if (val) params.set(key, val); else params.delete(key);
  };
  setOrDel('voucherNo', filters.voucherNo.trim());
  setOrDel('keyword', filters.keyword.trim());
  setOrDel('counterpartyName', filters.counterpartyName.trim());
  setOrDel('paymentMethod', filters.paymentMethod);
  setOrDel('expenseCategory', filters.expenseCategory);
  setOrDel('expenseBasisType', filters.expenseBasisType);
  setOrDel('status', filters.status);
  setOrDel('amountMin', filters.amountMin !== null ? String(filters.amountMin) : '');
  setOrDel('amountMax', filters.amountMax !== null ? String(filters.amountMax) : '');
}

export function readCashflowReportFiltersFromQuery(read: Reader): CashflowReportFilters {
  return sanitizeCashflowReportFilters({
    status: read('status') ?? '',
    alerts: read('alerts') ?? '',
    locked: read('locked') ?? '',
    unlocked: read('unlocked') ?? '',
    net: read('net') ?? '',
    revenueMin: read('revenueMin'),
    revenueMax: read('revenueMax'),
    expenseMin: read('expenseMin'),
    expenseMax: read('expenseMax'),
  });
}

export function writeCashflowReportFiltersToParams(
  filters: CashflowReportFilters,
  params: URLSearchParams,
): void {
  const setOrDel = (key: string, val: string) => {
    if (val) params.set(key, val); else params.delete(key);
  };
  setOrDel('status', filters.status);
  setOrDel('alerts', filters.alerts);
  setOrDel('locked', filters.locked);
  setOrDel('unlocked', filters.unlocked);
  setOrDel('net', filters.net);
  setOrDel('revenueMin', filters.revenueMin !== null ? String(filters.revenueMin) : '');
  setOrDel('revenueMax', filters.revenueMax !== null ? String(filters.revenueMax) : '');
  setOrDel('expenseMin', filters.expenseMin !== null ? String(filters.expenseMin) : '');
  setOrDel('expenseMax', filters.expenseMax !== null ? String(filters.expenseMax) : '');
}
