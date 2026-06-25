'use client';

// PR-CASH1D: KPI top cards — chỉ hiển thị cho role nhìn nhiều cơ sở (THU_QUY/top).

import { FileText, Wallet, Receipt, TrendingDown, AlertTriangle } from 'lucide-react';
import type { DailyCashflowReportDoc } from '@/lib/finance/cashflow-report-types';

interface Props {
  reports: Array<DailyCashflowReportDoc & { id: string }>;
}

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

export function CashflowReportSummaryCards({ reports }: Props) {
  const totals = reports.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.revenue += r.revenueSource?.total ?? 0;
      acc.expense += r.expense?.totalByMethod?.total ?? 0;
      acc.net += r.net?.total ?? 0;
      if (Array.isArray(r.alerts) && r.alerts.length > 0) acc.alerted += 1;
      return acc;
    },
    { count: 0, revenue: 0, expense: 0, net: 0, alerted: 0 },
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Stat icon={<FileText size={16} />} label="Báo cáo" value={String(totals.count)} tone="slate" />
      <Stat icon={<Wallet size={16} />} label="Tổng thu" value={`${fmt(totals.revenue)} ₫`} tone="emerald" />
      <Stat icon={<Receipt size={16} />} label="Tổng chi" value={`${fmt(totals.expense)} ₫`} tone="rose" />
      <Stat icon={<TrendingDown size={16} />} label="Net" value={`${fmt(totals.net)} ₫`} tone={totals.net < 0 ? 'rose' : 'emerald'} />
      <Stat icon={<AlertTriangle size={16} />} label="Có cảnh báo" value={String(totals.alerted)} tone={totals.alerted > 0 ? 'amber' : 'slate'} />
    </div>
  );
}

// UI 10/10: card trắng, màu chỉ ở số theo ngữ nghĩa (thu=xanh, chi=đỏ, cảnh báo=vàng).
const VALUE_CLS: Record<string, string> = {
  slate:    'text-slate-900',
  emerald:  'text-emerald-600',
  rose:     'text-rose-600',
  amber:    'text-amber-600',
};

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: keyof typeof VALUE_CLS }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</div>
      <div className={`text-lg font-bold tabular-nums ${VALUE_CLS[tone]}`}>{value}</div>
    </div>
  );
}
