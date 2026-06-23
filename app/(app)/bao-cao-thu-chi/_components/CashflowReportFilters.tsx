'use client';

// PR-CASH1D: Filter bar — date + branch + status chip + has-alert toggle.

import { Filter, AlertTriangle } from 'lucide-react';
import type { BranchId } from '@/lib/branches';
import { BRANCHES, isBranchId } from '@/lib/branches';
import { DAILY_CASHFLOW_REPORT_STATUS_LABEL, type DailyCashflowReportStatus } from '@/lib/finance/cashflow-report-types';

export type StatusFilter = 'all' | DailyCashflowReportStatus;

interface Props {
  date: string;
  branchId: BranchId | 'all';
  statusFilter: StatusFilter;
  alertsOnly: boolean;
  canSelectBranch: boolean;
  myBranchLabel: string;
  onDate: (v: string) => void;
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

export function CashflowReportFilters({ date, branchId, statusFilter, alertsOnly, canSelectBranch, myBranchLabel, onDate, onBranch, onStatus, onAlertsOnly }: Props) {
  return (
    <div className="card">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter size={14} /> Bộ lọc
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Ngày</label>
          <input type="date" value={date} onChange={(e) => onDate(e.target.value)} className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 focus:outline-none" />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Cơ sở</label>
          {canSelectBranch ? (
            <select
              value={branchId}
              onChange={(e) => { const v = e.target.value; if (v === 'all' || isBranchId(v)) onBranch(v as BranchId | 'all'); }}
              className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 focus:outline-none min-w-[12rem]"
            >
              <option value="all">Tất cả cơ sở</option>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
            </select>
          ) : (
            <div className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 bg-slate-50 inline-flex items-center min-w-[12rem]">
              {myBranchLabel}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-[14rem]">
          <label className="block text-xs text-slate-500 mb-0.5">Trạng thái</label>
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
        </div>

        <div>
          <button
            type="button"
            onClick={() => onAlertsOnly(!alertsOnly)}
            className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-lg ring-1 transition ${alertsOnly ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}
          >
            <AlertTriangle size={12} /> Chỉ cảnh báo
          </button>
        </div>
      </div>
    </div>
  );
}
