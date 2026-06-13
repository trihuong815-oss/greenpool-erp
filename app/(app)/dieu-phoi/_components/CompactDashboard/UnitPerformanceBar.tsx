'use client';

import { useMemo } from 'react';
import type { CoordTask } from '../types';

// ============================================================
// V6.4 (2026-06-13): Hiệu suất ĐƠN VỊ TÔI — 3 metric stacked bar:
//   - Hoàn thành    (emerald)
//   - Đang xử lý    (sky)
//   - Quá hạn       (rose)
// Dataset: tasks mà tôi là Owner HOẶC đơn vị tôi là collab.
// ============================================================

const TERMINAL = new Set(['hoan_thanh', 'dong_ho_so']);

function isPastIso(d: string | undefined | null): boolean {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T23:59:59+07:00`).getTime();
  return Number.isFinite(dt) && dt < Date.now();
}

interface Props {
  tasks: CoordTask[];
  currentUserUid: string;
  currentUserDeptId: string | null;
  currentUserFacilityId: string | null;
  unitLabel: string;
}

export default function UnitPerformanceBar({
  tasks, currentUserUid, currentUserDeptId, currentUserFacilityId, unitLabel,
}: Props) {
  const stats = useMemo(() => {
    let total = 0, done = 0, active = 0, overdue = 0;
    for (const t of tasks) {
      const isOwner = t.ownerUid === currentUserUid;
      let isCollab = false;
      for (const c of t.collaborators ?? []) {
        const cid = c.id.startsWith('dept-') ? c.id.slice(5)
                  : c.id.startsWith('facility-') ? c.id.slice(9) : '';
        if (currentUserDeptId && cid === currentUserDeptId) { isCollab = true; break; }
        if (currentUserFacilityId && cid === currentUserFacilityId) { isCollab = true; break; }
      }
      if (!isOwner && !isCollab) continue;
      total += 1;
      const status = String(t.status);
      const terminal = TERMINAL.has(status);
      if (terminal) {
        done += 1;
      } else if (isPastIso(t.dueDate)) {
        overdue += 1;
      } else {
        active += 1;
      }
    }
    return { total, done, active, overdue };
  }, [tasks, currentUserUid, currentUserDeptId, currentUserFacilityId]);

  const { total, done, active, overdue } = stats;
  const safeTotal = total === 0 ? 1 : total;
  const donePct = Math.round((done / safeTotal) * 100);
  const activePct = Math.round((active / safeTotal) * 100);
  const overduePct = Math.max(0, 100 - donePct - activePct);

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-md ring-1 ring-slate-50 transition hover:-translate-y-0.5 hover:shadow-lg">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Hiệu suất {unitLabel}
      </h3>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-emerald-700">Hoàn thành</span>
            <span className="tabular-nums text-slate-600">{done}/{total} <span className="text-emerald-600 font-semibold">({donePct}%)</span></span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden shadow-inner">
            <div className="h-full rounded-full shadow-sm" style={{ width: `${donePct}%`, background: 'linear-gradient(90deg, #34d399, #10b981)' }} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-sky-700">Đang xử lý</span>
            <span className="tabular-nums text-slate-600">{active}/{total} <span className="text-sky-600 font-semibold">({activePct}%)</span></span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden shadow-inner">
            <div className="h-full rounded-full shadow-sm" style={{ width: `${activePct}%`, background: 'linear-gradient(90deg, #60a5fa, #3b82f6)' }} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-rose-700">Quá hạn</span>
            <span className="tabular-nums text-slate-600">{overdue}/{total} <span className="text-rose-600 font-semibold">({overduePct}%)</span></span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden shadow-inner">
            <div className="h-full rounded-full shadow-sm" style={{ width: `${overduePct}%`, background: 'linear-gradient(90deg, #fb7185, #e11d48)' }} />
          </div>
        </div>
      </div>

      {total === 0 && (
        <p className="mt-3 text-[11px] text-slate-400 italic text-center">Chưa có công việc nào liên quan đơn vị bạn.</p>
      )}
    </div>
  );
}
