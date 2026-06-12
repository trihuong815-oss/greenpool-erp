'use client';

import { useMemo } from 'react';
import type { CoordTask } from './types';

interface Props { tasks: CoordTask[] }

function initialsOf(name: string): string {
  return name.split(' ').slice(-2).map((s) => s[0] ?? '').join('').toUpperCase().slice(0, 2);
}
function stuckDays(t: CoordTask): number {
  if (!t.waitingSince) return 0;
  const since = new Date(t.waitingSince).getTime();
  if (!Number.isFinite(since)) return 0;
  return Math.max(0, (Date.now() - since) / 86_400_000);
}

export default function BottleneckTable({ tasks }: Props) {
  const rows = useMemo(() => {
    const stuckTasks = tasks.filter((t) =>
      t.waitingForPerson && ['cho_phan_hoi', 'cho_phe_duyet', 'dang_phoi_hop'].includes(t.status));
    const groups = new Map<string, { holding: number; maxDays: number; sample: CoordTask }>();
    for (const t of stuckTasks) {
      const key = t.waitingForPerson;
      const days = stuckDays(t);
      const cur = groups.get(key);
      if (!cur) {
        groups.set(key, { holding: 1, maxDays: days, sample: t });
      } else {
        cur.holding += 1;
        if (days > cur.maxDays) { cur.maxDays = days; cur.sample = t; }
      }
    }
    return Array.from(groups.entries())
      .map(([name, g]) => ({ name, ...g }))
      .sort((a, b) => b.holding - a.holding || b.maxDays - a.maxDays)
      .slice(0, 5);
  }, [tasks]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-rose-50/60 px-4 py-2.5 border-b border-rose-100 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Điểm nghẽn hiện tại</h3>
        <button type="button" className="text-xs text-emerald-600 hover:underline">Xem tất cả</button>
      </div>

      <div className="grid grid-cols-[minmax(140px,1.2fr)_70px_90px_1.5fr] gap-3 px-4 py-2 border-b border-slate-200 text-[10px] uppercase text-slate-400 tracking-wider">
        <div>Người / Đơn vị</div>
        <div>Đang giữ</div>
        <div>Chờ lâu nhất</div>
        <div>Nội dung đang chờ</div>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-emerald-600 font-medium">✓ Không có điểm nghẽn</div>
      ) : (
        <div>
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-[minmax(140px,1.2fr)_70px_90px_1.5fr] gap-3 px-4 py-2.5 items-center hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                  {initialsOf(row.name)}
                </span>
                <span className="font-medium text-slate-800 truncate">{row.name}</span>
              </div>
              <div className="tabular-nums text-slate-700">{row.holding} việc</div>
              <div className="text-rose-600 font-semibold tabular-nums">{row.maxDays.toFixed(1)} ngày</div>
              <div className="text-slate-600 truncate">{row.sample.waitingForContent || row.sample.title}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
