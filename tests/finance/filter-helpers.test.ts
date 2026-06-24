// PR-CASH-FILTERS (2026-06-24) — Tests cho filter helpers + URL state.

import { describe, it, expect } from 'vitest';
import {
  filterExpenses,
  countActiveExpenseFilters,
  hasActiveExpenseFilters,
  sanitizeExpenseFilters,
  sumExpenseAmount,
  sumRecordedExpenseAmount,
  EMPTY_EXPENSE_FILTERS,
  type ExpenseFilters,
} from '@/lib/finance/filter-expenses';
import {
  filterCashflowReports,
  countActiveCashflowReportFilters,
  hasActiveCashflowReportFilters,
  sanitizeCashflowReportFilters,
  EMPTY_CASHFLOW_REPORT_FILTERS,
  type CashflowReportFilters,
} from '@/lib/finance/filter-cashflow-reports';
import {
  readExpenseFiltersFromQuery,
  writeExpenseFiltersToParams,
  readCashflowReportFiltersFromQuery,
  writeCashflowReportFiltersToParams,
} from '@/lib/finance/filter-url';

// ─── Expense filter tests ─────────────────────────────────────────────

const expRow = (over: Partial<any> = {}): any => ({
  voucherNo: 'PC0001',
  description: 'Mua vật tư',
  counterpartyName: 'Cô Hồng',
  paymentMethod: 'cash',
  expenseCategory: 'vat_tu',
  expenseBasisType: 'direct_invoice',
  status: 'recorded',
  amount: 100_000,
  ...over,
});

const ROWS = [
  expRow({ voucherNo: 'PC0001', amount: 100_000, status: 'recorded', paymentMethod: 'cash' }),
  expRow({ voucherNo: 'PC0002', amount: 500_000, status: 'recorded', paymentMethod: 'transfer', counterpartyName: 'Anh Nam' }),
  expRow({ voucherNo: 'PC0003', amount: 1_500_000, status: 'returned', paymentMethod: 'card', expenseCategory: 'sua_chua', description: 'Sửa máy lọc' }),
  expRow({ voucherNo: 'PC0004', amount: 50_000, status: 'draft', paymentMethod: 'other', expenseBasisType: 'other' }),
];

describe('filterExpenses — empty filter = passthrough', () => {
  it('default filter trả nguyên rows', () => {
    expect(filterExpenses(ROWS, EMPTY_EXPENSE_FILTERS)).toHaveLength(ROWS.length);
  });
});

describe('filterExpenses — voucherNo contains', () => {
  it('voucherNo="0002" → 1 row PC0002', () => {
    const out = filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, voucherNo: '0002' });
    expect(out.map((r) => r.voucherNo)).toEqual(['PC0002']);
  });
  it('voucherNo case + diacritic insensitive', () => {
    const r2 = filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, voucherNo: 'pc' });
    expect(r2).toHaveLength(4);
  });
});

describe('filterExpenses — keyword (description + counterparty + voucher)', () => {
  it('keyword="máy" → match description "Sửa máy lọc"', () => {
    const out = filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, keyword: 'máy' });
    expect(out.map((r) => r.voucherNo)).toEqual(['PC0003']);
  });
  it('keyword="hồng" → match counterparty "Cô Hồng"', () => {
    const out = filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, keyword: 'hồng' });
    expect(out.length).toBeGreaterThan(0);
  });
  it('keyword tiếng Việt không dấu cũng match có dấu', () => {
    const out = filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, keyword: 'hong' });
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('filterExpenses — paymentMethod / category / basis / status', () => {
  it('paymentMethod=cash → 1 row', () => {
    expect(filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, paymentMethod: 'cash' })).toHaveLength(1);
  });
  it('expenseCategory=sua_chua → 1 row', () => {
    expect(filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, expenseCategory: 'sua_chua' })).toHaveLength(1);
  });
  it('expenseBasisType=other → 1 row', () => {
    expect(filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, expenseBasisType: 'other' })).toHaveLength(1);
  });
  it('status=draft → 1 row', () => {
    expect(filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, status: 'draft' })).toHaveLength(1);
  });
});

