'use client';

import { Calendar, Users, AlertTriangle } from 'lucide-react';
import {
  COORD_STATUS_LABEL, COORD_STATUS_COLOR, DEPT_LABEL,
  type CoordTask, type Collaborator, type DeptId,
} from '../types';

// V6.4 (2026-06-13): Card view 1 task cho mobile (spec anh chốt — KHÔNG dùng table).
// Tap → mở DispatchMobileDrawer full screen.

const TERMINAL = new Set(['hoan_thanh', 'dong_ho_so']);

function isPastIso(d: string | undefined | null): boolean {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T23:59:59+07:00`).getTime();
  return Number.isFinite(dt) && dt < Date.now();
}

function daysUntil(d: string | undefined | null): number | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const dt = new Date(`${d}T23:59:59+07:00`).getTime();
  if (!Number.isFinite(dt)) return null;
  return Math.ceil((dt - Date.now()) / 86_400_000);
}

function fmtDate(d: string | undefined | null): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function computeProgress(t: CoordTask): { done: number; total: number; pct: number } {
  const collabs = t.collaborators ?? [];
  const total = collabs.length;
  if (total === 0) return { done: 0, total: 0, pct: 0 };
  const done = collabs.filter((c) => c.status === 'hoan_thanh').length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

function computeWaitingLabel(t: CoordTask): string {
  const status = String(t.status);
  if (status === 'cho_owner_xac_nhan') return 'Chờ Owner xác nhận';
  if (status === 'cho_phe_duyet' || status === 'cho_duyet_ket_qua') return 'Chờ duyệt';
  const active = (t.collaborators ?? []).find((c: Collaborator) => {
    const s = c.status as string;
    return s === 'chua_tiep_nhan' || s === 'da_tiep_nhan' || s === 'dang_thuc_hien' || s === 'bi_tra_lai';
  });
  if (active) {
    const cid = active.id.startsWith('dept-') ? active.id.slice(5) : active.id.startsWith('facility-') ? active.id.slice(9) : '';
    const label = DEPT_LABEL[cid as DeptId] ?? cid ?? active.unitName ?? '';
    return label ? `Đang chờ: ${label}` : 'Đang chờ phối hợp';
  }
  return t.waitingForPerson ? `Đang chờ: ${t.waitingForPerson}` : '';
}

interface Props {
  task: CoordTask;
  onTap: (t: CoordTask) => void;
}

export default function DispatchCard({ task, onTap }: Props) {
  const progress = computeProgress(task);
  const waitingLabel = computeWaitingLabel(task);
  const remain = daysUntil(task.dueDate);
  const status = String(task.status);
  const terminal = TERMINAL.has(status);
  const overdue = remain !== null && remain < 0 && !terminal;
  const soon = remain !== null && remain >= 0 && remain <= 2 && !terminal;
  const severity = task.severity as string | undefined;

  return (
    <button
      type="button"
      onClick={() => onTap(task)}
      className="w-full text-left bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 active:scale-[0.99] active:bg-slate-50 transition p-4 space-y-3"
    >
      {/* Header — Tên + mã */}
      <div className="space-y-1">
        <div className="text-[15px] font-semibold text-slate-800 leading-snug line-clamp-2">
          {task.title}
        </div>
        <div className="text-[11px] text-slate-400 tabular-nums">#{task.code}</div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        {severity === 'khan_cap' && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200">
            <AlertTriangle size={11} /> Khẩn cấp
          </span>
        )}
        <span className={
          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ' +
          (task.scope === 'lien_khoi'
            ? 'bg-violet-50 text-violet-700 ring-violet-200'
            : 'bg-emerald-50 text-emerald-700 ring-emerald-200')
        }>
          {task.scope === 'lien_khoi' ? 'Liên khối' : 'Trong khối'}
        </span>
      </div>

      {/* Chủ trì */}
      <div className="flex items-center gap-2 text-sm">
        <Users size={14} className="text-slate-400 shrink-0" />
        <span className="text-slate-500">Chủ trì:</span>
        <span className="text-slate-800 font-medium truncate">{task.ownerName || '—'}</span>
      </div>

      {/* Tiến độ */}
      {progress.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-slate-800 tabular-nums">{progress.pct}%</span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {progress.done}/{progress.total} đơn vị hoàn thành
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full shadow-sm transition-all"
              style={{ width: `${progress.pct}%`, background: 'linear-gradient(90deg, #34d399, #10b981)' }}
            />
          </div>
        </div>
      )}

      {/* Đang chờ */}
      {waitingLabel && (
        <div className="text-[13px] text-slate-600 rounded-lg bg-amber-50 px-2.5 py-1.5 ring-1 ring-inset ring-amber-100">
          {waitingLabel}
        </div>
      )}

      {/* Footer — Deadline + Status */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <div className={
          'flex items-center gap-1 text-[13px] tabular-nums ' +
          (overdue ? 'text-rose-600 font-semibold' : soon ? 'text-orange-600 font-semibold' : 'text-slate-600')
        }>
          <Calendar size={13} />
          {fmtDate(task.dueDate)}
          {overdue && <span className="text-[11px] ml-1">(quá {Math.abs(remain ?? 0)}d)</span>}
          {soon && !overdue && <span className="text-[11px] ml-1">(còn {remain}d)</span>}
        </div>
        <span className={
          'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ' +
          COORD_STATUS_COLOR[task.status]
        }>
          {COORD_STATUS_LABEL[task.status]}
        </span>
      </div>
    </button>
  );
}
