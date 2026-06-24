// PR-CASH-FILTERS (2026-06-24) — Pure helpers cho bộ lọc /bao-cao-thu-chi.
//
// 3 tab daily/monthly/yearly. CLIENT-SIDE filter trên data đã load:
//   - daily tab: data từ /api/finance/cashflow-reports (single date)
//   - monthly tab: từ monthly-summary endpoint
//   - yearly tab: từ yearly-summary endpoint
//
// API không hỗ trợ dateFrom/dateTo → KHÔNG fake date range. Filter chỉ áp
// trên rows đã load (tối đa 200 cho daily; vài chục cho monthly/yearly).

import type { DailyCashflowReportDoc, DailyCashflowReportStatus } from './cashflow-report-types';

export type AlertFilter = '' | 'yes' | 'no';
export type LockedFilter = '' | 'locked' | 'unlocked';
export type UnlockedFilter = '' | 'unlocked' | 'never';
export type NetFilter = '' | 'positive' | 'zero' | 'negative';

export interface CashflowReportFilters {
  status: '' | DailyCashflowReportStatus;
  alerts: AlertFilter;
  locked: LockedFilter;
  unlocked: UnlockedFilter;
  net: NetFilter;
  revenueMin: number | null;
  revenueMax: number | null;
  expenseMin: number | null;
  expenseMax: number | null;
}

export const EMPTY_CASHFLOW_REPORT_FILTERS: CashflowReportFilters = Object.freeze({
  status: '',
  alerts: '',
  locked: '',
  unlocked: '',
  net: '',
  revenueMin: null,
  revenueMax: null,
  expenseMin: null,
  expenseMax: null,
});

const VALID_STATUS: ReadonlySet<string> = new Set([
  'draft', 'submitted', 'sent', 'checked', 'returned', 'locked',
]);
const VALID_ALERTS: ReadonlySet<string> = new Set(['yes', 'no']);
const VALID_LOCKED: ReadonlySet<string> = new Set(['locked', 'unlocked']);
const VALID_UNLOCKED: ReadonlySet<string> = new Set(['unlocked', 'never']);
const VALID_NET: ReadonlySet<string> = new Set(['positive', 'zero', 'negative']);

export function countActiveCashflowReportFilters(f: CashflowReportFilters): number {
  let n = 0;
  if (f.status) n++;
  if (f.alerts) n++;
  if (f.locked) n++;
  if (f.unlocked) n++;
  if (f.net) n++;
  if (f.revenueMin !== null) n++;
  if (f.revenueMax !== null) n++;
  if (f.expenseMin !== null) n++;
  if (f.expenseMax !== null) n++;
  return n;
}

export function hasActiveCashflowReportFilters(f: CashflowReportFilters): boolean {
  return countActiveCashflowReportFilters(f) > 0;
}

/** Subset of DailyCashflowReportDoc fields used by filter — input từ client list (Timestamp đã serialize). */
export interface CashflowReportFilterSubject {
  status: DailyCashflowReportStatus;
  alerts?: { code?: string }[] | null;
  lockedAt?: unknown | null;
  unlockedAt?: unknown | null;
  revenueSource?: { total?: number } | null;
  expense?: { totalByMethod?: { total?: number } } | null;
  net?: { total?: number } | null;
}

export function filterCashflowReports<T extends CashflowReportFilterSubject>(
  rows: ReadonlyArray<T>,
  f: CashflowReportFilters,
): T[] {
  if (!hasActiveCashflowReportFilters(f)) return [...rows];
  return rows.filter((r) => {
    if (f.status && r.status !== f.status) return false;
    if (f.alerts) {
      const has = Array.isArray(r.alerts) && r.alerts.length > 0;
      if (f.alerts === 'yes' && !has) return false;
      if (f.alerts === 'no' && has) return false;
    }
    if (f.locked) {
      const isLocked = r.status === 'locked' || !!r.lockedAt;
      if (f.locked === 'locked' && !isLocked) return false;
      if (f.locked === 'unlocked' && isLocked) return false;
    }
    if (f.unlocked) {
      const hasUnlock = !!r.unlockedAt;
      if (f.unlocked === 'unlocked' && !hasUnlock) return false;
      if (f.unlocked === 'never' && hasUnlock) return false;
    }
    if (f.net) {
      const n = Number(r.net?.total ?? 0);
      if (f.net === 'positive' && !(n > 0)) return false;
      if (f.net === 'zero' && n !== 0) return false;
      if (f.net === 'negative' && !(n < 0)) return false;
    }
    const rev = Number(r.revenueSource?.total ?? 0);
    if (f.revenueMin !== null && rev < f.revenueMin) return false;
    if (f.revenueMax !== null && rev > f.revenueMax) return false;
    const exp = Number(r.expense?.totalByMethod?.total ?? 0);
    if (f.expenseMin !== null && exp < f.expenseMin) return false;
    if (f.expenseMax !== null && exp > f.expenseMax) return false;
    return true;
  });
}

export function sanitizeCashflowReportFilters(
  input: Partial<Record<keyof CashflowReportFilters, unknown>>,
): CashflowReportFilters {
  const st = String(input.status ?? '');
  const al = String(input.alerts ?? '');
  const lk = String(input.locked ?? '');
  const un = String(input.unlocked ?? '');
  const nt = String(input.net ?? '');
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return {
    status: VALID_STATUS.has(st) ? (st as DailyCashflowReportStatus) : '',
    alerts: VALID_ALERTS.has(al) ? (al as AlertFilter) : '',
    locked: VALID_LOCKED.has(lk) ? (lk as LockedFilter) : '',
    unlocked: VALID_UNLOCKED.has(un) ? (un as UnlockedFilter) : '',
    net: VALID_NET.has(nt) ? (nt as NetFilter) : '',
    revenueMin: num(input.revenueMin),
    revenueMax: num(input.revenueMax),
    expenseMin: num(input.expenseMin),
    expenseMax: num(input.expenseMax),
  };
}
