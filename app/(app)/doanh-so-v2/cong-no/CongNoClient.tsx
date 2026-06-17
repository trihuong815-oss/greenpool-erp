'use client';

// Công nợ client.
// Phase 5 (2026-06-17).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, RefreshCw } from 'lucide-react';
import { BRANCHES } from '@/lib/branches';
import type { BranchId } from '@/lib/branches';
import type { ScopeRole } from '@/lib/sales-v2/scope';
import { SkeletonTable } from '@/components/ui/Skeleton';

interface DebtRow {
  id: string;
  date: string;
  month: string;
  customerName: string;
  phone: string;
  packageName: string;
  packageValue: number;
  collectedToday: number;
  debtAmount: number;
  receiptNo: string | null;
  saleName: string;
  branchName: string;
  // V6 PT (2026-06-17): gói tính theo buổi
  packageIsCustomQuantity?: boolean;
  packageUnitName?: string;
  quantity?: number | null;
  unitPrice?: number | null;
}

interface Props {
  scope: ScopeRole;
}

function fmtDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function CongNoClient({ scope }: Props) {
  const [branchId, setBranchId] = useState<BranchId | 'all'>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<DebtRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const showBranchFilter = scope === 'top';

  const fetchDebts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (showBranchFilter && branchId !== 'all') qs.set('branchId', branchId);
      const r = await fetch(`/api/sales-v2/debts?${qs.toString()}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setRows(j.rows as DebtRow[]);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải');
    } finally {
      setLoading(false);
    }
  }, [branchId, showBranchFilter]);

  useEffect(() => { void fetchDebts(); }, [fetchDebts, refreshTick]);

  // Search client-side
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.customerName.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      (r.receiptNo ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    let totalDebt = 0, totalSales = 0, totalCollected = 0;
    const customers = new Set<string>();
    for (const r of filtered) {
      totalDebt += r.debtAmount;
      totalSales += r.packageValue;
      totalCollected += r.collectedToday;
      customers.add(`${r.phone}|${r.customerName.toLowerCase()}`); // dedupe theo phone+name
    }
    return { totalDebt, totalSales, totalCollected, count: filtered.length, uniqueCustomers: customers.size };
  }, [filtered]);

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* Header */}
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-800">Công nợ khách hàng</h1>
              <p className="mt-1 text-sm text-slate-600">
                {scope === 'sale'
                  ? 'Khách của bạn còn nợ — sắp xếp theo nợ lớn nhất trước.'
                  : scope === 'top'
                    ? 'Toàn hệ thống — chỉ tính giao dịch đã đối chiếu.'
                    : 'Khách của cơ sở bạn quản lý.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              Tải lại
            </button>
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Tìm tên / SĐT / Số PT
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="VD: Bé Minh / 0901... / PT001"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            {showBranchFilter && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Cơ sở</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value as BranchId | 'all')}
                  className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Tất cả cơ sở</option>
                  {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Totals summary */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label={`Số GD còn nợ${totals.uniqueCustomers > 0 ? ` (${totals.uniqueCustomers} KH)` : ''}`} value={totals.count.toString()} tone="slate" />
            <Kpi label="Tổng giá gói" value={totals.totalSales.toLocaleString() + 'đ'} tone="emerald" />
            <Kpi label="Đã thu" value={totals.totalCollected.toLocaleString() + 'đ'} tone="sky" />
            <Kpi label="Còn nợ" value={totals.totalDebt.toLocaleString() + 'đ'} tone="rose" />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="card border-rose-200 bg-rose-50/40">
            <div className="text-sm text-rose-700">⚠️ {error}</div>
          </div>
        )}

        {/* Table */}
        <div className="card overflow-hidden p-0">
          {loading && rows.length === 0 ? (
            <div className="p-4">
              <SkeletonTable rows={6} cols={scope === 'top' ? 10 : 9} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              <div className="text-4xl mb-2">✓</div>
              Không có khách nào còn công nợ
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Ngày tạo nợ</th>
                    <th className="px-3 py-2.5 text-left">Tên KH</th>
                    <th className="px-3 py-2.5 text-left">SĐT</th>
                    <th className="px-3 py-2.5 text-left">Gói</th>
                    <th className="px-3 py-2.5 text-left">Số PT</th>
                    {scope !== 'sale' && <th className="px-3 py-2.5 text-left">Sale</th>}
                    {scope === 'top' && <th className="px-3 py-2.5 text-left">Cơ sở</th>}
                    <th className="px-3 py-2.5 text-right">Số buổi</th>
                    <th className="px-3 py-2.5 text-right">Giá gói</th>
                    <th className="px-3 py-2.5 text-right">Đã thu</th>
                    <th className="px-3 py-2.5 text-right">Còn nợ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => {
                    const isPT = r.packageIsCustomQuantity === true;
                    const unit = r.packageUnitName || 'buổi';
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-slate-600 tabular-nums">{fmtDate(r.date)}</td>
                        <td className="px-3 py-2 text-slate-800 font-medium">{r.customerName}</td>
                        <td className="px-3 py-2 text-slate-600 tabular-nums">{r.phone}</td>
                        <td className="px-3 py-2 text-slate-600 truncate max-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{r.packageName}</span>
                            {isPT && (
                              <span className="shrink-0 text-[9px] uppercase font-bold text-violet-700 bg-violet-100 px-1 py-0.5 rounded ring-1 ring-violet-200">
                                PT
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-600 font-mono text-xs">{r.receiptNo ?? '—'}</td>
                        {scope !== 'sale' && <td className="px-3 py-2 text-slate-600">{r.saleName}</td>}
                        {scope === 'top' && <td className="px-3 py-2 text-slate-600">{r.branchName}</td>}
                        <td className="px-3 py-2 text-right tabular-nums">
                          {isPT && r.quantity != null
                            ? <span className="text-violet-700 font-semibold">{r.quantity.toLocaleString()}<span className="text-[10px] text-slate-400 ml-0.5">{unit}</span></span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.packageValue.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-700">{r.collectedToday.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-rose-700">{r.debtAmount.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'emerald' | 'sky' | 'rose' }) {
  const cls = {
    slate:   'bg-slate-50 text-slate-700 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    sky:     'bg-sky-50 text-sky-700 ring-sky-200',
    rose:    'bg-rose-50 text-rose-700 ring-rose-200',
  }[tone];
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${cls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-base font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
