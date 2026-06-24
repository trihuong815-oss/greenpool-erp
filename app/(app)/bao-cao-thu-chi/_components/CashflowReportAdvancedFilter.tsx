'use client';

// PR-CASH-FILTERS (2026-06-24) — Advanced filter cho /bao-cao-thu-chi (daily tab).
//
// Quick filter (existing CashflowReportFilters): date + branch + status chip + alerts toggle.
// Advanced (this): locked / unlocked / net / revenue range / expense range.
// Status + alerts từ quick filter sẽ được mirror sang state để chip "Đang lọc" hiển thị tổng.

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Filter, X, RotateCcw, Check } from 'lucide-react';
import {
  EMPTY_CASHFLOW_REPORT_FILTERS,
  countActiveCashflowReportFilters,
  type CashflowReportFilters,
} from '@/lib/finance/filter-cashflow-reports';
import { DAILY_CASHFLOW_REPORT_STATUS_LABEL, type DailyCashflowReportStatus } from '@/lib/finance/cashflow-report-types';

interface Props {
  value: CashflowReportFilters;
  onApply: (next: CashflowReportFilters) => void;
  onClear: () => void;
}

const INPUT_CLS = 'w-full h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors';

const ALERT_LABEL = { yes: 'Có cảnh báo', no: 'Không cảnh báo' };
const LOCKED_LABEL = { locked: 'Đã khóa', unlocked: 'Chưa khóa' };
const UNLOCKED_LABEL = { unlocked: 'Đã từng mở khóa', never: 'Chưa từng mở khóa' };
const NET_LABEL = { positive: 'Net dương', zero: 'Net = 0', negative: 'Net âm' };

export function CashflowReportAdvancedFilter({ value, onApply, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CashflowReportFilters>(value);
  const activeCount = countActiveCashflowReportFilters(value);

  useEffect(() => { setDraft(value); }, [value]);

  const apply = () => { onApply(draft); setOpen(false); };
  const clear = () => { setDraft(EMPTY_CASHFLOW_REPORT_FILTERS); onClear(); };

  const update = <K extends keyof CashflowReportFilters>(key: K, v: CashflowReportFilters[K]) => {
    setDraft((prev) => ({ ...prev, [key]: v }));
  };

  const removeOne = <K extends keyof CashflowReportFilters>(key: K) => {
    const next = { ...value, [key]: EMPTY_CASHFLOW_REPORT_FILTERS[key] };
    onApply(next);
    setDraft(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => { setDraft(value); setOpen((p) => !p); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ring-1 ring-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Filter size={12} className="text-emerald-600" />
          Lọc nâng cao
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
              {activeCount}
            </span>
          )}
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {activeCount > 0 && (
          <button type="button" onClick={clear}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ring-1 ring-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors">
            <RotateCcw size={11} /> Xóa lọc
          </button>
        )}
        {activeCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {value.status && <Chip label={`Trạng thái: ${DAILY_CASHFLOW_REPORT_STATUS_LABEL[value.status as DailyCashflowReportStatus]}`} onRemove={() => removeOne('status')} />}
            {value.alerts && <Chip label={ALERT_LABEL[value.alerts as 'yes' | 'no']} onRemove={() => removeOne('alerts')} />}
            {value.locked && <Chip label={LOCKED_LABEL[value.locked as 'locked' | 'unlocked']} onRemove={() => removeOne('locked')} />}
            {value.unlocked && <Chip label={UNLOCKED_LABEL[value.unlocked as 'unlocked' | 'never']} onRemove={() => removeOne('unlocked')} />}
            {value.net && <Chip label={NET_LABEL[value.net as 'positive' | 'zero' | 'negative']} onRemove={() => removeOne('net')} />}
            {value.revenueMin !== null && <Chip label={`Thu ≥ ${value.revenueMin.toLocaleString()}`} onRemove={() => removeOne('revenueMin')} />}
            {value.revenueMax !== null && <Chip label={`Thu ≤ ${value.revenueMax.toLocaleString()}`} onRemove={() => removeOne('revenueMax')} />}
            {value.expenseMin !== null && <Chip label={`Chi ≥ ${value.expenseMin.toLocaleString()}`} onRemove={() => removeOne('expenseMin')} />}
            {value.expenseMax !== null && <Chip label={`Chi ≤ ${value.expenseMax.toLocaleString()}`} onRemove={() => removeOne('expenseMax')} />}
          </div>
        )}
      </div>

      {open && (
        <div className="card shadow-sm space-y-3 ring-1 ring-emerald-100">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Đã khóa">
              <select value={draft.locked} onChange={(e) => update('locked', e.target.value as CashflowReportFilters['locked'])} className={INPUT_CLS}>
                <option value="">— Tất cả —</option>
                <option value="locked">Đã khóa</option>
                <option value="unlocked">Chưa khóa</option>
              </select>
            </Field>
            <Field label="Đã từng mở khóa">
              <select value={draft.unlocked} onChange={(e) => update('unlocked', e.target.value as CashflowReportFilters['unlocked'])} className={INPUT_CLS}>
                <option value="">— Tất cả —</option>
                <option value="unlocked">Đã từng mở khóa</option>
                <option value="never">Chưa từng mở khóa</option>
              </select>
            </Field>
            <Field label="Net (thu - chi)">
              <select value={draft.net} onChange={(e) => update('net', e.target.value as CashflowReportFilters['net'])} className={INPUT_CLS}>
                <option value="">— Tất cả —</option>
                <option value="positive">Net dương</option>
                <option value="zero">Net = 0</option>
                <option value="negative">Net âm</option>
              </select>
            </Field>
            <Field label="Tổng thu từ">
              <input type="number" min={0} value={draft.revenueMin ?? ''}
                onChange={(e) => update('revenueMin', e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))}
                placeholder="vd: 1000000" className={INPUT_CLS} />
            </Field>
            <Field label="Tổng thu đến">
              <input type="number" min={0} value={draft.revenueMax ?? ''}
                onChange={(e) => update('revenueMax', e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))}
                placeholder="vd: 100000000" className={INPUT_CLS} />
            </Field>
            <Field label="Tổng chi từ">
              <input type="number" min={0} value={draft.expenseMin ?? ''}
                onChange={(e) => update('expenseMin', e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))}
                placeholder="vd: 100000" className={INPUT_CLS} />
            </Field>
            <Field label="Tổng chi đến">
              <input type="number" min={0} value={draft.expenseMax ?? ''}
                onChange={(e) => update('expenseMax', e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))}
                placeholder="vd: 50000000" className={INPUT_CLS} />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => setDraft(EMPTY_CASHFLOW_REPORT_FILTERS)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium ring-1 ring-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              Đặt lại form
            </button>
            <button type="button" onClick={apply}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              <Check size={12} /> Áp dụng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-emerald-50 ring-1 ring-emerald-200 text-emerald-700 text-xs">
      {label}
      <button type="button" onClick={onRemove} className="p-0.5 rounded-full hover:bg-emerald-200 text-emerald-600" title="Bỏ filter này">
        <X size={10} />
      </button>
    </span>
  );
}