describe('filterExpenses — amount range', () => {
  it('amountMin=200000 → 2 rows ≥200k', () => {
    expect(filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, amountMin: 200_000 })).toHaveLength(2);
  });
  it('amountMax=200000 → 2 rows ≤200k', () => {
    expect(filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, amountMax: 200_000 })).toHaveLength(2);
  });
  it('amountMin=100000 + amountMax=500000 → 2 rows in range', () => {
    expect(filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, amountMin: 100_000, amountMax: 500_000 })).toHaveLength(2);
  });
});

describe('filterExpenses — combined', () => {
  it('voucherNo + status đồng thời', () => {
    const out = filterExpenses(ROWS, { ...EMPTY_EXPENSE_FILTERS, voucherNo: 'PC', status: 'returned' });
    expect(out).toHaveLength(1);
    expect(out[0].voucherNo).toBe('PC0003');
  });
});

describe('countActiveExpenseFilters', () => {
  it('default = 0', () => expect(countActiveExpenseFilters(EMPTY_EXPENSE_FILTERS)).toBe(0));
  it('1 active', () => expect(countActiveExpenseFilters({ ...EMPTY_EXPENSE_FILTERS, voucherNo: 'PC' })).toBe(1));
  it('3 active', () => {
    expect(countActiveExpenseFilters({ ...EMPTY_EXPENSE_FILTERS, voucherNo: 'PC', status: 'draft', amountMin: 1000 })).toBe(3);
  });
  it('hasActive helper', () => {
    expect(hasActiveExpenseFilters(EMPTY_EXPENSE_FILTERS)).toBe(false);
    expect(hasActiveExpenseFilters({ ...EMPTY_EXPENSE_FILTERS, status: 'draft' })).toBe(true);
  });
});

describe('sanitizeExpenseFilters — invalid query không crash', () => {
  it('invalid paymentMethod → ""', () => {
    const f = sanitizeExpenseFilters({ paymentMethod: 'btc' });
    expect(f.paymentMethod).toBe('');
  });
  it('invalid status → ""', () => {
    const f = sanitizeExpenseFilters({ status: 'cancelled-xyz' });
    expect(f.status).toBe('');
  });
  it('NaN amount → null', () => {
    const f = sanitizeExpenseFilters({ amountMin: 'abc' });
    expect(f.amountMin).toBeNull();
  });
  it('âm amount → null', () => {
    const f = sanitizeExpenseFilters({ amountMin: -100 });
    expect(f.amountMin).toBeNull();
  });
  it('rỗng amount → null', () => {
    expect(sanitizeExpenseFilters({ amountMin: '' }).amountMin).toBeNull();
  });
  it('valid full → giữ nguyên', () => {
    const f = sanitizeExpenseFilters({ paymentMethod: 'cash', status: 'recorded', amountMin: '1000' });
    expect(f.paymentMethod).toBe('cash');
    expect(f.status).toBe('recorded');
    expect(f.amountMin).toBe(1000);
  });
});

describe('sumExpenseAmount / sumRecordedExpenseAmount', () => {
  it('tổng all', () => expect(sumExpenseAmount(ROWS)).toBe(2_150_000));
  it('tổng recorded only', () => expect(sumRecordedExpenseAmount(ROWS)).toBe(600_000));
});

// ─── Cashflow report filter tests ─────────────────────────────────────

const repRow = (over: Partial<any> = {}): any => ({
  status: 'checked',
  alerts: [],
  lockedAt: null,
  unlockedAt: null,
  revenueSource: { total: 10_000_000 },
  expense: { totalByMethod: { total: 3_000_000 } },
  net: { total: 7_000_000 },
  ...over,
});

const REPS = [
  repRow({ status: 'submitted', alerts: [], net: { total: 5_000_000 } }),
  repRow({ status: 'returned', alerts: [{ code: 'NET_NEGATIVE_CASH' }], net: { total: -500_000 } }),
  repRow({ status: 'locked', lockedAt: 't1', net: { total: 8_000_000 } }),
  repRow({ status: 'checked', alerts: [{ code: 'DAILY_REVENUE_ZERO' }], revenueSource: { total: 0 }, net: { total: -1_000_000 } }),
  repRow({ status: 'checked', lockedAt: 't1', unlockedAt: 't2', net: { total: 0 } }),
];

