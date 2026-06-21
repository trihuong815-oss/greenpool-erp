// PR-TK1 (2026-06-21) — Top 10 Sale theo doanh số. Tách từ TongKetClient.tsx.

import { useMemo } from 'react';
import { fmtMoney } from './utils';
import type { Summary } from './types';

interface Props {
  bySale: Summary['bySale'];
}

export default function TopSalesTable({ bySale }: Props) {
  const topSales = useMemo(
    () => Object.entries(bySale)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10),
    [bySale],
  );

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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {topSales.map((s, i) => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                <td className="px-2 py-1.5 text-slate-700 font-medium">{s.name}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{s.count}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{fmtMoney(s.sales)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-sky-700">{fmtMoney(s.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
