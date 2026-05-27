'use client';

import type { ReactNode } from 'react';
import { ChevronRight, Users, Receipt } from 'lucide-react';
import type { BranchRevenue } from '../types';
import {
  formatCurrencyShort, progressPercent,
  STATUS_LABEL, classifyStatus,
} from '../utils/revenueFormat';
import { RevenueProgressBar } from './RevenueProgressBar';

interface Props {
  data: BranchRevenue;
  selected?: boolean;
  onSelect?: (branchId: string) => void;
}

export function BranchRevenueCard({ data, selected, onSelect }: Props) {
  const pct = progressPercent(data.revenue, data.target);
  const status = STATUS_LABEL[classifyStatus(pct)];

  return (
    <button
      type="button"
      onClick={() => onSelect?.(data.branchId)}
      className={`w-full text-left rounded-xl bg-white p-4 transition group ${
        selected
          ? 'border-2 border-emerald-500 shadow-md ring-1 ring-emerald-200'
          : 'border border-slate-200 hover:border-emerald-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
            {data.branchCode}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 truncate">{data.branchName}</div>
            <div className="text-xs text-slate-500">Tháng {data.month}/{data.year}</div>
          </div>
        </div>
        <ChevronRight size={18} className="text-slate-300 group-hover:text-emerald-600 mt-0.5 flex-shrink-0" />
      </div>

      {/* Numbers */}
      <div className="mb-3">
        <div className="flex items-baseline gap-1.5">
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {formatCurrencyShort(data.revenue)}
          </div>
          <div className="text-xs text-slate-500">/ {formatCurrencyShort(data.target)}</div>
        </div>
        <div className={`inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
        </div>
      </div>

      <RevenueProgressBar percent={pct} size="md" showLabel />

      {/* Bottom stats */}
      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
        <Stat icon={<Users size={12} />} label="Sale" value={data.sales.toString()} />
        <Stat icon={<Receipt size={12} />} label="Deals" value={data.deals.toString()} />
      </div>
    </button>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        {icon} {label}
      </div>
      <div className="font-bold text-slate-800 text-sm">{value}</div>
    </div>
  );
}
