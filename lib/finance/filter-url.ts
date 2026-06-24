// PR-CASH-FILTERS (2026-06-24) — URL query state helpers cho 2 module finance.
// PR-CASH-DATE-RANGE-UX (2026-06-24): extend cho dateFrom/dateTo + month/year range
// + legacy date= shim → dateFrom=dateTo=date.
//
// Reload/F5 giữ filter · copy URL gửi người khác giữ filter · Back/Forward trình duyệt OK.
// Invalid query → sanitize an toàn về default, KHÔNG crash, KHÔNG lộ data ngoài quyền
// (branchId scope vẫn enforce server-side).

import type { ExpenseFilters } from './filter-expenses';
import { sanitizeExpenseFilters } from './filter-expenses';
import type { CashflowReportFilters } from './filter-cashflow-reports';
import { sanitizeCashflowReportFilters } from './filter-cashflow-reports';
import { todayHN } from '@/lib/dates';
import type { DateRange, MonthRange, YearRange } from './date-presets';

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

// ─── Date range URL helpers ───────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Đọc dateFrom/dateTo từ URL — fallback legacy `date=` nếu chỉ có 1.
 *  Default = today/today nếu thiếu cả 2.
 *  Output luôn sạch (validate format, fix from>to bằng swap). */
export function readDateRangeFromQuery(read: Reader, today: string = todayHN()): DateRange {
  let from = read('dateFrom') ?? '';
  let to = read('dateTo') ?? '';
  if (!from && !to) {
    // Legacy fallback — URL cũ có `date=` map → from=to=date.
    const legacy = read('date') ?? '';
    if (DATE_RE.test(legacy)) return { dateFrom: legacy, dateTo: legacy };
    return { dateFrom: today, dateTo: today };
  }
  if (!DATE_RE.test(from)) from = today;
  if (!DATE_RE.test(to)) to = from;
  if (from > to) [from, to] = [to, from]; // sanitize swap
  return { dateFrom: from, dateTo: to };
}

export function writeDateRangeToParams(range: DateRange, params: URLSearchParams, today: string = todayHN()): void {
  const isDefault = range.dateFrom === today && range.dateTo === today;
  if (isDefault) {
    params.delete('dateFrom');
    params.delete('dateTo');
    params.delete('date'); // also clean legacy
    return;
  }
  // Compact form: nếu from===to chỉ ghi 1 param `date` (gọn URL).
  if (range.dateFrom === range.dateTo) {
    params.set('date', range.dateFrom);
    params.delete('dateFrom');
    params.delete('dateTo');
  } else {
    params.set('dateFrom', range.dateFrom);
    params.set('dateTo', range.dateTo);
    params.delete('date');
  }
}

export function readMonthRangeFromQuery(read: Reader, today: string = todayHN()): MonthRange {
  let from = read('monthFrom') ?? '';
  let to = read('monthTo') ?? '';
  const defaultM = today.slice(0, 7);
  if (!from && !to) {
    const legacy = read('month') ?? '';
    if (MONTH_RE.test(legacy)) return { monthFrom: legacy, monthTo: legacy };
    return { monthFrom: defaultM, monthTo: defaultM };
  }
  if (!MONTH_RE.test(from)) from = defaultM;
  if (!MONTH_RE.test(to)) to = from;
  if (from > to) [from, to] = [to, from];
  return { monthFrom: from, monthTo: to };
}

export function writeMonthRangeToParams(range: MonthRange, params: URLSearchParams, today: string = todayHN()): void {
  const defaultM = today.slice(0, 7);
  const isDefault = range.monthFrom === defaultM && range.monthTo === defaultM;
  if (isDefault) {
    params.delete('monthFrom');
    params.delete('monthTo');
    params.delete('month');
    return;
  }
  if (range.monthFrom === range.monthTo) {
    params.set('month', range.monthFrom);
    params.delete('monthFrom');
    params.delete('monthTo');
  } else {
    params.set('monthFrom', range.monthFrom);
    params.set('monthTo', range.monthTo);
    params.delete('month');
  }
}

export function readYearRangeFromQuery(read: Reader, today: string = todayHN()): YearRange {
  const fromS = read('yearFrom') ?? '';
  const toS = read('yearTo') ?? '';
  const defaultY = Number(today.slice(0, 4));
  let from = Number(fromS); let to = Number(toS);
  if (!Number.isFinite(from) || from < 1900 || from > 2100) {
    // Legacy fallback `year=`
    const legacy = Number(read('year') ?? defaultY);
    from = Number.isFinite(legacy) && legacy >= 1900 && legacy <= 2100 ? legacy : defaultY;
  }
  if (!Number.isFinite(to) || to < 1900 || to > 2100) to = from;
  if (from > to) [from, to] = [to, from];
  return { yearFrom: from, yearTo: to };
}

export function writeYearRangeToParams(range: YearRange, params: URLSearchParams, today: string = todayHN()): void {
  const defaultY = Number(today.slice(0, 4));
  const isDefault = range.yearFrom === defaultY && range.yearTo === defaultY;
  if (isDefault) {
    params.delete('yearFrom');
    params.delete('yearTo');
    params.delete('year');
    return;
  }
  if (range.yearFrom === range.yearTo) {
    params.set('year', String(range.yearFrom));
    params.delete('yearFrom');
    params.delete('yearTo');
  } else {
    params.set('yearFrom', String(range.yearFrom));
    params.set('yearTo', String(range.yearTo));
    params.delete('year');
  }
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
