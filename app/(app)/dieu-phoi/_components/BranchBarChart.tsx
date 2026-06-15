'use client';

import { ChevronDown } from 'lucide-react';
import { useMemo } from 'react';
import type { CoordTask, BranchId } from './types';
import { todayHN } from '@/lib/dates';

interface Props { tasks: CoordTask[] }

// V6.3: 5 cơ sở chính thức anh chốt — tên đầy đủ, cột rộng để không bị truncate.
const BRANCHES: { id: BranchId; name: string; color: string; colorLight: string }[] = [
  { id: 'HM',    name: 'Hoàng Mai',             color: '#3b82f6', colorLight: '#60a5fa' },
  { id: 'NCT24', name: '24 Nguyễn Cơ Thạch',    color: '#f97316', colorLight: '#fb923c' },
  { id: 'TK',    name: '20 Thuỵ Khuê',          color: '#8b5cf6', colorLight: '#a78bfa' },
  { id: 'TT',    name: 'Thanh Trì',             color: '#10b981', colorLight: '#34d399' },
  { id: 'CTT',   name: 'Cung Thể Thao Mỹ Đình', color: '#f59e0b', colorLight: '#fbbf24' },
];

function isOverdue(t: CoordTask): boolean {
  if (!t.dueDate) return false;
  if (t.status === 'hoan_thanh' || t.status === 'dong_ho_so') return false;
  return t.dueDate < todayHN();
}

export default function BranchBarChart({ tasks }: Props) {
  // V6.5 (2026-06-15) — CHUẨN CÔNG THỨC HIỆU SUẤT CƠ SỞ (đồng bộ DeptBarChart):
  //   • % hiệu suất = settledOnTime / settled × 100 (KHÔNG kéo % xuống bởi task chưa chốt)
  //   • Đang chờ = V4 status pending duyệt OR có collab pending
  //   • Quá hạn  = dueDate < today + chưa chốt
  const rows = useMemo(() => BRANCHES.map((b) => {
    const ofBranch = tasks.filter((t) => t.branch === b.id);
    const settled = ofBranch.filter((t) => t.status === 'hoan_thanh' || t.status === 'dong_ho_so');
    const settledOnTime = settled.filter((t) => !t.dueDate || t.dueDate >= todayHN());
    const pct = settled.length === 0 ? 0 : Math.round(settledOnTime.length / settled.length * 100);
    const waiting = ofBranch.filter((t) => {
      const s = t.status as string;
      if (s === 'cho_owner_xac_nhan' || s === 'cho_duyet_ket_qua' || s === 'cho_phe_duyet' || s === 'cho_phan_hoi') return true;
      return t.collaborators.some((c) => {
        const cs = c.status as string;
        return cs === 'chua_tiep_nhan' || cs === 'gui_hoan_thanh' || cs === 'bi_tra_lai';
      });
    }).length;
    const overdue = ofBranch.filter(isOverdue).length;
    return { ...b, pct, waiting, overdue, total: ofBranch.length, settled: settled.length };
  }), [tasks]);

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-md ring-1 ring-slate-50 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Hiệu suất điều phối theo cơ sở
        </h3>
        <button type="button" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50">
          Tất cả cơ sở <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-[minmax(150px,180px)_1fr_52px_52px] gap-2 border-b border-slate-100 px-1.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
        <div>Cơ sở</div>
        <div>% đúng hạn</div>
        <div className="text-center">Đang chờ</div>
        <div className="text-center">Quá hạn</div>
      </div>

      <div className="divide-y divide-slate-50">
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[minmax(150px,180px)_1fr_52px_52px] items-center gap-2 px-1.5 py-1.5 hover:bg-slate-50/70 transition-colors"
            title={`${r.name} — Tổng: ${r.total} task · Đã chốt: ${r.settled} · % đúng hạn: ${r.pct}%`}
          >
            <div className="text-xs font-semibold text-slate-700 truncate" title={r.name}>{r.name}</div>
            <div className="flex items-center">
              <div className="mr-2 h-2 flex-1 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                <div
                  className="h-full rounded-full shadow-sm transition-all"
                  style={{ width: `${r.pct}%`, background: `linear-gradient(90deg, ${r.colorLight}, ${r.color})` }}
                />
              </div>
              <span className="w-12 text-right text-xs font-semibold tabular-nums text-slate-700">
                {r.settled === 0 ? <span className="text-slate-300">—</span> : `${r.pct}%`}
              </span>
            </div>
            <div className="text-center text-xs tabular-nums text-slate-600">{r.waiting}</div>
            <div className={`text-center text-xs tabular-nums ${r.overdue > 0 ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
              {r.overdue}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
