'use client';

import { ChevronDown } from 'lucide-react';

type Row = {
  name: string;
  pct: number;
  waiting: number;
  overdue: number;
  color: string;
};

const ROWS: Row[] = [
  { name: 'TP Đào tạo', pct: 70, waiting: 6, overdue: 1, color: '#1e40af' },
  { name: 'Marketing', pct: 60, waiting: 5, overdue: 1, color: '#059669' },
  { name: 'Quản lý cơ sở (QLCS)', pct: 80, waiting: 7, overdue: 0, color: '#ea580c' },
  { name: 'Nhân sự', pct: 50, waiting: 4, overdue: 0, color: '#8b5cf6' },
  { name: 'Kế toán', pct: 70, waiting: 5, overdue: 1, color: '#1e40af' },
  { name: 'Giám sát', pct: 60, waiting: 6, overdue: 0, color: '#059669' },
  { name: 'Kỹ thuật', pct: 85, waiting: 3, overdue: 0, color: '#ea580c' },
];

export default function DeptBarChart() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          Hiệu suất điều phối theo phòng ban
        </h3>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Tất cả phòng ban
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-[1fr_minmax(120px,180px)_60px_60px] gap-3 border-b border-slate-100 px-2 pb-2 text-[10px] uppercase tracking-wider text-slate-400">
        <div>Phòng ban</div>
        <div>% đúng hạn</div>
        <div className="text-center">Đang chờ</div>
        <div className="text-center">Quá hạn</div>
      </div>

      <div className="divide-y divide-slate-50">
        {ROWS.map((r) => (
          <div
            key={r.name}
            className="grid grid-cols-[1fr_minmax(120px,180px)_60px_60px] items-center gap-3 px-2 py-2 hover:bg-slate-50"
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
              <span
                className="w-10 text-right text-sm font-semibold tabular-nums"
                style={{ color: r.color }}
              >
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
