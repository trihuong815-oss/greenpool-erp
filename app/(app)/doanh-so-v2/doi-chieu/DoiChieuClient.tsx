'use client';

// Đối chiếu doanh số — orchestrator.
// Phase 2 (2026-06-17): list batches + filter + click row → mở detail modal với 3 action.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Filter as FilterIcon, RefreshCw } from 'lucide-react';
import type { SalesDailyBatch, BatchStatus } from '@/lib/types/sales-v2';
import type { BranchId } from '@/lib/branches';
import { BRANCHES } from '@/lib/branches';
import type { ScopeRole } from '@/lib/sales-v2/scope';
import BatchList from './_components/BatchList';
import BatchDetailModal from './_components/BatchDetailModal';

interface Props {
  myRoleCode: string;
  myBranchId: BranchId | null;
  scope: ScopeRole;
  canReview: boolean; // NV_KE / TP_KE / top role
}

const STATUS_FILTER_OPTIONS: Array<{ value: BatchStatus | 'all'; label: string }> = [
  { value: 'pending_review', label: 'Chờ đối chiếu' },
  { value: 'approved',       label: 'Đã đối chiếu' },
  { value: 'returned',       label: 'Đã trả lại' },
  { value: 'draft',          label: 'Đang nhập' },
  { value: 'all',            label: 'Tất cả' },
];

export default function DoiChieuClient({ scope, canReview, myBranchId }: Props) {
  const [status, setStatus] = useState<BatchStatus | 'all'>('pending_review');
  const [branchId, setBranchId] = useState<BranchId | 'all'>(
    scope === 'top' ? 'all' : ((myBranchId as BranchId) ?? 'all'),
  );
  const [date, setDate] = useState(''); // YYYY-MM-DD optional
  const [batches, setBatches] = useState<SalesDailyBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<SalesDailyBatch | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const showBranchFilter = scope === 'top'; // kế toán/QLCS auto scope cơ sở mình

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (status !== 'all') qs.set('status', status);
      if (branchId !== 'all' && scope === 'top') qs.set('branchId', branchId);
      if (date) qs.set('date', date);
      const r = await fetch(`/api/sales-v2/batches?${qs.toString()}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      const j = await r.json();
      setBatches(j.batches as SalesDailyBatch[]);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải danh sách');
    } finally {
      setLoading(false);
    }
  }, [status, branchId, date, scope]);

  useEffect(() => {
    void fetchBatches();
  }, [fetchBatches, refreshTick]);

  const handleAfterAction = useCallback(() => {
    setSelectedBatch(null);
    setRefreshTick((t) => t + 1);
  }, []);

  const summary = useMemo(() => {
    let count = batches.length;
    let sales = 0, collected = 0;
    for (const b of batches) {
      sales += b.totalSalesAmount;
      collected += b.totalCollectedAmount;
    }
    return { count, sales, collected, debt: Math.max(0, sales - collected) };
  }, [batches]);

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4">
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

          {/* Filters */}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                <FilterIcon size={12} className="inline mr-1" /> Trạng thái
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BatchStatus | 'all')}
                className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
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
                className="px-2 py-2 text-xs text-slate-500 hover:text-slate-700"
              >
                Bỏ lọc ngày
              </button>
            )}
          </div>

          {/* Summary KPI */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
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
      </div>

      {/* Detail modal */}
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
