'use client';

import { useMemo } from 'react';
import type { CoordTask } from '../types';

// ============================================================
// V6.4 (2026-06-13): DONUT 5 segment trạng thái cá nhân
//   - Đang xử lý        (sky)
//   - Đang phối hợp     (violet)
//   - Chờ xác nhận      (amber — gồm cho_owner_xac_nhan + cho_phe_duyet + cho_duyet_ket_qua)
//   - Hoàn thành        (emerald — gồm hoan_thanh + dong_ho_so)
//   - Quá hạn           (rose — dueDate < today & chưa terminal)
// Dataset: tasks tôi là Owner hoặc collab.
// ============================================================

const SIZE = 180;
const STROKE = 28;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

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
}

interface Seg {
  key: string; name: string; count: number; hex: string; hexLight: string; gradId: string;
}

export default function StatusDonut({
  tasks, currentUserUid, currentUserDeptId, currentUserFacilityId,
}: Props) {
  const buckets = useMemo(() => {
    let dxl = 0, dph = 0, choXn = 0, hoanThanh = 0, quaHan = 0;
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

      const status = String(t.status);
      const terminal = status === 'hoan_thanh' || status === 'dong_ho_so';
      const isOverdue = !terminal && isPastIso(t.dueDate);

      if (isOverdue) { quaHan += 1; continue; }
      if (terminal) { hoanThanh += 1; continue; }
      if (status === 'cho_owner_xac_nhan' || status === 'cho_phe_duyet' || status === 'cho_duyet_ket_qua') {
        choXn += 1; continue;
      }
      if (status === 'dang_phoi_hop') { dph += 1; continue; }
      dxl += 1;
    }
    return { dxl, dph, choXn, hoanThanh, quaHan };
  }, [tasks, currentUserUid, currentUserDeptId, currentUserFacilityId]);

  const total = buckets.dxl + buckets.dph + buckets.choXn + buckets.hoanThanh + buckets.quaHan;
  const safeTotal = total === 0 ? 1 : total;

  const segments: Seg[] = [
    { key: 'dxl', name: 'Đang xử lý', count: buckets.dxl, hex: '#3b82f6', hexLight: '#60a5fa', gradId: 'sd-dxl' },
    { key: 'dph', name: 'Đang phối hợp', count: buckets.dph, hex: '#8b5cf6', hexLight: '#a78bfa', gradId: 'sd-dph' },
    { key: 'cxn', name: 'Chờ xác nhận', count: buckets.choXn, hex: '#f59e0b', hexLight: '#fbbf24', gradId: 'sd-cxn' },
    { key: 'ht', name: 'Hoàn thành', count: buckets.hoanThanh, hex: '#10b981', hexLight: '#34d399', gradId: 'sd-ht' },
    { key: 'qh', name: 'Quá hạn', count: buckets.quaHan, hex: '#e11d48', hexLight: '#fb7185', gradId: 'sd-qh' },
  ];

  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const dashLen = (seg.count / safeTotal) * CIRCUMFERENCE;
    const dashOffset = -cumulative;
    cumulative += dashLen;
    return { ...seg, dashArray: `${dashLen} ${CIRCUMFERENCE - dashLen}`, dashOffset };
  });

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-md ring-1 ring-slate-50 transition hover:-translate-y-0.5 hover:shadow-lg">
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Công việc theo trạng thái
      </h3>

      <div className="flex flex-col items-center gap-4 md:flex-row">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)' }}>
            <defs>
              {segments.map((seg) => (
                <linearGradient key={seg.gradId} id={seg.gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={seg.hexLight} />
                  <stop offset="100%" stopColor={seg.hex} />
                </linearGradient>
              ))}
              <filter id="sd-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
                <feOffset dx="0" dy="2" result="offsetblur" />
                <feComponentTransfer><feFuncA type="linear" slope="0.15" /></feComponentTransfer>
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
            <g filter="url(#sd-shadow)">
              {arcs.map((arc) => (
                <circle
                  key={arc.key}
                  cx={CENTER} cy={CENTER} r={RADIUS}
                  fill="none" stroke={`url(#${arc.gradId})`} strokeWidth={STROKE}
                  strokeDasharray={arc.dashArray} strokeDashoffset={arc.dashOffset}
                  strokeLinecap="butt"
                />
              ))}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Tổng</span>
            <span className="text-2xl font-bold tabular-nums text-slate-900">{total}</span>
            <span className="text-[10px] text-slate-400">việc</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 gap-1.5">
          {segments.map((seg) => {
            const pct = total === 0 ? 0 : Math.round((seg.count / total) * 100);
            return (
              <div key={seg.key} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: seg.hex }} />
                  <span className="text-xs font-medium text-slate-700 truncate">{seg.name}</span>
                </div>
                <span className="text-[11px] tabular-nums text-slate-500">
                  {seg.count} <span className="text-slate-400">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
