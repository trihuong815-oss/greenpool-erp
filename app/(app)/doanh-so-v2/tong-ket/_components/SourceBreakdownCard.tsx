// PR-TK1 (2026-06-21) — Doanh số theo nguồn (5 source). Tách từ TongKetClient.tsx.

import { useMemo } from 'react';
import { SOURCE_LABEL, type SalesV2Source } from '@/lib/types/sales-v2';
import { fmtMoney } from './utils';
import type { Summary } from './types';

interface Props {
  bySource: Summary['bySource'];
}

export default function SourceBreakdownCard({ bySource }: Props) {
  const sourceMaxSales = useMemo(
    () => Math.max(...Object.values(bySource).map((s) => s.sales), 1),
    [bySource],
  );

  return (
    <div className="card">
      <h3 className="text-sm font-bold text-slate-800 mb-3">Doanh số theo nguồn</h3>
      <div className="space-y-2">
        {(Object.keys(bySource) as SalesV2Source[]).map((src) => {
          const b = bySource[src];
          const pct = Math.round((b.sales / sourceMaxSales) * 100);
          return (
            <div key={src}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-slate-700">{SOURCE_LABEL[src]}</span>
                <span className="text-slate-600 tabular-nums">
                  {b.count} GD · <strong>{fmtMoney(b.sales)}</strong>
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
