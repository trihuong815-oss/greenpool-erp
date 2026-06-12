'use client';

import { ChevronDown } from 'lucide-react';
import { useMemo } from 'react';
import type { CoordTask, BranchId } from './types';

interface Props { tasks: CoordTask[] }

// 6 cơ sở — tên TẮT theo yêu cầu anh ("GP HM" thay "Green Pool Hoàng Mai")
// V6.3: 5 cơ sở chuẩn anh chốt — viết đầy đủ tên (dễ đọc hơn tắt).
const BRANCHES: { id: BranchId; name: string; color: string }[] = [
  { id: 'HM',    name: 'Hoàng Mai',             color: '#3b82f6' },
  { id: 'NCT24', name: '24 Nguyễn Cơ Thạch',    color: '#f97316' },
  { id: 'TK',    name: '20 Thuỵ Khuê',          color: '#8b5cf6' },
  { id: 'TT',    name: 'Thanh Trì',             color: '#10b981' },
  { id: 'CTT',   name: 'Cung Thể Thao Mỹ Đình', color: '#f59e0b' },
];

function isOverdue(t: CoordTask): boolean {
  if (!t.dueDate) return false;
  if (t.status === 'hoan_thanh' || t.status === 'dong_ho_so') return false;
  return t.dueDate < new Date().toISOString().slice(0, 10);
}

export default function BranchBarChart({ tasks }: Props) {
  const rows = useMemo(() => BRANCHES.map((b) => {
    const ofBranch = tasks.filter((t) => t.branch === b.id);
    const due = ofBranch.filter((t) => t.dueDate);
    const completedOnTime = due.filter((t) =>
      (t.status === 'hoan_thanh' || t.status === 'dong_ho_so') && !isOverdue(t)).length;
    const pct = due.length === 0 ? 0 : Math.round(completedOnTime / due.length * 100);
    const waiting = ofBranch.filter((t) => t.status === 'cho_phan_hoi' || t.status === 'cho_phe_duyet').length;
    const overdue = ofBranch.filter(isOverdue).length;
    return { ...b, pct, waiting, overdue, total: ofBranch.length };
  }), [tasks]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Hiệu suất điều phối theo cơ sở</h3>
        <button type="button" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
          Tất cả cơ sở <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-[90px_1fr_70px_70px] gap-3 border-b border-slate-100 px-2 pb-2 text-[10px] uppercase tracking-wider text-slate-400">
        <div>Cơ sở</div>
        <div>% đúng hạn</div>
        <div className="text-center">Đang chờ</div>
        <div className="text-center">Quá hạn</div>
      </div>

      <div className="divide-y divide-slate-50">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[90px_1fr_70px_70px] items-center gap-3 px-2 py-2 hover:bg-slate-50">
            <div className="text-sm font-medium text-slate-700 truncate">{r.name}</div>
            <div className="flex items-center">
              <div className="mr-2 h-1.5 flex-1 rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} />
              </div>
              <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-700">{r.pct}%</span>
            </div>
            <div className="text-center text-sm tabular-nums text-slate-700">{r.waiting}</div>
            <div className={`text-center text-sm tabular-nums ${r.overdue > 0 ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
              {r.overdue}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
