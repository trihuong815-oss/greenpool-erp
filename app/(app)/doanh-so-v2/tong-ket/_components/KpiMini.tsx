// PR-TK1 (2026-06-21) — KPI mini primitive. Tách từ TongKetClient.tsx.
// Dùng trong SalesCustomerDrilldown — KPI compact của Sale active.

export type KpiMiniTone = 'slate' | 'emerald' | 'sky' | 'amber' | 'rose';

// UI 10/10: card trắng, màu chỉ ở số theo ngữ nghĩa.
const VALUE_CLS: Record<KpiMiniTone, string> = {
  slate:   'text-slate-900',
  emerald: 'text-emerald-600',
  sky:     'text-slate-900',
  amber:   'text-amber-600',
  rose:    'text-rose-600',
};

interface Props {
  label: string;
  value: string;
  tone: KpiMiniTone;
}

export default function KpiMini({ label, value, tone }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-sm font-bold tabular-nums mt-0.5 ${VALUE_CLS[tone]}`}>{value}</div>
    </div>
  );
}