describe('filterCashflowReports — empty filter = passthrough', () => {
  it('default = 5 rows', () => {
    expect(filterCashflowReports(REPS, EMPTY_CASHFLOW_REPORT_FILTERS)).toHaveLength(5);
  });
});

describe('filterCashflowReports — status / alerts / locked / unlocked / net', () => {
  it('status=returned → 1 row', () => {
    expect(filterCashflowReports(REPS, { ...EMPTY_CASHFLOW_REPORT_FILTERS, status: 'returned' })).toHaveLength(1);
  });
  it('alerts=yes → 2 rows có alert', () => {
    expect(filterCashflowReports(REPS, { ...EMPTY_CASHFLOW_REPORT_FILTERS, alerts: 'yes' })).toHaveLength(2);
  });
  it('alerts=no → 3 rows không alert', () => {
    expect(filterCashflowReports(REPS, { ...EMPTY_CASHFLOW_REPORT_FILTERS, alerts: 'no' })).toHaveLength(3);
  });
  it('locked=locked → 2 rows', () => {
    expect(filterCashflowReports(REPS, { ...EMPTY_CASHFLOW_REPORT_FILTERS, locked: 'locked' })).toHaveLength(2);
  });
  it('unlocked=unlocked → 1 row đã từng unlock', () => {
    expect(filterCashflowReports(REPS, { ...EMPTY_CASHFLOW_REPORT_FILTERS, unlocked: 'unlocked' })).toHaveLength(1);
  });
  it('net=negative → 2 rows', () => {
    expect(filterCashflowReports(REPS, { ...EMPTY_CASHFLOW_REPORT_FILTERS, net: 'negative' })).toHaveLength(2);
  });
  it('net=zero → 1 row', () => {
    expect(filterCashflowReports(REPS, { ...EMPTY_CASHFLOW_REPORT_FILTERS, net: 'zero' })).toHaveLength(1);
  });
  it('net=positive → 2 rows', () => {
    expect(filterCashflowReports(REPS, { ...EMPTY_CASHFLOW_REPORT_FILTERS, net: 'positive' })).toHaveLength(2);
  });
});

describe('filterCashflowReports — revenue / expense range', () => {
  it('revenueMin=1tr → loại row revenue=0', () => {
    expect(filterCashflowReports(REPS, { ...EMPTY_CASHFLOW_REPORT_FILTERS, revenueMin: 1_000_000 })).toHaveLength(4);
  });
  it('expenseMax=5tr giữ rows expense ≤5tr (tất cả default 3tr)', () => {
    expect(filterCashflowReports(REPS, { ...EMPTY_CASHFLOW_REPORT_FILTERS, expenseMax: 5_000_000 })).toHaveLength(5);
  });
});

describe('countActiveCashflowReportFilters', () => {
  it('default = 0', () => expect(countActiveCashflowReportFilters(EMPTY_CASHFLOW_REPORT_FILTERS)).toBe(0));
  it('3 active', () => {
    expect(countActiveCashflowReportFilters({ ...EMPTY_CASHFLOW_REPORT_FILTERS, status: 'returned', alerts: 'yes', net: 'negative' })).toBe(3);
  });
  it('hasActive helper', () => {
    expect(hasActiveCashflowReportFilters(EMPTY_CASHFLOW_REPORT_FILTERS)).toBe(false);
    expect(hasActiveCashflowReportFilters({ ...EMPTY_CASHFLOW_REPORT_FILTERS, alerts: 'yes' })).toBe(true);
  });
});

describe('sanitizeCashflowReportFilters — invalid query không crash', () => {
  it('invalid status → ""', () => {
    expect(sanitizeCashflowReportFilters({ status: 'xyz' }).status).toBe('');
  });
  it('invalid net → ""', () => {
    expect(sanitizeCashflowReportFilters({ net: 'rainbow' }).net).toBe('');
  });
  it('NaN range → null', () => {
    expect(sanitizeCashflowReportFilters({ revenueMin: 'abc' }).revenueMin).toBeNull();
  });
});

// ─── URL serialize/parse tests ────────────────────────────────────────

