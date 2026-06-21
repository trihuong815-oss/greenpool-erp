// PR-TK1 (2026-06-21) — KPI card primitive. Tách từ TongKetClient.tsx.
// Dùng cho 5 KPI tháng + 4 KPI khuyến mãi (PromoSummaryCard).

import type { ReactNode } from 'react';

export type KpiTone = 'slate' | 'emerald' | 'sky' | 'amber' | 'rose' | 'violet';

const TONE_CLS: Record<KpiTone, string> = {
  slate:   'bg-white text-slate-700 ring-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  sky:     'bg-sky-50 text-sky-700 ring-sky-200',
  amber:   'bg-amber-50 text-amber-700 ring-amber-200',
  rose:    'bg-rose-50 text-rose-700 ring-rose-200',
  violet:  'bg-violet-50 text-violet-700 ring-violet-200',
};

interface Props {
  label: string;
  value: string;
  icon: ReactNode;
  tone: KpiTone;
}

export default function KpiCard({ label, value, icon, tone }: Props) {
  return (
    <div className={`rounded-xl px-3 py-3 ring-1 ${TONE_CLS[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
        <span className="opacity-50">{icon}</span>
      </div>
      <div className="text-lg font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
