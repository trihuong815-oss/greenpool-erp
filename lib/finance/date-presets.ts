// PR-CASH-DATE-RANGE-UX (2026-06-24) — Pure helpers cho preset thời gian
// dùng trong /chi-phi-co-so và /bao-cao-thu-chi.
//
// Tất cả tính theo timezone HN (Asia/Ho_Chi_Minh) để khớp với data ngày YYYY-MM-DD lưu DB.
// Không dùng new Date() để generate "today" — dùng helper todayHN() đã có.

import { todayHN } from '@/lib/dates';

export type DatePresetKey =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom';

export const DATE_PRESET_LABEL: Record<DatePresetKey, string> = {
  today: 'Hôm nay',
  yesterday: 'Hôm qua',
  last7: '7 ngày gần nhất',
  last30: '30 ngày gần nhất',
  thisMonth: 'Tháng này',
  lastMonth: 'Tháng trước',
  custom: 'Tuỳ chỉnh',
};

export interface DateRange {
  dateFrom: string;  // YYYY-MM-DD
  dateTo: string;    // YYYY-MM-DD inclusive
}

/** Add N days to a YYYY-MM-DD string. Pure UTC arithmetic — safe for date-only string. */
export function addDaysISO(yyyyMmDd: string, n: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Build YYYY-MM-DD từ year/month(1-12)/day. */
export function ymd(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/** Last day of (year, month=1-12) — handles 28/29/30/31 correctly. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parse YYYY-MM-DD → { year, month, day }. */
export function parseYmd(s: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Compute date range cho 1 preset key. Custom → trả về null (caller dùng dateFrom/dateTo riêng). */
export function computeDateRange(preset: DatePresetKey, today: string = todayHN()): DateRange | null {
  if (preset === 'custom') return null;
  const t = parseYmd(today);
  if (!t) return null;
  switch (preset) {
    case 'today':
      return { dateFrom: today, dateTo: today };
    case 'yesterday': {
      const y = addDaysISO(today, -1);
      return { dateFrom: y, dateTo: y };
    }
    case 'last7':
      return { dateFrom: addDaysISO(today, -6), dateTo: today };
    case 'last30':
      return { dateFrom: addDaysISO(today, -29), dateTo: today };
    case 'thisMonth':
      return { dateFrom: ymd(t.year, t.month, 1), dateTo: today };
    case 'lastMonth': {
      // Tháng trước: nếu hiện tháng 1 → tháng 12 năm trước; else tháng-1.
      const py = t.month === 1 ? t.year - 1 : t.year;
      const pm = t.month === 1 ? 12 : t.month - 1;
      const lastDay = lastDayOfMonth(py, pm);
      return { dateFrom: ymd(py, pm, 1), dateTo: ymd(py, pm, lastDay) };
    }
  }
}

/** Detect preset key từ 1 range cụ thể (để UI hiển thị chip đúng).
 *  Nếu range không khớp preset nào → 'custom'. */
export function detectDatePreset(range: DateRange, today: string = todayHN()): DatePresetKey {
  for (const p of ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth'] as const) {
    const r = computeDateRange(p, today);
    if (r && r.dateFrom === range.dateFrom && r.dateTo === range.dateTo) return p;
  }
  return 'custom';
}

/** Đếm số ngày trong range inclusive (vd 2026-06-01 → 2026-06-07 = 7 ngày). */
export function rangeDays(range: DateRange): number {
  const a = parseYmd(range.dateFrom);
  const b = parseYmd(range.dateTo);
  if (!a || !b) return 0;
  const ms = new Date(Date.UTC(b.year, b.month - 1, b.day)).getTime()
    - new Date(Date.UTC(a.year, a.month - 1, a.day)).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

/** Validate range hợp lệ: from <= to, format đúng. */
export function isValidDateRange(range: DateRange): boolean {
  if (!parseYmd(range.dateFrom) || !parseYmd(range.dateTo)) return false;
  return range.dateFrom <= range.dateTo;
}

// ─── Month range (cho tab Theo tháng) ─────────────────────────────────

export type MonthPresetKey =
  | 'thisMonth'
  | 'lastMonth'
  | 'last3'
  | 'last6'
  | 'custom';

export const MONTH_PRESET_LABEL: Record<MonthPresetKey, string> = {
  thisMonth: 'Tháng này',
  lastMonth: 'Tháng trước',
  last3: '3 tháng gần nhất',
  last6: '6 tháng gần nhất',
  custom: 'Tuỳ chỉnh',
};

export interface MonthRange {
  monthFrom: string;  // YYYY-MM
  monthTo: string;    // YYYY-MM inclusive
}

/** Convert YYYY-MM-DD → YYYY-MM. */
export function monthOf(yyyyMmDd: string): string {
  return yyyyMmDd.slice(0, 7);
}

/** Add N months to YYYY-MM (signed). */
export function addMonths(yyyyMm: string, n: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!m) return yyyyMm;
  const y = Number(m[1]); const mo = Number(m[2]);
  // Use UTC to avoid TZ issues; day=1.
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function computeMonthRange(preset: MonthPresetKey, today: string = todayHN()): MonthRange | null {
  if (preset === 'custom') return null;
  const thisM = monthOf(today);
  switch (preset) {
    case 'thisMonth':
      return { monthFrom: thisM, monthTo: thisM };
    case 'lastMonth': {
      const lm = addMonths(thisM, -1);
      return { monthFrom: lm, monthTo: lm };
    }
    case 'last3':
      return { monthFrom: addMonths(thisM, -2), monthTo: thisM };
    case 'last6':
      return { monthFrom: addMonths(thisM, -5), monthTo: thisM };
  }
}

export function detectMonthPreset(range: MonthRange, today: string = todayHN()): MonthPresetKey {
  for (const p of ['thisMonth', 'lastMonth', 'last3', 'last6'] as const) {
    const r = computeMonthRange(p, today);
    if (r && r.monthFrom === range.monthFrom && r.monthTo === range.monthTo) return p;
  }
  return 'custom';
}

export function rangeMonths(range: MonthRange): number {
  const a = /^(\d{4})-(\d{2})$/.exec(range.monthFrom);
  const b = /^(\d{4})-(\d{2})$/.exec(range.monthTo);
  if (!a || !b) return 0;
  const aY = Number(a[1]); const aM = Number(a[2]);
  const bY = Number(b[1]); const bM = Number(b[2]);
  return (bY - aY) * 12 + (bM - aM) + 1;
}

export function isValidMonthRange(range: MonthRange): boolean {
  const a = /^\d{4}-\d{2}$/.test(range.monthFrom);
  const b = /^\d{4}-\d{2}$/.test(range.monthTo);
  if (!a || !b) return false;
  return range.monthFrom <= range.monthTo;
}

// ─── Year range (cho tab Theo năm) ────────────────────────────────────

export interface YearRange {
  yearFrom: number;
  yearTo: number;
}

/** Liệt kê các tháng YYYY-MM nằm trong monthRange (inclusive). */
export function listMonthsInRange(range: MonthRange): string[] {
  if (!isValidMonthRange(range)) return [];
  const out: string[] = [];
  let cur = range.monthFrom;
  while (cur <= range.monthTo) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

/** Liệt kê các năm trong yearRange. */
export function listYearsInRange(range: YearRange): number[] {
  if (range.yearFrom > range.yearTo) return [];
  const out: number[] = [];
  for (let y = range.yearFrom; y <= range.yearTo; y++) out.push(y);
  return out;
}
