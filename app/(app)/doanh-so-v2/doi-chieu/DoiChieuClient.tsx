'use client';

// Đối chiếu doanh số — orchestrator.
// Phase 2 (2026-06-17): list batches + filter + click row → mở detail modal với 3 action.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, ClipboardCheck, Calculator } from 'lucide-react';
import type { SalesDailyBatch, BatchStatus } from '@/lib/types/sales-v2';
import type { BranchId } from '@/lib/branches';
import { BRANCHES } from '@/lib/branches';
import type { ScopeRole } from '@/lib/sales-v2/scope';
import BatchList from './_components/BatchList';
import BatchDetailModal from './_components/BatchDetailModal';
import DailySummaryView from './_components/DailySummaryView';

interface Props {
  myRoleCode: string;
  myBranchId: BranchId | null;
  scope: ScopeRole;
  canReview: boolean; // NV_KE / TP_KE / top role
}

const TABS: Array<{ value: BatchStatus | 'all'; label: string; cls: string }> = [
  { value: 'pending_review', label: 'Chờ đối chiếu',     cls: 'data-[active=true]:bg-amber-50 data-[active=true]:text-amber-700 data-[active=true]:ring-amber-300' },
  { value: 'approved',       label: 'Đã đối chiếu',      cls: 'data-[active=true]:bg-emerald-50 data-[active=true]:text-emerald-700 data-[active=true]:ring-emerald-300' },
  { value: 'returned',       label: 'Đã trả lại',        cls: 'data-[active=true]:bg-rose-50 data-[active=true]:text-rose-700 data-[active=true]:ring-rose-300' },
  { value: 'draft',          label: 'Đang nhập',         cls: 'data-[active=true]:bg-slate-100 data-[active=true]:text-slate-700 data-[active=true]:ring-slate-300' },
  { value: 'all',            label: 'Tất cả',            cls: 'data-[active=true]:bg-violet-50 data-[active=true]:text-violet-700 data-[active=true]:ring-violet-300' },
];

// V8 Phase 2 (2026-06-18): main tab switcher — 'doi-chieu' (batch review) vs 'tong-hop' (daily summary).
type MainView = 'doi-chieu' | 'tong-hop';

