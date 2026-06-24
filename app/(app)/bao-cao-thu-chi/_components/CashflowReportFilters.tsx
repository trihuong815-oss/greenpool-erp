'use client';

// PR-CASH1D: Filter bar — date + branch + status chip + has-alert toggle.
// PR-CASH-DATE-RANGE-UX (2026-06-24): date input → DateRangeBar (preset + from/to).
//
// Layout chuẩn theo ảnh tham chiếu: card riêng, hàng 1 = time range + branch,
// hàng 2 = status chips + alerts toggle.

import { Filter, AlertTriangle } from 'lucide-react';
import type { BranchId } from '@/lib/branches';
import { BRANCHES, isBranchId } from '@/lib/branches';
import { DAILY_CASHFLOW_REPORT_STATUS_LABEL, type DailyCashflowReportStatus } from '@/lib/finance/cashflow-report-types';
import { DateRangeBar } from '@/components/finance/DateRangeBar';
import type { DateRange } from '@/lib/finance/date-presets';

export type StatusFilter = 'all' | DailyCashflowReportStatus;

interface Props {
  range: DateRange;
  branchId: BranchId | 'all';
  statusFilter: StatusFilter;
  alertsOnly: boolean;
  canSelectBranch: boolean;
  myBranchLabel: string;
  onRange: (r: DateRange) => void;
  onBranch: (v: BranchId | 'all') => void;
  onStatus: (v: StatusFilter) => void;
  onAlertsOnly: (v: boolean) => void;
}

const STATUS_OPTIONS: StatusFilter[] = ['all', 'submitted', 'sent', 'checked', 'returned', 'locked'];
const STATUS_CHIP: Record<StatusFilter, string> = {
  all:       'data-[active=true]:bg-slate-200 data-[active=true]:text-slate-800 data-[active=true]:ring-slate-300',
  draft:     'data-[active=true]:bg-slate-100 data-[active=true]:text-slate-700 data-[active=true]:ring-slate-300',
  submitted: 'data-[active=true]:bg-amber-50 data-[active=true]:text-amber-700 data-[active=true]:ring-amber-300',
  sent:      'data-[active=true]:bg-sky-50 data-[active=true]:text-sky-700 data-[active=true]:ring-sky-300',
  checked:   'data-[active=true]:bg-emerald-50 data-[active=true]:text-emerald-700 data-[active=true]:ring-emerald-300',
  returned:  'data-[active=true]:bg-rose-50 data-[active=true]:text-rose-700 data-[active=true]:ring-rose-300',
  locked:    'data-[active=true]:bg-violet-50 data-[active=true]:text-violet-700 data-[active=true]:ring-violet-300',
};

export function CashflowReportFilters({ range, branchId, statusFilter, alertsOnly, canSelectBranch, myBranchLabel, onRange, onBranch, onStatus, onAlertsOnly }: Props) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-800 pb-2 border-b border-slate-100">
        <Filter size={14} className="text-emerald-600" /> Bộ lọc
      </div>

      {/* Hàng 1: time range + branch */}
      <div className="flex flex-wrap items-end gap-2">
        <DateRangeBar value={range} onChange={(r) => onRange(r)} />
        <div className="flex flex-col">
          <label className="text-xs font-medium text-slate-600 mb-1">Cơ sở</label>
          {canSelectBranch ? (
            <select
              value={branchId}
              onChange={(e) => { const v = e.target.value; if (v === 'all' || isBranchId(v)) onBranch(v as BranchId | 'all'); }}
              className="h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors min-w-[12rem]"
            >
              <option value="all">Tất cả cơ sở</option>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
            </select>
          ) : (
            <div className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 bg-slate-50 inline-flex items-center min-w-[12rem] font-medium text-slate-700">
              {myBranchLabel}
            </div>
          )}
        </div>
      </div>

      {/* Hàng 2: status chips + alerts toggle */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
        <span className="text-xs font-medium text-slate-600">Trạng thái:</span>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              data-active={statusFilter === s}
              onClick={() => onStatus(s)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 transition ${STATUS_CHIP[s]}`}
            >
              {s === 'all' ? 'Tất cả' : DAILY_CASHFLOW_REPORT_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onAlertsOnly(!alertsOnly)}
          className={`inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium rounded-full ring-1 transition ${alertsOnly ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}
        >
          <AlertTriangle size={11} /> Chỉ cảnh báo
        </button>
      </div>
    </div>
  );
}
