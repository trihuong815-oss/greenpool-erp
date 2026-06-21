// PR-TK1 (2026-06-21) — Top 10 Sale theo doanh số. Tách từ TongKetClient.tsx.
// PR-TK3A (2026-06-21) — Thêm 3 cột target (Chỉ tiêu / % hoàn thành / Còn thiếu) khi có dữ liệu.

import { useMemo } from 'react';
import { fmtMoney } from './utils';
import type { Summary } from './types';

interface Props {
  bySale: Summary['bySale'];
  /** PR-TK3A: map saleId → target VND tháng. Empty/undefined → KHÔNG hiện cột target. */
  saleTargetsThisMonth?: Record<string, number>;
}

function statusCls(pct: number, daysPct: number): string {
  if (pct >= 100) return 'text-emerald-700 font-semibold';
  if (pct >= daysPct) return 'text-sky-700';
  if (pct - daysPct >= -10) return 'text-amber-700';
  return 'text-rose-700 font-semibold';
}

export default function TopSalesTable({ bySale, saleTargetsThisMonth }: Props) {
  const topSales = useMemo(
    () => Object.entries(bySale)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10),
    [bySale],
  );

  // Có >=1 sale trong top có target → show cột Chỉ tiêu
  const hasAnyTarget = useMemo(() => {
    if (!saleTargetsThisMonth) return false;
    return topSales.some((s) => (saleTargetsThisMonth[s.id] ?? 0) > 0);
  }, [topSales, saleTargetsThisMonth]);

  if (topSales.length === 0) return null;

  return (
    <div className="card">
      <h3 className="text-sm font-bold text-slate-800 mb-3">Top Sale theo doanh số</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            <tr>
              <th className="px-2 py-2 text-left w-10">#</th>
              <th className="px-2 py-2 text-left">Tên Sale</th>
              <th className="px-2 py-2 text-right">Số GD</th>
              <th className="px-2 py-2 text-right">Doanh số</th>
              <th className="px-2 py-2 text-right">Thực thu</th>
              {hasAnyTarget && (
                <>
                  <th className="px-2 py-2 text-right">Chỉ tiêu</th>
                  <th className="px-2 py-2 text-right">% hoàn thành</th>
                  <th className="px-2 py-2 text-right">Còn thiếu</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {topSales.map((s, i) => {
              const target = saleTargetsThisMonth?.[s.id] ?? 0;
              const hasTarget = target > 0;
              const pct = hasTarget ? (s.sales / target) * 100 : 0;
              const remaining = hasTarget ? Math.max(target - s.sales, 0) : 0;
              return (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                  <td className="px-2 py-1.5 text-slate-700 font-medium">{s.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{s.count}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{fmtMoney(s.sales)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-sky-700">{fmtMoney(s.collected)}</td>
                  {hasAnyTarget && (
                    <>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                        {hasTarget ? fmtMoney(target) : <span className="text-slate-300 text-xs italic">—</span>}
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${hasTarget ? statusCls(pct, 50) : 'text-slate-300'}`}>
                        {hasTarget ? `${pct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">
                        {hasTarget ? fmtMoney(remaining) : <span className="text-slate-300 text-xs italic">—</span>}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
