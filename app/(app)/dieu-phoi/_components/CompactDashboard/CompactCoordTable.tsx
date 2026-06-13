'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  COORD_STATUS_LABEL, COORD_STATUS_COLOR, DEPT_LABEL,
  type CoordTask, type Collaborator, type DeptId,
} from '../types';
import type { CompactKpiKey } from './CompactKpiBar';

// ============================================================
// V6.4 (2026-06-13): Bảng điều phối COMPACT — 6 cột + 5 tabs
//   Cột: Công việc | Chủ trì | Tiến độ | Chi tiết | Deadline | Trạng thái
//   Tabs: Tất cả | Tôi chủ trì | Tôi phối hợp | Chờ phản hồi | Quá hạn
//   KPI external → tự switch tab tương ứng.
// ============================================================

type TabKey = 'all' | 'mine' | 'collab' | 'waiting' | 'overdue';

const TAB_LABEL: Record<TabKey, string> = {
  all: 'Tất cả',
  mine: 'Tôi chủ trì',
  collab: 'Tôi phối hợp',
  waiting: 'Chờ phản hồi',
  overdue: 'Quá hạn',
};

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

function formatDateShort(d: string | undefined | null): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y.slice(2)}`;
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
  return t.waitingForPerson ? `Đang chờ: ${t.waitingForPerson}` : '—';
}

interface Props {
  tasks: CoordTask[];
  currentUserUid: string;
  currentUserDeptId: string | null;
  currentUserFacilityId: string | null;
  onRowClick: (t: CoordTask) => void;
  externalFilter: CompactKpiKey | null;
}

export default function CompactCoordTable({
  tasks, currentUserUid, currentUserDeptId, currentUserFacilityId, onRowClick, externalFilter,
}: Props) {
  const [tab, setTab] = useState<TabKey>('all');

  // KPI click ngoài → tự switch tab phù hợp
  useEffect(() => {
    if (externalFilter === 'dang-chu-tri' || externalFilter === 'can-toi-xu-ly') setTab('mine');
    else if (externalFilter === 'dang-phoi-hop') setTab('collab');
    else if (externalFilter === 'cho-phan-hoi') setTab('waiting');
    else if (externalFilter === 'qua-han') setTab('overdue');
    else if (externalFilter === null) setTab('all');
  }, [externalFilter]);

  const isMyCollab = (t: CoordTask): boolean => {
    for (const c of t.collaborators ?? []) {
      const cid = c.id.startsWith('dept-') ? c.id.slice(5) : c.id.startsWith('facility-') ? c.id.slice(9) : '';
      if (currentUserDeptId && cid === currentUserDeptId) return true;
      if (currentUserFacilityId && cid === currentUserFacilityId) return true;
    }
    return false;
  };

  const counts: Record<TabKey, number> = useMemo(() => {
    let all = 0, mine = 0, collab = 0, waiting = 0, overdue = 0;
    for (const t of tasks) {
      const isOwner = t.ownerUid === currentUserUid;
      const isCol = isMyCollab(t);
      if (!isOwner && !isCol) continue;
      all += 1;
      if (isOwner) mine += 1;
      if (isCol) collab += 1;
      const status = String(t.status);
      const terminal = TERMINAL.has(status);
      const waitPerson = t.waitingForPerson ?? '';
      const waitUnit = t.waitingForUnit ?? '';
      if (
        !terminal &&
        ((waitPerson && waitPerson === currentUserUid) ||
          (currentUserDeptId && waitUnit === currentUserDeptId) ||
          (currentUserFacilityId && waitUnit === currentUserFacilityId))
      ) waiting += 1;
      if (!terminal && isPastIso(t.dueDate)) overdue += 1;
    }
    return { all, mine, collab, waiting, overdue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, currentUserUid, currentUserDeptId, currentUserFacilityId]);

  const filtered = useMemo(() => {
    const out: CoordTask[] = [];
    for (const t of tasks) {
      const isOwner = t.ownerUid === currentUserUid;
      const isCol = isMyCollab(t);
      if (!isOwner && !isCol) continue;
      const status = String(t.status);
      const terminal = TERMINAL.has(status);
      if (tab === 'mine' && !isOwner) continue;
      if (tab === 'collab' && !isCol) continue;
      if (tab === 'waiting') {
        const waitPerson = t.waitingForPerson ?? '';
        const waitUnit = t.waitingForUnit ?? '';
        const isWaitMe = (waitPerson && waitPerson === currentUserUid) ||
          (currentUserDeptId && waitUnit === currentUserDeptId) ||
          (currentUserFacilityId && waitUnit === currentUserFacilityId);
        if (!isWaitMe || terminal) continue;
      }
      if (tab === 'overdue' && (terminal || !isPastIso(t.dueDate))) continue;
      out.push(t);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, tab, currentUserUid, currentUserDeptId, currentUserFacilityId]);

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white shadow-md ring-1 ring-slate-50 overflow-hidden">
      {/* Tabs */}
      <div className="border-b border-slate-200 overflow-x-auto bg-gradient-to-b from-slate-50/60 to-white">
        <div className="flex items-center gap-1 px-2">
          {(['all', 'mine', 'collab', 'waiting', 'overdue'] as TabKey[]).map((key) => {
            const isActive = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={
                  'px-3.5 py-2.5 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors ' +
                  (isActive
                    ? 'border-emerald-500 text-emerald-700 font-bold'
                    : 'border-transparent text-slate-600 hover:text-slate-800 font-medium')
                }
              >
                {TAB_LABEL[key]}{' '}
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold tabular-nums">
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bảng 6 cột */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5 text-left font-medium">Công việc</th>
              <th className="px-3 py-2.5 text-left font-medium w-40">Chủ trì</th>
              <th className="px-3 py-2.5 text-left font-medium w-36">Tiến độ</th>
              <th className="px-3 py-2.5 text-left font-medium w-48">Chi tiết</th>
              <th className="px-3 py-2.5 text-left font-medium w-28">Deadline</th>
              <th className="px-3 py-2.5 text-left font-medium w-32">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const progress = computeProgress(t);
              const waitingLabel = computeWaitingLabel(t);
              const remain = daysUntil(t.dueDate);
              const overdue = remain !== null && remain < 0 && !TERMINAL.has(String(t.status));
              const soon = remain !== null && remain >= 0 && remain <= 2 && !TERMINAL.has(String(t.status));
              const severity = (t.severity as string | undefined);
              return (
                <tr
                  key={t.id}
                  onClick={() => onRowClick(t)}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  {/* Công việc */}
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-slate-800">{t.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">#{t.code}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className={
                        'inline-flex items-center rounded px-1.5 py-0 text-[10px] font-medium ring-1 ring-inset ' +
                        (t.scope === 'lien_khoi' ? 'bg-orange-50 text-orange-700 ring-orange-200' : 'bg-slate-50 text-slate-600 ring-slate-200')
                      }>
                        {t.scope === 'lien_khoi' ? 'Liên khối' : 'Trong khối'}
                      </span>
                      {severity === 'khan_cap' && (
                        <span className="inline-flex items-center rounded px-1.5 py-0 text-[10px] font-semibold bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200">
                          Khẩn cấp
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Chủ trì */}
                  <td className="px-3 py-3 align-top">
                    <span className="text-sm text-slate-700 truncate block">{t.ownerName || '—'}</span>
                    {t.ownerRole && <span className="text-[10px] text-slate-400">{t.ownerRole}</span>}
                  </td>
                  {/* Tiến độ */}
                  <td className="px-3 py-3 align-top">
                    {progress.total === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-700 tabular-nums">{progress.pct}%</span>
                          <span className="text-[10px] text-slate-500 tabular-nums">{progress.done}/{progress.total}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress.pct}%` }} />
                        </div>
                      </div>
                    )}
                  </td>
                  {/* Chi tiết */}
                  <td className="px-3 py-3 align-top">
                    <div className="text-xs text-slate-600">
                      <div>{progress.total > 0 ? `${progress.total} đơn vị phối hợp` : 'Không có đơn vị phối hợp'}</div>
                      <div className="text-[11px] text-slate-500 truncate">{waitingLabel}</div>
                    </div>
                  </td>
                  {/* Deadline */}
                  <td className={
                    'px-3 py-3 align-top text-sm tabular-nums ' +
                    (overdue ? 'text-rose-600 font-semibold' : soon ? 'text-orange-600 font-semibold' : 'text-slate-700')
                  }>
                    {formatDateShort(t.dueDate)}
                    {overdue && <div className="text-[10px] text-rose-500">Quá {Math.abs(remain ?? 0)}d</div>}
                    {soon && !overdue && <div className="text-[10px] text-orange-500">Còn {remain}d</div>}
                  </td>
                  {/* Trạng thái */}
                  <td className="px-3 py-3 align-top">
                    <span className={
                      'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ' +
                      COORD_STATUS_COLOR[t.status]
                    }>
                      {COORD_STATUS_LABEL[t.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                  Không có công việc phù hợp với bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