describe('writeExpenseFiltersToParams + read', () => {
  it('serialize → parse round-trip', () => {
    const f: ExpenseFilters = {
      voucherNo: 'PC',
      keyword: 'máy lọc',
      counterpartyName: 'Cô Hồng',
      paymentMethod: 'cash',
      expenseCategory: 'sua_chua',
      expenseBasisType: 'direct_invoice',
      status: 'recorded',
      amountMin: 100_000,
      amountMax: 5_000_000,
    };
    const p = new URLSearchParams();
    writeExpenseFiltersToParams(f, p);
    const back = readExpenseFiltersFromQuery((k) => p.get(k));
    expect(back).toEqual(f);
  });

  it('default filter → query rỗng (không leak param thừa)', () => {
    const p = new URLSearchParams();
    writeExpenseFiltersToParams(EMPTY_EXPENSE_FILTERS, p);
    expect(p.toString()).toBe('');
  });

  it('partial filter → chỉ param active được set', () => {
    const p = new URLSearchParams();
    writeExpenseFiltersToParams({ ...EMPTY_EXPENSE_FILTERS, status: 'draft', amountMin: 1000 }, p);
    expect(p.get('status')).toBe('draft');
    expect(p.get('amountMin')).toBe('1000');
    expect(p.get('paymentMethod')).toBeNull();
  });

  it('clear filter sau khi set → param xoá', () => {
    const p = new URLSearchParams('voucherNo=PC&status=draft');
    writeExpenseFiltersToParams(EMPTY_EXPENSE_FILTERS, p);
    expect(p.get('voucherNo')).toBeNull();
    expect(p.get('status')).toBeNull();
  });
});

describe('readExpenseFiltersFromQuery — invalid query không crash', () => {
  it('amount=text → null', () => {
    const p = new URLSearchParams('amountMin=abc');
    const f = readExpenseFiltersFromQuery((k) => p.get(k));
    expect(f.amountMin).toBeNull();
  });
  it('paymentMethod=bitcoin → ""', () => {
    const p = new URLSearchParams('paymentMethod=bitcoin');
    const f = readExpenseFiltersFromQuery((k) => p.get(k));
    expect(f.paymentMethod).toBe('');
  });
  it('rỗng query → EMPTY filter', () => {
    const f = readExpenseFiltersFromQuery(() => null);
    expect(f).toEqual(EMPTY_EXPENSE_FILTERS);
  });
});

// ─── PR-CASH-DATE-RANGE-UX URL helpers ────────────────────────────────

import {
  readDateRangeFromQuery,
  writeDateRangeToParams,
  readMonthRangeFromQuery,
  writeMonthRangeToParams,
  readYearRangeFromQuery,
  writeYearRangeToParams,
} from '@/lib/finance/filter-url';

