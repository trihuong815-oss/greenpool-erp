'use client';

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Plus } from 'lucide-react';
import type { CoordTask } from '../types';
import SwipeKpiBar, { type MobileKpiKey } from './SwipeKpiBar';
import TabsMobile, { type MobileTabKey } from './TabsMobile';
import FilterSheet, { type FilterState, DEFAULT_FILTER } from './FilterSheet';
import DispatchCard from './DispatchCard';

// V6.4 (2026-06-13): Mobile shell điều phối — spec anh chốt
//   Header (TopBar đã có sẵn) → KPI swipe → Tìm kiếm + Filter → Tabs sticky → Card list

const TERMINAL = new Set(['hoan_thanh', 'dong_ho_so']);

function isPastIso(d: string | undefined | null): boolean {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T23:59:59+07:00`).getTime();
  return Number.isFinite(dt) && dt < Date.now();
}

function isThisWeek(d: string | undefined | null): boolean {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T23:59:59+07:00`).getTime();
  if (!Number.isFinite(dt)) return false;
  const now = Date.now();
  return dt >= now && (dt - now) < 7 * 86_400_000;
}

function isThisMonth(d: string | undefined | null): boolean {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T23:59:59+07:00`).getTime();
  if (!Number.isFinite(dt)) return false;
  const now = Date.now();
  return dt >= now && (dt - now) < 31 * 86_400_000;
}

interface Props {
  tasks: CoordTask[];
  currentUserUid: string;
  currentUserDeptId: string | null;
  currentUserFacilityId: string | null;
  canCreate: boolean;
  onCreate: () => void;
  onRowClick: (t: CoordTask) => void;
}

export default function MobileDispatchView({
  tasks, currentUserUid, currentUserDeptId, currentUserFacilityId, canCreate, onCreate, onRowClick,
}: Props) {
  const [kpiKey, setKpiKey] = useState<MobileKpiKey | null>(null);
  const [tab, setTab] = useState<MobileTabKey>('all');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);

  // KPI click → tự switch tab
  function selectKpi(k: MobileKpiKey | null) {
    setKpiKey(k);
    if (k === 'dang-chu-tri' || k === 'can-toi-xu-ly') setTab('mine');
    else if (k === 'dang-phoi-hop') setTab('collab');
    else if (k === 'cho-phan-hoi') setTab('waiting');
    else if (k === 'qua-han') setTab('overdue');
    else setTab('all');
  }

  // === Helpers ===
  const isMyCollab = (t: CoordTask): boolean => {
    for (const c of t.collaborators ?? []) {
      const cid = c.id.startsWith('dept-') ? c.id.slice(5)
        : c.id.startsWith('facility-') ? c.id.slice(9) : '';
      if (currentUserDeptId && cid === currentUserDeptId) return true;
      if (currentUserFacilityId && cid === currentUserFacilityId) return true;
    }
    return false;
  };

  // Tab counts (chỉ task user liên quan)
  const counts: Record<MobileTabKey, number> = useMemo(() => {
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
      if (!terminal && (
        (waitPerson && waitPerson === currentUserUid) ||
        (currentUserDeptId && waitUnit === currentUserDeptId) ||
        (currentUserFacilityId && waitUnit === currentUserFacilityId)
      )) waiting += 1;
      if (!terminal && isPastIso(t.dueDate)) overdue += 1;
    }
    return { all, mine, collab, waiting, overdue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, currentUserUid, currentUserDeptId, currentUserFacilityId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      const isOwner = t.ownerUid === currentUserUid;
      const isCol = isMyCollab(t);
      if (!isOwner && !isCol) return false;
      const status = String(t.status);
      const terminal = TERMINAL.has(status);
      // Tab
      if (tab === 'mine' && !isOwner) return false;
      if (tab === 'collab' && !isCol) return false;
      if (tab === 'waiting') {
        const waitPerson = t.waitingForPerson ?? '';
        const waitUnit = t.waitingForUnit ?? '';
        const ok = (waitPerson && waitPerson === currentUserUid) ||
          (currentUserDeptId && waitUnit === currentUserDeptId) ||
          (currentUserFacilityId && waitUnit === currentUserFacilityId);
        if (!ok || terminal) return false;
      }
      if (tab === 'overdue' && (terminal || !isPastIso(t.dueDate))) return false;
      // Search
      if (q && !(t.title?.toLowerCase().includes(q) || t.code?.toLowerCase().includes(q))) return false;
      // Filter sheet
      if (filter.status !== 'all' && status !== filter.status) return false;
      if (filter.severity !== 'all') {
        const sev = (t.severity as string | undefined) || 'binh_thuong';
        if (sev !== filter.severity) return false;
      }
      if (filter.scope !== 'all' && t.scope !== filter.scope) return false;
      if (filter.deadline === 'overdue' && !(isPastIso(t.dueDate) && !terminal)) return false;
      if (filter.deadline === 'this-week' && !isThisWeek(t.dueDate)) return false;
      if (filter.deadline === 'this-month' && !isThisMonth(t.dueDate)) return false;
      return true;
    });
  }, [tasks, tab, search, filter, currentUserUid, currentUserDeptId, currentUserFacilityId]);

  const activeFilterCount = (filter.status !== 'all' ? 1 : 0) + (filter.severity !== 'all' ? 1 : 0)
    + (filter.scope !== 'all' ? 1 : 0) + (filter.deadline !== 'all' ? 1 : 0);

  return (
    <div className="md:hidden">
      {/* Page title gọn mobile */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-transparent">
          Điều phối công việc
        </h1>
      </div>

      {/* KPI swipe */}
      <div className="mb-4">
        <SwipeKpiBar
          tasks={tasks}
          currentUserUid={currentUserUid}
          currentUserDeptId={currentUserDeptId}
          currentUserFacilityId={currentUserFacilityId}
          active={kpiKey}
          onSelect={selectKpi}
        />
      </div>

      {/* Search + Filter */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm..."
            className="w-full h-11 pl-10 pr-3 rounded-xl bg-white ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="relative h-11 px-3.5 rounded-xl bg-white ring-1 ring-slate-200 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 active:scale-95"
        >
          <SlidersHorizontal size={16} />
          Bộ lọc
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Tabs sticky */}
      <TabsMobile tab={tab} counts={counts} onChange={setTab} />

      {/* Card list */}
      <div className="space-y-3 mt-3 pb-6">
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 ring-1 ring-slate-200">
            Không có công việc phù hợp.
          </div>
        ) : (
          filtered.map((t) => (
            <DispatchCard key={t.id} task={t} onTap={onRowClick} />
          ))
        )}
      </div>

      <FilterSheet
        open={filterOpen}
        value={filter}
        onChange={setFilter}
        onClose={() => setFilterOpen(false)}
      />

      {/* FAB tạo điều phối — sticky bottom-right, an toàn safe-area */}
      {canCreate && (
        <button
          type="button"
          onClick={onCreate}
          aria-label="Tạo điều phối mới"
          className="fixed bottom-[calc(56px+env(safe-area-inset-bottom)+12px)] right-4 z-30 h-14 w-14 rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-xl ring-1 ring-emerald-700/20 flex items-center justify-center active:scale-90 transition"
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
