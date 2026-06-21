// PR-TK1 (2026-06-21) — Top 5 gói doanh số cao. Tách từ TongKetClient.tsx.

import { useMemo } from 'react';
import { fmtMoney } from './utils';
import type { Summary } from './types';

interface Props {
  byPackage: Summary['byPackage'];
}

export default function TopPackagesCard({ byPackage }: Props) {
  const topPackages = useMemo(
    () => Object.entries(byPackage)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5),
    [byPackage],
  );

  return (
    <div className="card">
      <h3 className="text-sm font-bold text-slate-800 mb-3">Top 5 gói doanh số cao</h3>
      {topPackages.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-sm">Chưa có dữ liệu</div>
      ) : (
        <div className="space-y-2">
          {topPackages.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center tabular-nums">{i + 1}</span>
              <span className="flex-1 truncate text-slate-700 flex items-center gap-1.5">
                <span className="truncate">{p.name}</span>
                {p.isCustomQuantity && (
                  <span
                    className="shrink-0 text-[9px] uppercase font-bold text-violet-700 bg-violet-100 px-1 py-0.5 rounded ring-1 ring-violet-200"
                    title={`Gói PT — tính theo ${p.unitName || 'buổi'}`}
                  >
                    PT
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-slate-500 tabular-nums">{p.count} GD</span>
              <span className="shrink-0 font-semibold text-emerald-700 tabular-nums">{fmtMoney(p.sales)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
