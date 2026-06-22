'use client';

// PR-7A — Filter bar cho /audit-history.
// Server-side: month / branchId
// Client-side: action / module / changedBy / dateFrom-To (filter trên page hiện tại)

import { RotateCcw } from 'lucide-react';
import { BRANCHES, type BranchId } from '@/lib/branches';

export interface AuditFiltersState {
  month: string;                   // 'YYYY-MM' hoặc 'all'
  branchId: BranchId | 'all';
  action: string;                  // substring search (client-side)
  module: 'all' | 'batch' | 'transaction' | 'program';
  changedBy: string;               // substring search trên name/uid (client-side)
  dateFrom: string;                // 'YYYY-MM-DD' (client-side)
  dateTo: string;                  // 'YYYY-MM-DD' (client-side)
}

interface Props {
  state: AuditFiltersState;
  onChange: (next: AuditFiltersState) => void;
  onReset: () => void;
}

export default function AuditFilters({ state, onChange, onReset }: Props) {
  const update = <K extends keyof AuditFiltersState>(key: K, value: AuditFiltersState[K]) =>
    onChange({ ...state, [key]: value });

  return (
    <div className="card">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Server-side filters */}
        <Field label="Tháng" hint="server-side">
          <input
            type="month"
            value={state.month === 'all' ? '' : state.month}
            onChange={(e) => update('month', e.target.value || 'all')}
            className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-200 focus:border-emerald-500 outline-none"
          />
        </Field>

        <Field label="Cơ sở" hint="server-side">
          <select
            value={state.branchId}
            onChange={(e) => update('branchId', e.target.value as BranchId | 'all')}
            className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-200 focus:border-emerald-500 outline-none"
          >
            <option value="all">Tất cả cơ sở</option>
            {BRANCHES.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>

        {/* Client-side filters */}
        <Field label="Module" hint="client-side">
          <select
            value={state.module}
            onChange={(e) => update('module', e.target.value as AuditFiltersState['module'])}
            className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-200 focus:border-emerald-500 outline-none"
          >
            <option value="all">Tất cả</option>
            <option value="batch">Batch</option>
            <option value="transaction">Giao dịch</option>
            <option value="program">CT khuyến mãi</option>
          </select>
        </Field>

        <Field label="Action chứa" hint="client-side">
          <input
            type="text"
            value={state.action}
            onChange={(e) => update('action', e.target.value)}
            placeholder="vd: create_tx, lock_month"
            className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-200 focus:border-emerald-500 outline-none"
          />
        </Field>

        <Field label="Người thao tác" hint="client-side">
          <input
            type="text"
            value={state.changedBy}
            onChange={(e) => update('changedBy', e.target.value)}
            placeholder="Tên hoặc uid"
            className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-200 focus:border-emerald-500 outline-none"
          />
        </Field>

        <Field label="Từ ngày" hint="client-side">
          <input
            type="date"
            value={state.dateFrom}
            onChange={(e) => update('dateFrom', e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-200 focus:border-emerald-500 outline-none"
          />
        </Field>

        <Field label="Đến ngày" hint="client-side">
          <input
            type="date"
            value={state.dateTo}
            onChange={(e) => update('dateTo', e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-200 focus:border-emerald-500 outline-none"
          />
        </Field>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            <RotateCcw size={14} />
            Reset filter
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
        {label}
        {hint && <span className="text-xs text-slate-400 font-normal">({hint})</span>}
      </div>
      {children}
    </div>
  );
}
