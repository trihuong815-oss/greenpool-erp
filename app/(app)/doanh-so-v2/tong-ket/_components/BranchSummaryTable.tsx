// PR-TK1 (2026-06-21) — Doanh số theo cơ sở. Tách từ TongKetClient.tsx.
// CHỈ hiển thị cho top role (caller chịu trách nhiệm gate).
// PR-TK4D (2026-06-22) — Mobile card stack + desktop sticky thead.

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

      {/* PR-TK4D: Desktop ≥md table với sticky thead */}
      <div className="hidden md:block">
        <div className="overflow-auto max-h-[70vh] rounded ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold bg-slate-50 sticky top-0 z-10">
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

      {/* Mobile card stack */}
      <div className="md:hidden space-y-2">
        {topBranches.map((b) => (
          <div key={b.id} className="rounded-lg ring-1 ring-slate-200 p-3 bg-white">
            <div className="font-semibold text-slate-800 mb-2">{b.name}</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-slate-500">Số GD</div>
                <div className="font-semibold tabular-nums">{b.count}</div>
              </div>
              <div>
                <div className="text-slate-500">Doanh số</div>
                <div className="font-semibold text-emerald-700 tabular-nums">{fmtMoney(b.sales)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-slate-500">Thực thu</div>
                <div className="font-semibold text-sky-700 tabular-nums">{fmtMoney(b.collected)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
