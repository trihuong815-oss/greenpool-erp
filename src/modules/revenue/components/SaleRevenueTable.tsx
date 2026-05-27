'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Users } from 'lucide-react';
import type { SaleRevenue } from '../types';
import {
  formatCurrencyShort, formatCurrency, formatPercent,
  progressPercent, STATUS_LABEL, classifyStatus,
} from '../utils/revenueFormat';
import { RevenueProgressBar } from './RevenueProgressBar';

interface Props {
  sales: SaleRevenue[];
  title?: string;
  branchFilter?: string | null;
  highlightSaleId?: string | null;
  emptyText?: string;
}

type SortKey = 'name' | 'branch' | 'revenue' | 'target' | 'progress' | 'deals';
type SortDir = 'asc' | 'desc';

export function SaleRevenueTable({ sales, title, branchFilter, highlightSaleId, emptyText }: Props) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = sales.slice();
    if (branchFilter) list = list.filter(x => x.branchId === branchFilter);
    if (s) list = list.filter(x =>
      x.saleName.toLowerCase().includes(s) || x.branchName.toLowerCase().includes(s)
    );
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name':     return a.saleName.localeCompare(b.saleName, 'vi') * dir;
        case 'branch':   return a.branchName.localeCompare(b.branchName, 'vi') * dir;
        case 'revenue':  return (a.revenue - b.revenue) * dir;
        case 'target':   return (a.target - b.target) * dir;
        case 'deals':    return (a.deals - b.deals) * dir;
        case 'progress': return (progressPercent(a.revenue, a.target) - progressPercent(b.revenue, b.target)) * dir;
      }
    });
    return list;
  }, [sales, search, sortKey, sortDir, branchFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' || key === 'branch' ? 'asc' : 'desc'); }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <ArrowUpDown size={11} className="inline opacity-30" />;
    return sortDir === 'asc'
      ? <ArrowUp size={11} className="inline text-emerald-700" />
      : <ArrowDown size={11} className="inline text-emerald-700" />;
  }

  return (
    <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-emerald-700" />
          <h3 className="font-semibold text-slate-800">
            {title || 'Doanh thu nhân viên Sale'}
          </h3>
          <span className="text-xs text-slate-500">({filtered.length})</span>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm sale hoặc cơ sở…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white w-64"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-3xl mb-2">🔍</div>
          <p className="text-sm text-slate-500">
            {emptyText || 'Không có sale nào khớp bộ lọc.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left border-b border-slate-200">
                <Th onClick={() => toggleSort('name')}>Sale {sortIcon('name')}</Th>
                <Th onClick={() => toggleSort('branch')}>Cơ sở {sortIcon('branch')}</Th>
                <Th onClick={() => toggleSort('revenue')} className="text-right">Doanh thu {sortIcon('revenue')}</Th>
                <Th onClick={() => toggleSort('target')} className="text-right">Mục tiêu {sortIcon('target')}</Th>
                <Th onClick={() => toggleSort('progress')} className="w-44">% Hoàn thành {sortIcon('progress')}</Th>
                <Th onClick={() => toggleSort('deals')} className="text-right">Deals {sortIcon('deals')}</Th>
                <Th className="text-right">Trạng thái</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const pct = progressPercent(s.revenue, s.target);
                const status = STATUS_LABEL[classifyStatus(pct)];
                const isHighlight = highlightSaleId === s.saleId;
                return (
                  <tr key={s.id}
                    className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${isHighlight ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-xs font-bold flex items-center justify-center">
                          {s.saleName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{s.saleName}</div>
                          {isHighlight && <div className="text-[10px] text-amber-700">★ Bạn</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{s.branchName}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-bold text-slate-900">{formatCurrencyShort(s.revenue)}</div>
                      <div className="text-[10px] text-slate-400">{formatCurrency(s.revenue)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{formatCurrencyShort(s.target)}</td>
                    <td className="px-3 py-2.5">
                      <RevenueProgressBar percent={pct} size="sm" showLabel={false} />
                      <div className="text-right text-xs font-mono mt-1 text-slate-600">{formatPercent(pct)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{s.deals}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider ${onClick ? 'cursor-pointer select-none hover:bg-slate-100' : ''} ${className}`}
    >
      {children}
    </th>
  );
}
