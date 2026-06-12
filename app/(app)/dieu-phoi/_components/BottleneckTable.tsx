'use client';

import { useMemo } from 'react';
import type { CoordTask, Collaborator } from './types';

// ============================================================
// V4 SPEC — GroupBy waitingForPerson HOẶC waitingForUnit
// (lấy từ computeWaitingFor). Sort: holding desc → stuck time desc. Top 5.
// ============================================================

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

/** V4: computeWaitingFor — trả về { person, unit, content } cho mỗi task. */
function computeWaitingFor(t: CoordTask): { person: string; unit: string; content: string } {
  const active = (t.collaborators ?? []).find((c: Collaborator) => {
    const s = (c as unknown as { status?: string }).status ?? c.status;
    return s === 'chua_tiep_nhan' || s === 'da_tiep_nhan' || s === 'dang_thuc_hien' || s === 'bi_tra_lai';
  });
  if (active) {
    return {
      person: active.responsibleName || '—',
      unit: active.unitName || '—',
      content: active.supportContent || active.deliverable || '—',
    };
  }
  return {
    person: t.waitingForPerson || '—',
    unit: '—',
    content: t.waitingForContent || '—',
  };
}

/** V4: task vẫn còn "đang chờ" — status nằm trong set chờ hoặc collab có status pending. */
function isWaitingTask(t: CoordTask): boolean {
  const tStatus = (t as unknown as { status?: string }).status ?? t.status;
  if (tStatus === 'hoan_thanh' || tStatus === 'dong_ho_so') return false;
  if (
    tStatus === 'cho_phan_hoi' ||
    tStatus === 'cho_phe_duyet' ||
    tStatus === 'cho_owner_xac_nhan' ||
    tStatus === 'cho_duyet_ket_qua' ||
    tStatus === 'dang_phoi_hop'
  ) return true;
  // Có collab đang pending
  return (t.collaborators ?? []).some((c) => {
    const s = (c as unknown as { status?: string }).status ?? c.status;
    return s === 'chua_tiep_nhan' || s === 'da_tiep_nhan' || s === 'dang_thuc_hien' || s === 'gui_hoan_thanh' || s === 'bi_tra_lai';
  });
}

export default function BottleneckTable({ tasks }: Props) {
  const rows = useMemo(() => {
    const stuckTasks = tasks.filter(isWaitingTask);
    // Group theo person; fallback group theo unit nếu person rỗng/—
    const groups = new Map<string, { holding: number; maxDays: number; sample: CoordTask; unit: string; content: string }>();
    for (const t of stuckTasks) {
      const w = computeWaitingFor(t);
      const key = w.person && w.person !== '—' ? w.person : w.unit;
      if (!key || key === '—') continue;
      const days = stuckDays(t);
      const cur = groups.get(key);
      if (!cur) {
        groups.set(key, { holding: 1, maxDays: days, sample: t, unit: w.unit, content: w.content });
      } else {
        cur.holding += 1;
        if (days > cur.maxDays) {
          cur.maxDays = days;
          cur.sample = t;
          cur.content = w.content;
        }
      }
    }
    return Array.from(groups.entries())
      .map(([name, g]) => ({ name, ...g }))
      .sort((a, b) => b.holding - a.holding || b.maxDays - a.maxDays)
      .slice(0, 5);
  }, [tasks]);

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white shadow-md ring-1 ring-slate-50 overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="bg-gradient-to-r from-rose-50 to-rose-50/40 px-4 py-2 border-b border-rose-100/70 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Điểm nghẽn hiện tại</h3>
        <button type="button" className="text-[11px] font-medium text-emerald-600 hover:underline">Xem tất cả</button>
      </div>

      <div className="grid grid-cols-[minmax(120px,1.4fr)_44px_60px_1.6fr] gap-2 px-3 py-1.5 border-b border-slate-100 text-[10px] uppercase text-slate-400 tracking-wider font-medium">
        <div>Người / Đơn vị</div>
        <div className="text-center">SL</div>
        <div className="text-right">Chờ</div>
        <div>Nội dung</div>
      </div>

      {rows.length === 0 ? (
        <div className="py-7 text-center text-xs text-emerald-600 font-medium">✓ Không có điểm nghẽn</div>
      ) : (
        <div>
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-[minmax(120px,1.4fr)_44px_60px_1.6fr] gap-2 px-3 py-2.5 items-center hover:bg-slate-50/70 text-sm border-b border-slate-50 last:border-0 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 text-[10px] font-bold flex items-center justify-center shrink-0 shadow-sm ring-1 ring-white/60">
                  {initialsOf(row.name)}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{row.name}</div>
                  {row.unit && row.unit !== '—' && row.unit !== row.name && (
                    <div className="text-[10px] text-slate-400 truncate">{row.unit}</div>
                  )}
                </div>
              </div>
              <div className="text-center tabular-nums text-slate-700 font-medium">{row.holding}</div>
              <div className="text-right text-rose-600 font-semibold tabular-nums">{row.maxDays.toFixed(1)}d</div>
              <div className="text-slate-600 truncate text-xs" title={row.content || row.sample.title}>{row.content || row.sample.title}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
