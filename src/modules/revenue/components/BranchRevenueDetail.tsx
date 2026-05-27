'use client';

import type { ReactNode } from 'react';
import { Target, Calendar, Receipt, Users } from 'lucide-react';
import type { BranchRevenue } from '../types';
import {
  formatCurrency, formatCurrencyShort, formatPercent, formatPeriod,
  progressPercent, STATUS_LABEL, classifyStatus,
} from '../utils/revenueFormat';
import { RevenueProgressBar } from './RevenueProgressBar';

interface Props {
  data: BranchRevenue | null;
  emptyText?: string;
}

export function BranchRevenueDetail({ data, emptyText }: Props) {
  if (!data) {
    return (
      <section className="rounded-xl bg-white border border-slate-200 p-6 text-center">
        <div className="text-4xl mb-2">🏢</div>
        <p className="text-sm text-slate-500">
          {emptyText || 'Chọn 1 cơ sở ở grid bên trên để xem chi tiết.'}
        </p>
      </section>
    );
  }

  const monthPct = progressPercent(data.revenue, data.target);
  const ytdPct = progressPercent(data.ytdRevenue, data.ytdTarget);
  const status = STATUS_LABEL[classifyStatus(monthPct)];

  return (
    <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white px-5 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center font-bold">
              {data.branchCode}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">{data.branchName}</h3>
              <div className="text-xs text-emerald-100/90 flex items-center gap-1 mt-0.5">
                <Calendar size={12} /> {formatPeriod(data.year, data.month)}
              </div>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${status.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="p-5 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Doanh thu tháng" value={formatCurrencyShort(data.revenue)} sub={formatCurrency(data.revenue)} />
          <Kpi label="Mục tiêu tháng" value={formatCurrencyShort(data.target)} sub={`Đạt ${formatPercent(monthPct)}`} />
          <Kpi label="YTD Doanh thu" value={formatCurrencyShort(data.ytdRevenue)} sub={`${formatPercent(ytdPct)} mục tiêu năm`} />
          <Kpi label="YTD Mục tiêu" value={formatCurrencyShort(data.ytdTarget)} sub={`Còn ${formatCurrencyShort(Math.max(0, data.ytdTarget - data.ytdRevenue))}`} />
        </div>

        {/* Progress */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Target size={13} className="text-emerald-700" />
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Tiến độ tháng</div>
            </div>
            <RevenueProgressBar percent={monthPct} size="lg" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Calendar size={13} className="text-emerald-700" />
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Tiến độ năm (YTD)</div>
            </div>
            <RevenueProgressBar percent={ytdPct} size="lg" />
          </div>
        </div>

        {/* Top packages */}
        {data.topPackages && data.topPackages.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Receipt size={13} className="text-emerald-700" />
              <h4 className="font-semibold text-slate-800 text-sm">Top gói bán chạy</h4>
            </div>
            <div className="space-y-2">
              {data.topPackages.map(p => {
                const portion = data.revenue > 0 ? (p.revenue / data.revenue) * 100 : 0;
                return (
                  <div key={p.packageId} className="rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-800">{p.packageName}</span>
                      <span className="font-semibold text-emerald-700">{formatCurrencyShort(p.revenue)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                      <span>{p.count} đơn</span>
                      <span>{formatPercent(portion)} tổng cơ sở</span>
                    </div>
                    <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500"
                        style={{ width: `${Math.min(portion, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Meta */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
          <Meta icon={<Users size={14} />} label="Sale hoạt động" value={data.sales.toString()} />
          <Meta icon={<Receipt size={14} />} label="Deals tháng"   value={data.deals.toString()} />
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-0.5">{value}</div>
      {sub && <div className="text-[11px] mt-0.5 text-slate-500">{sub}</div>}
    </div>
  );
}

function Meta({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="font-bold text-slate-800">{value}</div>
      </div>
    </div>
  );
}
