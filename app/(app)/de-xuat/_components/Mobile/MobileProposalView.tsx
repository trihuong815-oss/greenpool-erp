'use client';

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Plus } from 'lucide-react';
import type { ProposalV6 } from '../types';
import SwipeKpiBar, { type MobileKpiKey } from './SwipeKpiBar';
import TabsMobile, { type MobileTabKey } from './TabsMobile';
import FilterSheet, { type FilterState, DEFAULT_FILTER } from './FilterSheet';
import ProposalCard from './ProposalCard';

// V6.4 (2026-06-13): Mobile shell đề xuất — spec anh chốt.

interface Props {
  proposals: ProposalV6[];
  currentUserUid: string;
  canCreate: boolean;
  onCreate: () => void;
  onRowClick: (p: ProposalV6) => void;
}

export default function MobileProposalView({ proposals, currentUserUid, canCreate, onCreate, onRowClick }: Props) {
  const [kpiKey, setKpiKey] = useState<MobileKpiKey | null>(null);
  const [tab, setTab] = useState<MobileTabKey>('all');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);

  function selectKpi(k: MobileKpiKey | null) {
    setKpiKey(k);
    if (k === 'toi-tao') setTab('mine');
    else if (k === 'cho-duyet') setTab('cho-duyet');
    else if (k === 'can-bo-sung') setTab('can-bo-sung');
    else if (k === 'da-phe-duyet' || k === 'da-chuyen-dp') setTab('da-duyet');
    else setTab('all');
  }

  const counts: Record<MobileTabKey, number> = useMemo(() => {
    let all = 0, mine = 0, choDuyet = 0, canBoSung = 0, daDuyet = 0;
    for (const p of proposals) {
      all += 1;
      if (p.creatorUid === currentUserUid) mine += 1;
      const s = String(p.status);
      if (s === 'da_gui' || s === 'dang_xem_xet') choDuyet += 1;
      if (s === 'yeu_cau_bo_sung') canBoSung += 1;
      if (s === 'da_phe_duyet' || s === 'dong_y_nguyen_tac' || s === 'chuyen_dieu_phoi') daDuyet += 1;
    }
    return { all, mine, 'cho-duyet': choDuyet, 'can-bo-sung': canBoSung, 'da-duyet': daDuyet };
  }, [proposals, currentUserUid]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proposals.filter((p) => {
      const s = String(p.status);
      if (tab === 'mine' && p.creatorUid !== currentUserUid) return false;
      if (tab === 'cho-duyet' && !(s === 'da_gui' || s === 'dang_xem_xet')) return false;
      if (tab === 'can-bo-sung' && s !== 'yeu_cau_bo_sung') return false;
      if (tab === 'da-duyet' && !(s === 'da_phe_duyet' || s === 'dong_y_nguyen_tac' || s === 'chuyen_dieu_phoi')) return false;
      if (q && !(p.title?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q))) return false;
      if (filter.kind !== 'all' && p.kind !== filter.kind) return false;
      if (filter.scope !== 'all' && p.unitsScope !== filter.scope) return false;
      return true;
    });
  }, [proposals, tab, search, filter, currentUserUid]);

  const activeFilterCount = (filter.kind !== 'all' ? 1 : 0) + (filter.scope !== 'all' ? 1 : 0);

  return (
    <div className="md:hidden">
      {/* Title gọn mobile */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-transparent">
          Đề xuất
        </h1>
      </div>

      {/* KPI swipe */}
      <div className="mb-4">
        <SwipeKpiBar proposals={proposals} currentUserUid={currentUserUid} active={kpiKey} onSelect={selectKpi} />
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
            Không có đề xuất phù hợp.
          </div>
        ) : (
          filtered.map((p) => <ProposalCard key={p.id} proposal={p} onTap={onRowClick} />)
        )}
      </div>

      <FilterSheet open={filterOpen} value={filter} onChange={setFilter} onClose={() => setFilterOpen(false)} />

      {/* FAB tạo đề xuất */}
      {canCreate && (
        <button
          type="button"
          onClick={onCreate}
          aria-label="Tạo đề xuất mới"
          className="fixed bottom-[calc(56px+env(safe-area-inset-bottom)+12px)] right-4 z-30 h-14 w-14 rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-xl ring-1 ring-emerald-700/20 flex items-center justify-center active:scale-90 transition"
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