describe('readDateRangeFromQuery + write — date range URL state', () => {
  const T = '2026-06-24';

  it('rỗng query → today/today', () => {
    const r = readDateRangeFromQuery(() => null, T);
    expect(r).toEqual({ dateFrom: T, dateTo: T });
  });

  it('Legacy date=YYYY-MM-DD → from=to=date', () => {
    const p = new URLSearchParams('date=2026-06-20');
    const r = readDateRangeFromQuery((k) => p.get(k), T);
    expect(r).toEqual({ dateFrom: '2026-06-20', dateTo: '2026-06-20' });
  });

  it('dateFrom + dateTo hợp lệ', () => {
    const p = new URLSearchParams('dateFrom=2026-06-10&dateTo=2026-06-20');
    const r = readDateRangeFromQuery((k) => p.get(k), T);
    expect(r).toEqual({ dateFrom: '2026-06-10', dateTo: '2026-06-20' });
  });

  it('Invalid dateFrom → fallback today', () => {
    const p = new URLSearchParams('dateFrom=abc&dateTo=2026-06-24');
    const r = readDateRangeFromQuery((k) => p.get(k), T);
    expect(r.dateFrom).toBe(T);
  });

  it('From > To → swap', () => {
    const p = new URLSearchParams('dateFrom=2026-06-25&dateTo=2026-06-10');
    const r = readDateRangeFromQuery((k) => p.get(k), T);
    expect(r.dateFrom).toBe('2026-06-10');
    expect(r.dateTo).toBe('2026-06-25');
  });

  it('Write today/today → params rỗng (compact)', () => {
    const p = new URLSearchParams();
    writeDateRangeToParams({ dateFrom: T, dateTo: T }, p, T);
    expect(p.toString()).toBe('');
  });

  it('Write from===to khác today → date= compact form', () => {
    const p = new URLSearchParams();
    writeDateRangeToParams({ dateFrom: '2026-06-20', dateTo: '2026-06-20' }, p, T);
    expect(p.get('date')).toBe('2026-06-20');
    expect(p.get('dateFrom')).toBeNull();
    expect(p.get('dateTo')).toBeNull();
  });

  it('Write range → dateFrom + dateTo', () => {
    const p = new URLSearchParams();
    writeDateRangeToParams({ dateFrom: '2026-06-10', dateTo: '2026-06-20' }, p, T);
    expect(p.get('dateFrom')).toBe('2026-06-10');
    expect(p.get('dateTo')).toBe('2026-06-20');
    expect(p.get('date')).toBeNull();
  });

  it('Round-trip range', () => {
    const range = { dateFrom: '2026-06-10', dateTo: '2026-06-20' };
    const p = new URLSearchParams();
    writeDateRangeToParams(range, p, T);
    const back = readDateRangeFromQuery((k) => p.get(k), T);
    expect(back).toEqual(range);
  });
});

describe('readMonthRangeFromQuery + write', () => {
  const T = '2026-06-24';
  it('Legacy month= → from=to=month', () => {
    const p = new URLSearchParams('month=2026-05');
    const r = readMonthRangeFromQuery((k) => p.get(k), T);
    expect(r).toEqual({ monthFrom: '2026-05', monthTo: '2026-05' });
  });
  it('Range round-trip', () => {
    const range = { monthFrom: '2026-04', monthTo: '2026-06' };
    const p = new URLSearchParams();
    writeMonthRangeToParams(range, p, T);
    expect(readMonthRangeFromQuery((k) => p.get(k), T)).toEqual(range);
  });
  it('From > to → swap', () => {
    const p = new URLSearchParams('monthFrom=2026-08&monthTo=2026-06');
    const r = readMonthRangeFromQuery((k) => p.get(k), T);
    expect(r).toEqual({ monthFrom: '2026-06', monthTo: '2026-08' });
  });
});

describe('readYearRangeFromQuery + write', () => {
  const T = '2026-06-24';
  it('Legacy year=YYYY → from=to=year', () => {
    const p = new URLSearchParams('year=2024');
    const r = readYearRangeFromQuery((k) => p.get(k), T);
    expect(r).toEqual({ yearFrom: 2024, yearTo: 2024 });
  });
  it('Round-trip', () => {
    const range = { yearFrom: 2024, yearTo: 2026 };
    const p = new URLSearchParams();
    writeYearRangeToParams(range, p, T);
    expect(readYearRangeFromQuery((k) => p.get(k), T)).toEqual(range);
  });
  it('Invalid year → fallback today', () => {
    const p = new URLSearchParams('yearFrom=abc');
    const r = readYearRangeFromQuery((k) => p.get(k), T);
    expect(r.yearFrom).toBe(2026);
  });
});

describe('writeCashflowReportFiltersToParams + read', () => {
  it('round-trip', () => {
    const f: CashflowReportFilters = {
      status: 'returned',
      alerts: 'yes',
      locked: 'locked',
      unlocked: 'unlocked',
      net: 'negative',
      revenueMin: 1_000_000,
      revenueMax: 100_000_000,
      expenseMin: 100_000,
      expenseMax: 50_000_000,
    };
    const p = new URLSearchParams();
    writeCashflowReportFiltersToParams(f, p);
    const back = readCashflowReportFiltersFromQuery((k) => p.get(k));
    expect(back).toEqual(f);
  });

  it('default → query rỗng', () => {
    const p = new URLSearchParams();
    writeCashflowReportFiltersToParams(EMPTY_CASHFLOW_REPORT_FILTERS, p);
    expect(p.toString()).toBe('');
  });
});
