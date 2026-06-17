'use client';

// Tổng kết tháng client.
// Phase 5 (2026-06-17).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight, TrendingUp, Wallet, AlertTriangle, Users } from 'lucide-react';
import { BRANCHES } from '@/lib/branches';
import type { BranchId } from '@/lib/branches';
import type { ScopeRole } from '@/lib/sales-v2/scope';
import type { SalesV2Source } from '@/lib/types/sales-v2';
import { SOURCE_LABEL } from '@/lib/types/sales-v2';

interface Summary {
  ok: true;
  month: string;
  scope: { branchId: string | null; saleId: string | null };
  totals: { sales: number; collected: number; debtGenerated: number; debtRemaining: number; transactions: number };
  bySource: Record<SalesV2Source, { count: number; sales: number; collected: number }>;
  byPackage: Record<string, { name: string; count: number; sales: number; collected: number }>;
  bySale: Record<string, { name: string; count: number; sales: number; collected: number }>;
  byBranch: Record<string, { name: string; count: number; sales: number; collected: number }>;
}

interface Props {
  scope: ScopeRole;
}

function currentMonthVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function fmtMonth(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-');
  return `${m}/${y}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function TongKetClient({ scope }: Props) {
  const [month, setMonth] = useState<string>(currentMonthVN());
  const [branchId, setBranchId] = useState<BranchId | 'all'>('all');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showBranchFilter = scope === 'top';

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ month });
      if (showBranchFilter && branchId !== 'all') qs.set('branchId', branchId);
      const r = await fetch(`/api/sales-v2/monthly-summary?${qs.toString()}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setData(j as Summary);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải');
    } finally {
      setLoading(false);
    }
  }, [month, branchId, showBranchFilter]);

  useEffect(() => { void fetchSummary(); }, [fetchSummary]);

  // Top 5 packages by sales
  const topPackages = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.byPackage)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);
  }, [data]);

  const topSales = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.bySale)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);
  }, [data]);

  const topBranches = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.byBranch)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.sales - a.sales);
  }, [data]);

  const sourceMaxSales = useMemo(() => {
    if (!data) return 0;
    return Math.max(...Object.values(data.bySource).map((s) => s.sales), 1);
  }, [data]);

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* Header + month picker */}
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-800">Tổng kết tháng {fmtMonth(month)}</h1>
              <p className="mt-1 text-sm text-slate-600">
                {scope === 'sale'
                  ? 'Dữ liệu cá nhân của bạn (chỉ tính giao dịch đã được kế toán duyệt).'
                  : scope === 'top'
                    ? 'Toàn hệ thống (chỉ data đã đối chiếu chính thức).'
                    : 'Dữ liệu cơ sở bạn quản lý (đã đối chiếu).'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(month, -1))}
                className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50"
                title="Tháng trước"
              >
                <ChevronLeft size={16} />
              </button>
              <input
                type="month"
                value={month}
                max={currentMonthVN()}
                onChange={(e) => setMonth(e.target.value)}
                className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(month, 1))}
                disabled={month >= currentMonthVN()}
                className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Tháng sau"
              >
                <ChevronRight size={16} />
              </button>
              {showBranchFilter && (
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value as BranchId | 'all')}
                  className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Tất cả cơ sở</option>
                  {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* KPI cards */}
        {loading ? (
          <div className="card flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="animate-spin mr-2" size={20} /> Đang tính tổng kết…
          </div>
        ) : error ? (
          <div className="card text-center py-12 text-rose-600 text-sm">⚠️ {error}</div>
        ) : !data ? null : data.totals.transactions === 0 ? (
          <div className="card text-center py-16 text-slate-400">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-base font-medium text-slate-600">Tháng {fmtMonth(month)} chưa có giao dịch nào đã đối chiếu</div>
            <div className="text-sm mt-1.5">Dashboard chỉ tính dữ liệu đã được kế toán duyệt chính thức.</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard label="Số giao dịch" value={data.totals.transactions.toString()} icon={<Users size={18} />} tone="slate" />
              <KpiCard label="Doanh số" value={fmtMoney(data.totals.sales)} icon={<TrendingUp size={18} />} tone="emerald" />
              <KpiCard label="Thực thu" value={fmtMoney(data.totals.collected)} icon={<Wallet size={18} />} tone="sky" />
              <KpiCard label="Công nợ phát sinh" value={fmtMoney(data.totals.debtGenerated)} icon={<AlertTriangle size={18} />} tone="amber" />
              <KpiCard label="Công nợ còn lại" value={fmtMoney(data.totals.debtRemaining)} icon={<AlertTriangle size={18} />} tone="rose" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* By source */}
              <div className="card">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Doanh số theo nguồn</h3>
                <div className="space-y-2">
                  {(Object.keys(data.bySource) as SalesV2Source[]).map((src) => {
                    const b = data.bySource[src];
                    const pct = Math.round((b.sales / sourceMaxSales) * 100);
                    return (
                      <div key={src}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-slate-700">{SOURCE_LABEL[src]}</span>
                          <span className="text-slate-600 tabular-nums">
                            {b.count} GD · <strong>{fmtMoney(b.sales)}</strong>
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top packages */}
              <div className="card">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Top 5 gói doanh số cao</h3>
                {topPackages.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">Chưa có dữ liệu</div>
                ) : (
                  <div className="space-y-2">
                    {topPackages.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm">
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center tabular-nums">{i + 1}</span>
                        <span className="flex-1 truncate text-slate-700">{p.name}</span>
                        <span className="shrink-0 text-xs text-slate-500 tabular-nums">{p.count} GD</span>
                        <span className="shrink-0 font-semibold text-emerald-700 tabular-nums">{fmtMoney(p.sales)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Top Sale / Top branch — chỉ top role + accountant + qlcs */}
            {(scope === 'top' || scope === 'accountant' || scope === 'qlcs') && Object.keys(data.bySale).length > 0 && (
              <div className="card">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Top Sale theo doanh số</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                      <tr>
                        <th className="px-2 py-2 text-left w-10">#</th>
                        <th className="px-2 py-2 text-left">Tên Sale</th>
                        <th className="px-2 py-2 text-right">Số GD</th>
                        <th className="px-2 py-2 text-right">Doanh số</th>
                        <th className="px-2 py-2 text-right">Thực thu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {topSales.map((s, i) => (
                        <tr key={s.id} className="hover:bg-slate-50/60">
                          <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                          <td className="px-2 py-1.5 text-slate-700 font-medium">{s.name}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{s.count}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{fmtMoney(s.sales)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-sky-700">{fmtMoney(s.collected)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {scope === 'top' && topBranches.length > 0 && (
              <div className="card">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Doanh số theo cơ sở</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                      <tr>
                        <th className="px-2 py-2 text-left">Cơ sở</th>
                        <th className="px-2 py-2 text-right">Số GD</th>
                        <th className="px-2 py-2 text-right">Doanh số</th>
                        <th className="px-2 py-2 text-right">Thực thu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {topBranches.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50/60">
                          <td className="px-2 py-1.5 text-slate-700 font-medium">{b.name}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{b.count}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{fmtMoney(b.sales)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-sky-700">{fmtMoney(b.collected)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function fmtMoney(v: number): string {
  return v.toLocaleString() + 'đ';
}

function KpiCard({ label, value, icon, tone }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'slate' | 'emerald' | 'sky' | 'amber' | 'rose';
}) {
  const cls = {
    slate:   'bg-white text-slate-700 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    sky:     'bg-sky-50 text-sky-700 ring-sky-200',
    amber:   'bg-amber-50 text-amber-700 ring-amber-200',
    rose:    'bg-rose-50 text-rose-700 ring-rose-200',
  }[tone];
  return (
    <div className={`rounded-xl px-3 py-3 ring-1 ${cls}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
        <span className="opacity-50">{icon}</span>
      </div>
      <div className="text-lg font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
