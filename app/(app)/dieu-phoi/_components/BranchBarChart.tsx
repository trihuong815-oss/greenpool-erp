'use client';

import { ChevronDown } from 'lucide-react';

type Row = {
  name: string;
  pct: number;
  waiting: number;
  overdue: number;
  color: string;
};

// Màu khớp mock — palette nhạt: blue-500 / orange-500 / violet-500
const ROWS: Row[] = [
  { name: 'Green Pool Hoàng Mai', pct: 75, waiting: 5, overdue: 1, color: '#3b82f6' },
  { name: 'Green Pool 24 NCT', pct: 68, waiting: 4, overdue: 1, color: '#f97316' },
  { name: 'Green Pool Linh Đàm', pct: 82, waiting: 6, overdue: 0, color: '#3b82f6' },
  { name: 'Green Pool Thanh Trì', pct: 60, waiting: 3, overdue: 1, color: '#f97316' },
  { name: 'Green Pool Thụy Khuê', pct: 55, waiting: 2, overdue: 0, color: '#8b5cf6' },
  { name: 'Green Pool Cầu Giấy', pct: 78, waiting: 0, overdue: 0, color: '#3b82f6' },
];

export default function BranchBarChart() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          Hiệu suất điều phối theo cơ sở
        </h3>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Tất cả cơ sở
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-[minmax(140px,210px)_1fr_60px_60px] gap-3 border-b border-slate-100 px-2 pb-2 text-[10px] uppercase tracking-wider text-slate-400">
        <div>Cơ sở</div>
        <div>% đúng hạn</div>
        <div className="text-center">Đang chờ</div>
        <div className="text-center">Quá hạn</div>
      </div>

      <div className="divide-y divide-slate-50">
        {ROWS.map((r) => (
          <div
            key={r.name}
            className="grid grid-cols-[minmax(140px,210px)_1fr_60px_60px] items-center gap-3 px-2 py-2 hover:bg-slate-50"
          >
            <div className="truncate text-sm font-medium text-slate-700">
              {r.name}
            </div>
            <div className="flex items-center">
              <div className="mr-2 h-1.5 flex-1 rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${r.pct}%`, background: r.color }}
                />
              </div>
              <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-700">
                {r.pct}%
              </span>
            </div>
            <div className="text-center text-sm tabular-nums text-slate-700">
              {r.waiting}
            </div>
            <div
              className={`text-center text-sm tabular-nums ${
                r.overdue > 0 ? 'font-semibold text-rose-600' : 'text-slate-500'
              }`}
            >
              {r.overdue}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
