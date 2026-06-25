// PR-TK1 (2026-06-21) — KPI card primitive. Tách từ TongKetClient.tsx.
// Dùng cho 5 KPI tháng + 4 KPI khuyến mãi (PromoSummaryCard).

import type { ReactNode } from 'react';

export type KpiTone = 'slate' | 'emerald' | 'sky' | 'amber' | 'rose' | 'violet';

// UI 10/10: card trắng trung tính; màu chỉ ở SỐ + icon theo ngữ nghĩa, không tô nền pastel.
const VALUE_CLS: Record<KpiTone, string> = {
  slate:   'text-slate-900',
  emerald: 'text-emerald-600',
  sky:     'text-slate-900',
  amber:   'text-amber-600',
  rose:    'text-rose-600',
  violet:  'text-slate-900',
};

const ICON_CLS: Record<KpiTone, string> = {
  slate:   'text-slate-400',
  emerald: 'text-emerald-500',
  sky:     'text-slate-400',
  amber:   'text-amber-500',
  rose:    'text-rose-500',
  violet:  'text-slate-400',
};

interface Props {
  label: string;
  value: string;
  icon: ReactNode;
  tone: KpiTone;
}

export default function KpiCard({ label, value, icon, tone }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={ICON_CLS[tone]}>{icon}</span>
      </div>
      <div className={`text-lg font-bold tabular-nums mt-1 ${VALUE_CLS[tone]}`}>{value}</div>
    </div>
  );
}
