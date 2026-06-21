// PR-TK1 (2026-06-21) — 5 KPI cards tháng. Tách từ TongKetClient.tsx.
// PR-TK2 (2026-06-21) — Thêm KPI "Số khách" + "Chờ đối chiếu". Layout responsive 2→7 cols.

import { TrendingUp, Wallet, AlertTriangle, Users, UserCheck, Clock } from 'lucide-react';
import KpiCard from './KpiCard';
import { fmtMoney } from './utils';
import type { Summary } from './types';

interface Props {
  totals: Summary['totals'];
  /** PR-TK2: số khách distinct trong scope. Undefined → KHÔNG render card này (backward compat). */
  customerCount?: number;
  /** PR-TK2: tổng (tx pending + batch pending) = "Chờ đối chiếu". Undefined hoặc 0 → KHÔNG render. */
  pendingReviewCount?: number;
}

export default function MonthlyKpiCards({ totals, customerCount, pendingReviewCount }: Props) {
  const hasCustomer = typeof customerCount === 'number';
  const hasPending = typeof pendingReviewCount === 'number' && pendingReviewCount > 0;

  // Layout: 2 cols mobile, 4/5/6/7 cols desktop tùy số card
  // Base 5 + optional 2 = 5/6/7 cards → grid-cols md:5 → md:6 → md:7 (responsive auto-fit)
  const totalCards = 5 + (hasCustomer ? 1 : 0) + (hasPending ? 1 : 0);
  const mdCols = totalCards === 5 ? 'md:grid-cols-5'
    : totalCards === 6 ? 'md:grid-cols-6'
    : 'md:grid-cols-7';

  return (
    <div className={`grid grid-cols-2 ${mdCols} gap-3`}>
      <KpiCard label="Số giao dịch" value={totals.transactions.toString()} icon={<Users size={18} />} tone="slate" />
      {hasCustomer && (
        <KpiCard label="Số khách" value={customerCount.toString()} icon={<UserCheck size={18} />} tone="slate" />
      )}
      <KpiCard label="Doanh số" value={fmtMoney(totals.sales)} icon={<TrendingUp size={18} />} tone="emerald" />
      <KpiCard label="Thực thu" value={fmtMoney(totals.collected)} icon={<Wallet size={18} />} tone="sky" />
      <KpiCard label="Công nợ phát sinh" value={fmtMoney(totals.debtGenerated)} icon={<AlertTriangle size={18} />} tone="amber" />
      <KpiCard label="Công nợ còn lại" value={fmtMoney(totals.debtRemaining)} icon={<AlertTriangle size={18} />} tone="rose" />
      {hasPending && (
        <KpiCard label="Chờ đối chiếu" value={pendingReviewCount.toString()} icon={<Clock size={18} />} tone="amber" />
      )}
    </div>
  );
}
