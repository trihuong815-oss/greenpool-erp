'use client';

// PR-CASH-DATE-RANGE-UX (2026-06-24) — UI bar chọn khoảng ngày.
//
// Bố cục:
//  - Hàng 1: select preset (Hôm nay / Hôm qua / 7 ngày / 30 ngày / Tháng này /
//    Tháng trước / Tuỳ chỉnh) — dùng select để tiết kiệm chiều ngang trên
//    mobile, có thêm preset chip cho desktop.
//  - Hàng 2: Từ ngày + Đến ngày (native <input type="date"> — browser tự xổ
//    calendar; KHÔNG thêm dep mới).
//
// Khi user đổi preset → auto-fill from/to.
// Khi user gõ from/to thủ công → preset auto chuyển 'custom'.

import { useMemo } from 'react';
import { CalendarDays, X } from 'lucide-react';
import {
  DATE_PRESET_LABEL,
  computeDateRange,
  detectDatePreset,
  rangeDays,
  MONTH_PRESET_LABEL,
  computeMonthRange,
  detectMonthPreset,
  rangeMonths,
  type DatePresetKey,
  type DateRange,
  type MonthPresetKey,
  type MonthRange,
  type YearRange,
} from '@/lib/finance/date-presets';

interface Props {
  value: DateRange;
  onChange: (next: DateRange, preset: DatePresetKey) => void;
  /** Cap số ngày tối đa (default 31 — match API). */
  maxDays?: number;
  className?: string;
}

const PRESETS: DatePresetKey[] = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth', 'custom'];

export function DateRangeBar({ value, onChange, maxDays = 31, className = '' }: Props) {
  const currentPreset = useMemo(() => detectDatePreset(value), [value]);
  const days = useMemo(() => rangeDays(value), [value]);
  const tooMany = days > maxDays;

  const onPresetChange = (p: DatePresetKey) => {
    if (p === 'custom') {
      onChange(value, 'custom');
      return;
    }
    const r = computeDateRange(p);
    if (r) onChange(r, p);
  };

  const onFromChange = (v: string) => {
    const next: DateRange = { dateFrom: v || value.dateFrom, dateTo: value.dateTo };
    onChange(next, detectDatePreset(next));
  };
  const onToChange = (v: string) => {
    const next: DateRange = { dateFrom: value.dateFrom, dateTo: v || value.dateTo };
    onChange(next, detectDatePreset(next));
  };

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-slate-600 mb-1">Kiểu thời gian</label>
        <select
          value={currentPreset}
          onChange={(e) => onPresetChange(e.target.value as DatePresetKey)}
          className="h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>{DATE_PRESET_LABEL[p]}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
          <CalendarDays size={11} /> Từ ngày
        </label>
        <input
          type="date"
          value={value.dateFrom}
          max={value.dateTo}
          onChange={(e) => onFromChange(e.target.value)}
          className="h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
          <CalendarDays size={11} /> Đến ngày
        </label>
        <input
          type="date"
          value={value.dateTo}
          min={value.dateFrom}
          onChange={(e) => onToChange(e.target.value)}
          className="h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
        />
      </div>
      {days > 1 && (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-slate-100 ring-1 ring-slate-200 text-slate-600 mb-1">
          {days} ngày
        </span>
      )}
      {tooMany && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-rose-50 ring-1 ring-rose-200 text-rose-700 mb-1">
          <X size={11} /> Vượt {maxDays} ngày (cap server)
        </span>
      )}
    </div>
  );
}

// ─── Month range bar ──────────────────────────────────────────────────

interface MonthProps {
  value: MonthRange;
  onChange: (next: MonthRange, preset: MonthPresetKey) => void;
  maxMonths?: number;
  className?: string;
}

const MONTH_PRESETS: MonthPresetKey[] = ['thisMonth', 'lastMonth', 'last3', 'last6', 'custom'];

export function MonthRangeBar({ value, onChange, maxMonths = 12, className = '' }: MonthProps) {
  const currentPreset = useMemo(() => detectMonthPreset(value), [value]);
  const months = useMemo(() => rangeMonths(value), [value]);
  const tooMany = months > maxMonths;

  const onPresetChange = (p: MonthPresetKey) => {
    if (p === 'custom') { onChange(value, 'custom'); return; }
    const r = computeMonthRange(p);
    if (r) onChange(r, p);
  };
  const onFromChange = (v: string) => {
    const next: MonthRange = { monthFrom: v || value.monthFrom, monthTo: value.monthTo };
    onChange(next, detectMonthPreset(next));
  };
  const onToChange = (v: string) => {
    const next: MonthRange = { monthFrom: value.monthFrom, monthTo: v || value.monthTo };
    onChange(next, detectMonthPreset(next));
  };

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-slate-600 mb-1">Kiểu tháng</label>
        <select
          value={currentPreset}
          onChange={(e) => onPresetChange(e.target.value as MonthPresetKey)}
          className="h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
        >
          {MONTH_PRESETS.map((p) => (
            <option key={p} value={p}>{MONTH_PRESET_LABEL[p]}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-slate-600 mb-1">Từ tháng</label>
        <input
          type="month"
          value={value.monthFrom}
          max={value.monthTo}
          onChange={(e) => onFromChange(e.target.value)}
          className="h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-slate-600 mb-1">Đến tháng</label>
        <input
          type="month"
          value={value.monthTo}
          min={value.monthFrom}
          onChange={(e) => onToChange(e.target.value)}
          className="h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
        />
      </div>
      {months > 1 && (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-slate-100 ring-1 ring-slate-200 text-slate-600 mb-1">
          {months} tháng
        </span>
      )}
      {tooMany && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-rose-50 ring-1 ring-rose-200 text-rose-700 mb-1">
          <X size={11} /> Vượt {maxMonths} tháng
        </span>
      )}
    </div>
  );
}

// ─── Year range bar ──────────────────────────────────────────────────

interface YearProps {
  value: YearRange;
  onChange: (next: YearRange) => void;
  /** Min/max year cho input — default current year ± 10. */
  minYear?: number;
  maxYear?: number;
  className?: string;
}

export function YearRangeBar({ value, onChange, minYear, maxYear, className = '' }: YearProps) {
  const onFrom = (v: number) => onChange({ yearFrom: v, yearTo: Math.max(v, value.yearTo) });
  const onTo = (v: number) => onChange({ yearFrom: Math.min(v, value.yearFrom), yearTo: v });
  const years = value.yearTo - value.yearFrom + 1;

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-slate-600 mb-1">Từ năm</label>
        <input
          type="number"
          min={minYear}
          max={maxYear}
          value={value.yearFrom}
          onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0) onFrom(n); }}
          className="h-9 w-24 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors tabular-nums"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-medium text-slate-600 mb-1">Đến năm</label>
        <input
          type="number"
          min={minYear}
          max={maxYear}
          value={value.yearTo}
          onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0) onTo(n); }}
          className="h-9 w-24 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors tabular-nums"
        />
      </div>
      {years > 1 && (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-slate-100 ring-1 ring-slate-200 text-slate-600 mb-1">
          {years} năm
        </span>
      )}
    </div>
  );
}
