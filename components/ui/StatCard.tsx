// components/ui/StatCard.tsx
// PR-UI-PIXEL-MATCH B1 (2026-06-26): port từ code-10diem.
// Pixel-spec từ green-pool-prototype-sau-toi-uu.html .stat:
//  - card: rounded-xl border-slate-200 bg-white p-4 (~14-16px)
//  - top row: label uppercase 11px font-semibold gray-500 + icon 28x28 rounded-sm
//  - value: font-mono text-2xl (22px) font-semibold tabular-nums
//  - sub line: 11px gray-400
//  - tone: default/success/danger/warning/info → value màu + icon nền pastel nhẹ
//
// Đây là chuẩn duy nhất cho KPI — thay 5+ KpiCard inline khác nhau.

import type { ReactNode } from 'react';

export type StatCardTone = 'default' | 'success' | 'danger' | 'warning' | 'info';

const VAL_TONE: Record<StatCardTone, string> = {
  default: 'text-slate-900',
  success: 'text-emerald-600',
  danger:  'text-rose-600',
  warning: 'text-amber-600',
  info:    'text-sky-600',
};

const ICON_TONE: Record<StatCardTone, string> = {
  default: 'bg-slate-100 text-slate-500',
  success: 'bg-emerald-50 text-emerald-600',
  danger:  'bg-rose-50 text-rose-600',
  warning: 'bg-amber-50 text-amber-600',
  info:    'bg-sky-50 text-sky-600',
};

type Props = {
  /** Label uppercase 11px gray-500. */
  label: string;
  /** Value — number/string. Auto font-mono tabular-nums text-2xl. */
  value: ReactNode;
  /** Icon góc phải — emoji string hoặc lucide component. */
  icon?: ReactNode;
  /** Tone semantic — default neutral / success / danger / warning / info. */
  tone?: StatCardTone;
  /** Sub line nhỏ dưới value (vd "liên quan đến tôi", "toàn hệ thống"). */
  sub?: string;
  /** Delta so kỳ trước (vd { value: "+12%", up: true }). */
  delta?: { value: string; up?: boolean };
};

export function StatCard({ label, value, icon, tone = 'default', sub, delta }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {icon && (
          <span className={`grid h-7 w-7 place-items-center rounded-md text-sm ${ICON_TONE[tone]}`}>{icon}</span>
        )}
      </div>
      {/* PR-UI-TYPOGRAPHY-DENSITY-BALANCE (2026-06-26): text-2xl (24px) → text-[22px]
          + leading-tight để value cân với card p-4 (KPI tiền "73 tr"/"57,5 tr" bớt phình ô,
          vẫn nổi bật). Áp dụng toàn app qua mọi callsite StatCard. */}
      <div className={`font-mono text-[22px] font-semibold leading-tight tabular-nums ${VAL_TONE[tone]}`}>{value}</div>
      {(sub || delta) && (
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          {delta && (
            <span className={delta.up ? 'text-emerald-600' : 'text-rose-600'}>
              {delta.up ? '▴' : '▾'} {delta.value}
            </span>
          )}
          {sub && <span className="text-slate-400">{sub}</span>}
        </div>
      )}
    </div>
  );
}

/** Dải gộp nhiều trạng thái — thay 7 thẻ ở màn Đề xuất.
 *  Pixel-spec từ HTML .segsum: border slate-200 rounded-xl, mỗi seg flex-1
 *  border-r giữa, value font-mono 20px, label 11px uppercase 0.3px.
 *
 *  PR-DISPATCH-RESTRUCTURE (2026-06-27): hỗ trợ optional onClick per item +
 *  active state. Cell có onClick → render button focusable + hover highlight.
 *  Cell không onClick → render div (backward compat 7-cell /de-xuat). */
export function SegmentSummary({
  items,
}: {
  items: {
    n: ReactNode;
    label: string;
    tone?: StatCardTone;
    onClick?: () => void;
    active?: boolean;
    title?: string;
  }[];
}) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* PR-UI-TYPOGRAPHY-DENSITY-BALANCE (2026-06-26): text-xl (20px) → text-[19px]
          + leading-tight, padding py-3 → py-2.5. Dải gộp 7 trạng thái /de-xuat đỡ cao,
          số nhỏ hơn nhưng vẫn dễ đọc. */}
      {items.map((it, i) => {
        const valueClass = `font-mono text-[19px] font-semibold leading-tight tabular-nums ${VAL_TONE[it.tone ?? 'default']}`;
        const labelClass = 'mt-1 text-[11px] uppercase tracking-wide text-slate-500';
        const base = 'flex-1 border-r border-slate-200 px-3 py-2.5 text-center last:border-r-0';
        if (it.onClick) {
          return (
            <button
              key={i}
              type="button"
              onClick={it.onClick}
              title={it.title}
              className={`${base} transition-colors ${
                it.active ? 'bg-emerald-50' : 'hover:bg-slate-50'
              }`}
            >
              <div className={valueClass}>{it.n}</div>
              <div className={labelClass}>{it.label}</div>
            </button>
          );
        }
        return (
          <div key={i} className={base}>
            <div className={valueClass}>{it.n}</div>
            <div className={labelClass}>{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}