export default function DoiChieuClient({ scope, canReview, myBranchId }: Props) {
  const [view, setView] = useState<MainView>('doi-chieu');
  const [tab, setTab] = useState<BatchStatus | 'all'>('pending_review');
  const [branchId, setBranchId] = useState<BranchId | 'all'>(
    scope === 'top' ? 'all' : ((myBranchId as BranchId) ?? 'all'),
  );
  const [date, setDate] = useState(''); // YYYY-MM-DD optional
  const [allBatches, setAllBatches] = useState<SalesDailyBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<SalesDailyBatch | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const showBranchFilter = scope === 'top';

  // Fetch all status 1 lần → count + filter client-side. Endpoint trả limit 200.
  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('limit', '200');
      if (branchId !== 'all' && scope === 'top') qs.set('branchId', branchId);
      if (date) qs.set('date', date);
      const r = await fetch(`/api/sales-v2/batches?${qs.toString()}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      const j = await r.json();
      setAllBatches(j.batches as SalesDailyBatch[]);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải danh sách');
    } finally {
      setLoading(false);
    }
  }, [branchId, date, scope]);

  useEffect(() => {
    void fetchBatches();
  }, [fetchBatches, refreshTick]);

  const handleAfterAction = useCallback(() => {
    setSelectedBatch(null);
    setRefreshTick((t) => t + 1);
  }, []);

  // Counts per tab + filtered batches theo tab active
  const counts = useMemo(() => {
    const c: Record<BatchStatus | 'all', number> = {
      draft: 0, pending_review: 0, approved: 0, returned: 0, locked: 0, all: allBatches.length,
    };
    for (const b of allBatches) c[b.status]++;
    return c;
  }, [allBatches]);

  const batches = useMemo(() => {
    if (tab === 'all') return allBatches;
    return allBatches.filter((b) => b.status === tab);
  }, [allBatches, tab]);

  const summary = useMemo(() => {
    let sales = 0, collected = 0;
    for (const b of batches) {
      sales += b.totalSalesAmount;
      collected += b.totalCollectedAmount;
    }
    return { count: batches.length, sales, collected, debt: Math.max(0, sales - collected) };
  }, [batches]);

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* V8 Phase 2: main view switcher tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 -mb-2">
          <button type="button" onClick={() => setView('doi-chieu')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium border-b-2 transition ${
              view === 'doi-chieu'
                ? 'bg-white text-emerald-700 border-emerald-600 -mb-px'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
            }`}>
            <ClipboardCheck size={14} /> Đối chiếu batch
          </button>
          <button type="button" onClick={() => setView('tong-hop')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium border-b-2 transition ${
              view === 'tong-hop'
                ? 'bg-white text-emerald-700 border-emerald-600 -mb-px'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
            }`}>
            <Calculator size={14} /> Tổng hợp doanh thu ngày
          </button>
        </div>

        {view === 'tong-hop' ? (
          <DailySummaryView
            defaultBranch={(scope === 'top' ? 'all' : (myBranchId ?? 'all')) as BranchId | 'all'}
            allowSwitchBranch={scope === 'top'}
            callerBranch={myBranchId}
          />
        ) : (<>
        {/* Header */}
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-800">Đối chiếu doanh số</h1>
              <p className="mt-1 text-sm text-slate-600">
                {canReview
                  ? 'Click 1 dòng để xem chi tiết và duyệt / trả lại Sale.'
                  : 'Xem danh sách batch của các Sale trong cơ sở.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              Tải lại
            </button>
          </div>

          {/* Filters: branch + date (status đã chuyển sang tab) */}
          {(showBranchFilter || true) && (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              {showBranchFilter && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Cơ sở
                  </label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value as BranchId | 'all')}
                    className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">Tất cả cơ sở</option>
                    {BRANCHES.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Ngày
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {date && (
                <button
                  type="button"
                  onClick={() => setDate('')}
                  className="px-2 py-2 text-xs text-slate-500 hover:text-slate-700 self-end"
                >
                  Bỏ lọc ngày
                </button>
              )}
            </div>
          )}

          {/* Tabs theo status với count badge */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const active = tab === t.value;
              const n = counts[t.value];
              return (
                <button
                  key={t.value}
                  type="button"
                  data-active={active}
                  onClick={() => setTab(t.value)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ring-1 ring-transparent bg-white text-slate-600 hover:bg-slate-50 transition ${t.cls}`}
                >
                  <span>{t.label}</span>
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-bold tabular-nums ${
                    active ? 'bg-white/70 text-slate-700' : 'bg-slate-100 text-slate-500'
                  }`}>{n}</span>
                </button>
              );
            })}
          </div>

          {/* Summary KPI (theo tab active) */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <Kpi label="Số batch" value={summary.count.toString()} tone="slate" />
            <Kpi label="Tổng doanh số" value={summary.sales.toLocaleString() + ' đ'} tone="emerald" />
            <Kpi label="Tổng thực thu" value={summary.collected.toLocaleString() + ' đ'} tone="sky" />
            <Kpi label="Tổng công nợ" value={summary.debt.toLocaleString() + ' đ'} tone="rose" />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="card border-rose-200 bg-rose-50/40">
            <div className="text-sm text-rose-700">⚠️ {error}</div>
          </div>
        )}

        {/* List */}
        <BatchList
          batches={batches}
          loading={loading}
          onSelect={(b) => setSelectedBatch(b)}
        />
        </>)}
      </div>

      {/* Detail modal — chỉ hiện ở view 'doi-chieu' */}
      {selectedBatch && (
        <BatchDetailModal
          batch={selectedBatch}
          canReview={canReview}
          onClose={() => setSelectedBatch(null)}
          onAfterAction={handleAfterAction}
        />
      )}
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
