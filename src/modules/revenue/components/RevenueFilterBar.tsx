'use client';

import { Calendar, RotateCcw } from 'lucide-react';
import type { CurrentUser, RevenueFilter } from '../types';
import { monthOptions, yearOptions, formatPeriod } from '../utils/revenueFormat';
import { MOCK_USERS } from '../mockData';
import { ROLE_LABEL } from '../utils/revenuePermission';

interface Props {
  filter: RevenueFilter;
  onChange: (next: RevenueFilter) => void;
  currentUser: CurrentUser;
  onChangeUser: (u: CurrentUser) => void;
}

export function RevenueFilterBar({ filter, onChange, currentUser, onChangeUser }: Props) {
  const now = new Date();
  const isCurrent = filter.year === now.getFullYear() && filter.month === (now.getMonth() + 1);

  function setMonth(m: number) { onChange({ ...filter, month: m }); }
  function setYear(y: number) { onChange({ ...filter, year: y }); }
  function resetCurrent() {
    onChange({ year: now.getFullYear(), month: now.getMonth() + 1 });
  }

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Filter tháng/năm */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-lg text-sm font-semibold">
            <Calendar size={14} /> {formatPeriod(filter.year, filter.month)}
          </div>

          <Select
            label="Tháng"
            value={filter.month}
            options={monthOptions()}
            onChange={(v) => setMonth(Number(v))}
          />
          <Select
            label="Năm"
            value={filter.year}
            options={yearOptions().map(y => ({ value: y, label: String(y) }))}
            onChange={(v) => setYear(Number(v))}
          />

          {!isCurrent && (
            <button
              onClick={resetCurrent}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700"
            >
              <RotateCcw size={12} /> Tháng hiện tại
            </button>
          )}
        </div>

        {/* User switcher mock */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Xem với vai trò:</span>
          <select
            value={currentUser.id}
            onChange={(e) => {
              const u = MOCK_USERS.find(x => x.id === e.target.value);
              if (u) onChangeUser(u);
            }}
            className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
          >
            {MOCK_USERS.map(u => (
              <option key={u.id} value={u.id}>
                {u.name} — {ROLE_LABEL[u.role]}
                {u.branchIds && u.branchIds.length > 0 ? ` [${u.branchIds.join(',')}]` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

function Select<T extends string | number>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <select
        value={value as unknown as string}
        onChange={(e) => onChange(e.target.value as unknown as T)}
        className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500"
      >
        {options.map(o => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
