// PR-CASH-FILTERS (2026-06-24) — Pure helpers cho bộ lọc nâng cao /chi-phi-co-so.
//
// Tất cả filter CLIENT-SIDE, áp lên data đã load của 1 ngày (single date).
// API /api/finance/expenses không hỗ trợ dateFrom/dateTo → KHÔNG fake date range
// trong PR này. Filter chỉ áp trên rows đã load.
//
// Filters supported:
//   voucherNo       — string contains (case-insensitive, diacritic-insensitive)
//   keyword         — search description + counterpartyName + voucherNo
//   counterpartyName — string contains
//   paymentMethod   — exact (cash|transfer|card|other) hoặc '' = all
//   expenseCategory — exact enum hoặc '' = all
//   expenseBasisType— exact enum hoặc '' = all
//   status          — exact (draft|recorded|returned|voided) hoặc '' = all
//   amountMin       — number ≥
//   amountMax       — number ≤

import type {
  BranchDailyExpenseDoc,
  ExpensePaymentMethod,
  ExpenseStatus,
  ExpenseCategory,
  ExpenseBasisType,
} from './expense-types';
import {
  VALID_EXPENSE_PAYMENT_METHODS,
  VALID_EXPENSE_STATUSES,
  VALID_EXPENSE_CATEGORIES,
  VALID_EXPENSE_BASIS_TYPES,
} from './expense-types';

export interface ExpenseFilters {
  voucherNo: string;
  keyword: string;
  counterpartyName: string;
  paymentMethod: '' | ExpensePaymentMethod;
  expenseCategory: '' | ExpenseCategory;
  expenseBasisType: '' | ExpenseBasisType;
  status: '' | ExpenseStatus;
  amountMin: number | null;
  amountMax: number | null;
}

export const EMPTY_EXPENSE_FILTERS: ExpenseFilters = Object.freeze({
  voucherNo: '',
  keyword: '',
  counterpartyName: '',
  paymentMethod: '',
  expenseCategory: '',
  expenseBasisType: '',
  status: '',
  amountMin: null,
  amountMax: null,
});

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function strIncludes(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  if (!haystack) return false;
  return norm(haystack).includes(norm(needle));
}

/** Đếm số filter đang active (≠ default). UI badge "Đang lọc: N". */
export function countActiveExpenseFilters(f: ExpenseFilters): number {
  let n = 0;
  if (f.voucherNo.trim()) n++;
  if (f.keyword.trim()) n++;
  if (f.counterpartyName.trim()) n++;
  if (f.paymentMethod) n++;
  if (f.expenseCategory) n++;
  if (f.expenseBasisType) n++;
  if (f.status) n++;
  if (f.amountMin !== null) n++;
  if (f.amountMax !== null) n++;
  return n;
}

export function hasActiveExpenseFilters(f: ExpenseFilters): boolean {
  return countActiveExpenseFilters(f) > 0;
}

/** Filter rows theo ExpenseFilters. Pure function. Empty filter → trả nguyên rows. */
export function filterExpenses<T extends Pick<
  BranchDailyExpenseDoc,
  'voucherNo' | 'description' | 'counterpartyName' | 'paymentMethod' | 'expenseCategory' | 'expenseBasisType' | 'status' | 'amount'
>>(rows: ReadonlyArray<T>, f: ExpenseFilters): T[] {
  if (!hasActiveExpenseFilters(f)) return [...rows];
  return rows.filter((r) => {
    if (f.voucherNo.trim() && !strIncludes(r.voucherNo, f.voucherNo)) return false;
    if (f.keyword.trim()) {
      const k = f.keyword;
      const hits = strIncludes(r.description, k)
        || strIncludes(r.counterpartyName, k)
        || strIncludes(r.voucherNo, k);
      if (!hits) return false;
    }
    if (f.counterpartyName.trim() && !strIncludes(r.counterpartyName, f.counterpartyName)) return false;
    if (f.paymentMethod && r.paymentMethod !== f.paymentMethod) return false;
    if (f.expenseCategory && r.expenseCategory !== f.expenseCategory) return false;
    if (f.expenseBasisType && r.expenseBasisType !== f.expenseBasisType) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.amountMin !== null && r.amount < f.amountMin) return false;
    if (f.amountMax !== null && r.amount > f.amountMax) return false;
    return true;
  });
}

/** Sanitize 1 giá trị filter từ URL query — invalid → default. KHÔNG throw. */
export function sanitizeExpenseFilters(input: Partial<Record<keyof ExpenseFilters, unknown>>): ExpenseFilters {
  const pm = String(input.paymentMethod ?? '');
  const cat = String(input.expenseCategory ?? '');
  const basis = String(input.expenseBasisType ?? '');
  const st = String(input.status ?? '');
  const amin = input.amountMin == null || input.amountMin === '' ? null : Number(input.amountMin);
  const amax = input.amountMax == null || input.amountMax === '' ? null : Number(input.amountMax);
  return {
    voucherNo: typeof input.voucherNo === 'string' ? input.voucherNo : '',
    keyword: typeof input.keyword === 'string' ? input.keyword : '',
    counterpartyName: typeof input.counterpartyName === 'string' ? input.counterpartyName : '',
    paymentMethod: VALID_EXPENSE_PAYMENT_METHODS.has(pm) ? (pm as ExpensePaymentMethod) : '',
    expenseCategory: VALID_EXPENSE_CATEGORIES.has(cat) ? (cat as ExpenseCategory) : '',
    expenseBasisType: VALID_EXPENSE_BASIS_TYPES.has(basis) ? (basis as ExpenseBasisType) : '',
    status: VALID_EXPENSE_STATUSES.has(st) ? (st as ExpenseStatus) : '',
    amountMin: Number.isFinite(amin) && (amin as number) >= 0 ? amin : null,
    amountMax: Number.isFinite(amax) && (amax as number) >= 0 ? amax : null,
  };
}

/** Tổng số tiền theo bộ rows (đã filter hoặc chưa). */
export function sumExpenseAmount<T extends Pick<BranchDailyExpenseDoc, 'amount'>>(rows: ReadonlyArray<T>): number {
  let sum = 0;
  for (const r of rows) sum += Number(r.amount) || 0;
  return sum;
}

/** Tổng RECORDED ONLY — alignment với nghiệp vụ ExpenseStatusSummary cũ. */
export function sumRecordedExpenseAmount<T extends Pick<BranchDailyExpenseDoc, 'amount' | 'status'>>(rows: ReadonlyArray<T>): number {
  let sum = 0;
  for (const r of rows) {
    if (r.status === 'recorded') sum += Number(r.amount) || 0;
  }
  return sum;
}
