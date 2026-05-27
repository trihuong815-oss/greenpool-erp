'use client';

import type { ReactNode } from 'react';
import { Building2, TrendingUp, TrendingDown, Target, Users } from 'lucide-react';
import type { SystemRevenue } from '../types';
import {
  formatCurrency, formatCurrencyShort, formatPercent,
  progressPercent, formatPeriod,
} from '../utils/revenueFormat';
import { RevenueProgressBar } from './RevenueProgressBar';

interface Props {
  data: SystemRevenue;
}

export function SystemRevenueCard({ data }: Props) {
  const monthPct = progressPercent(data.revenue, data.target);
  const ytdPct = progressPercent(data.ytdRevenue, data.ytdTarget);
  const momPositive = data.monthOverMonthPct >= 0;

  return (
    <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-700 via-emerald-700 to-teal-700 text-white shadow-md">
      {/* subtle décor */}
      <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-3xl" aria-hidden />

      <div className="relative p-5 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center">
              <Building2 size={20} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-emerald-100/90">Tổng hệ thống</div>
              <div className="font-bold text-base">{formatPeriod(data.year, data.month)}</div>
            </div>
          </div>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            momPositive ? 'bg-emerald-300/25 text-emerald-50' : 'bg-rose-300/25 text-rose-50'
          }`}>
            {momPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {momPositive ? '+' : ''}{formatPercent(data.monthOverMonthPct)} vs tháng trước
          </div>
        </div>

        {/* Big number */}
        <div className="mb-5">
          <div className="text-[11px] uppercase tracking-wider text-emerald-100/80 mb-1">Doanh thu tháng</div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="text-4xl md:text-5xl font-extrabold tracking-tight">
              {formatCurrencyShort(data.revenue)}
            </div>
            <div className="text-sm text-emerald-100/90">
              / {formatCurrencyShort(data.target)} mục tiêu
            </div>
          </div>
          <div className="mt-1 text-xs text-emerald-100/80">{formatCurrency(data.revenue)}</div>
        </div>

        {/* Progress 2 dòng */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5 text-emerald-100/90">
              <span>Tiến độ tháng</span>
              <span className="font-semibold text-white">{formatPercent(monthPct)}</span>
            </div>
            <RevenueProgressBar percent={monthPct} size="md" showLabel={false} onDark colorClass="bg-white" />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5 text-emerald-100/90">
              <span>Lũy kế năm (YTD)</span>
              <span className="font-semibold text-white">{formatPercent(ytdPct)}</span>
            </div>
            <RevenueProgressBar percent={ytdPct} size="md" showLabel={false} onDark colorClass="bg-amber-300" />
            <div className="mt-1 text-[11px] text-emerald-100/80">
              {formatCurrencyShort(data.ytdRevenue)} / {formatCurrencyShort(data.ytdTarget)}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <Stat icon={<Building2 size={13} />} label="Cơ sở" value={data.branchesCount.toString()} />
          <Stat icon={<Users size={13} />} label="Sale hoạt động" value={data.salesCount.toString()} />
          <Stat icon={<Target size={13} />} label="Deals chốt" value={data.deals.toString()} />
          <Stat icon={<TrendingUp size={13} />} label="Mục tiêu" value={formatCurrencyShort(data.target)} />
        </div>
      </div>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-100/90">
        {icon} {label}
      </div>
      <div className="font-bold text-base mt-0.5">{value}</div>
    </div>
  );
}
