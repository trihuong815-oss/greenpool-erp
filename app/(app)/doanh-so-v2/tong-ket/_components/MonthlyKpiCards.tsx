// PR-TK1 (2026-06-21) — 5 KPI cards tháng. Tách từ TongKetClient.tsx.
// CHỈ refactor — không đổi label/tone/icon/value formula.

import { TrendingUp, Wallet, AlertTriangle, Users } from 'lucide-react';
import KpiCard from './KpiCard';
import { fmtMoney } from './utils';
import type { Summary } from './types';

interface Props {
  totals: Summary['totals'];
}

export default function MonthlyKpiCards({ totals }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <KpiCard label="Số giao dịch" value={totals.transactions.toString()} icon={<Users size={18} />} tone="slate" />
      <KpiCard label="Doanh số" value={fmtMoney(totals.sales)} icon={<TrendingUp size={18} />} tone="emerald" />
      <KpiCard label="Thực thu" value={fmtMoney(totals.collected)} icon={<Wallet size={18} />} tone="sky" />
      <KpiCard label="Công nợ phát sinh" value={fmtMoney(totals.debtGenerated)} icon={<AlertTriangle size={18} />} tone="amber" />
      <KpiCard label="Công nợ còn lại" value={fmtMoney(totals.debtRemaining)} icon={<AlertTriangle size={18} />} tone="rose" />
    </div>
  );
}
