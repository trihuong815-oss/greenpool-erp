// PR-TK1 (2026-06-21) — KPI mini primitive. Tách từ TongKetClient.tsx.
// Dùng trong SalesCustomerDrilldown — KPI compact của Sale active.

export type KpiMiniTone = 'slate' | 'emerald' | 'sky' | 'amber' | 'rose';

const TONE_CLS: Record<KpiMiniTone, string> = {
  slate:   'bg-slate-50 text-slate-700 ring-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  sky:     'bg-sky-50 text-sky-700 ring-sky-200',
  amber:   'bg-amber-50 text-amber-700 ring-amber-200',
  rose:    'bg-rose-50 text-rose-700 ring-rose-200',
};

interface Props {
  label: string;
  value: string;
  tone: KpiMiniTone;
}

export default function KpiMini({ label, value, tone }: Props) {
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${TONE_CLS[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
