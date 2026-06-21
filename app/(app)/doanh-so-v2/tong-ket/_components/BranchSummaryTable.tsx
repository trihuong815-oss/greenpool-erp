// PR-TK1 (2026-06-21) — Doanh số theo cơ sở. Tách từ TongKetClient.tsx.
// CHỈ hiển thị cho top role (caller chịu trách nhiệm gate).

import { useMemo } from 'react';
import { fmtMoney } from './utils';
import type { Summary } from './types';

interface Props {
  byBranch: Summary['byBranch'];
}

export default function BranchSummaryTable({ byBranch }: Props) {
  const topBranches = useMemo(
    () => Object.entries(byBranch)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.sales - a.sales),
    [byBranch],
  );

  if (topBranches.length === 0) return null;

  return (
    <div className="card">
      <h3 className="text-sm font-bold text-slate-800 mb-3">Doanh số theo cơ sở</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            <tr>
              <th className="px-2 py-2 text-left">Cơ sở</th>
              <th className="px-2 py-2 text-right">Số GD</th>
              <th className="px-2 py-2 text-right">Doanh số</th>
              <th className="px-2 py-2 text-right">Thực thu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {topBranches.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50/60">
                <td className="px-2 py-1.5 text-slate-700 font-medium">{b.name}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{b.count}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{fmtMoney(b.sales)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-sky-700">{fmtMoney(b.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
