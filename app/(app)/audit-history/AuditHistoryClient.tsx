'use client';

// PR-7A (2026-06-22) — Audit History client orchestrator.
// Server-side filter: month + branchId (dùng Firestore index)
// Client-side filter: action / module / changedBy / dateRange (trên page ≤100 records)
// Pagination: cursor-based, "Tải thêm" button.
// Mobile: card stack < md. Desktop: table.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BRANCHES, type BranchId } from '@/lib/branches';
import type { AuditHistoryEntry, AuditHistoryResponse } from '@/lib/audit-history/types';
import AuditFilters, { type AuditFiltersState } from './_components/AuditFilters';
import AuditTable from './_components/AuditTable';
import AuditCardStack from './_components/AuditCardStack';
import AuditDetailDrawer from './_components/AuditDetailDrawer';

interface Props {
  roleCode: string;
}

function currentMonthVN(): string {
  const now = new Date();
  // Use UTC + 7 offset
  const vn = new Date(now.getTime() + 7 * 3600 * 1000);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const INITIAL_FILTERS: AuditFiltersState = {
  month: currentMonthVN(),
  branchId: 'all',
  source: 'all',           // PR-7B
  action: '',
  module: 'all',
  changedBy: '',
  dateFrom: '',
  dateTo: '',
};

export default function AuditHistoryClient({ roleCode }: Props) {
  const [filters, setFilters] = useState<AuditFiltersState>(INITIAL_FILTERS);
  const [items, setItems] = useState<AuditHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);  // PR-7B: API warnings (vd thiếu index)
  const [selected, setSelected] = useState<AuditHistoryEntry | null>(null);

  // Fetch page — useCallback để không re-create mỗi render
  const fetchPage = useCallback(
    async (opts: { append: boolean; cursorParam: string | null }) => {
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const qs = new URLSearchParams();
        if (filters.month && filters.month !== 'all') qs.set('month', filters.month);
        if (filters.branchId && filters.branchId !== 'all') qs.set('branchId', filters.branchId);
        if (filters.source && filters.source !== 'all') qs.set('source', filters.source);  // PR-7B
        if (opts.cursorParam) qs.set('cursor', opts.cursorParam);
        qs.set('pageSize', '50');

        const r = await fetch(`/api/audit-history?${qs.toString()}`);
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${r.status}`);
        }
        const json: AuditHistoryResponse = await r.json();

        setItems((prev) => (opts.append ? [...prev, ...json.items] : json.items));
        setCursor(json.nextCursor);
        setHasMore(Boolean(json.nextCursor));
        setWarnings(json.warnings ?? []);  // PR-7B
      } catch (e: any) {
        setError(e?.message ?? 'Lỗi tải dữ liệu');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters.month, filters.branchId, filters.source],   // PR-7B: source trigger refetch
  );

  // Reload khi filter server-side đổi (month/branchId)
  useEffect(() => {
    setItems([]);
    setCursor(null);
    void fetchPage({ append: false, cursorParam: null });
  }, [fetchPage]);

  // Client-side filter: action/module/changedBy/dateRange — áp dụng trên items đã load
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (filters.action && !it.action.toLowerCase().includes(filters.action.toLowerCase())) return false;
      if (filters.module !== 'all' && it.module !== filters.module) return false;
      if (filters.changedBy) {
        const needle = filters.changedBy.toLowerCase();
        if (!it.changedByName.toLowerCase().includes(needle) &&
            !it.changedBy.toLowerCase().includes(needle)) return false;
      }
      if (filters.dateFrom) {
        const fromMs = Date.parse(filters.dateFrom);
        if (!Number.isNaN(fromMs) && it.changedAtMs < fromMs) return false;
      }
      if (filters.dateTo) {
        // dateTo bao gồm cả ngày đó → +1 day
        const toMs = Date.parse(filters.dateTo) + 24 * 3600 * 1000;
        if (!Number.isNaN(toMs) && it.changedAtMs >= toMs) return false;
      }
      return true;
    });
  }, [items, filters.action, filters.module, filters.changedBy, filters.dateFrom, filters.dateTo]);

  const handleLoadMore = () => {
    if (!cursor || loadingMore) return;
    void fetchPage({ append: true, cursorParam: cursor });
  };

  const handleReset = () => setFilters(INITIAL_FILTERS);

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* Header note — ngôn ngữ người dùng (đã bỏ thuật ngữ kỹ thuật) */}
        <div className="card">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">Lịch sử thao tác</span>
            {' — '}
            Chỉ xem. Ghi lại mọi thao tác trên hệ thống.
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            ℹ Lọc theo Tháng/Cơ sở/Nguồn áp dụng cho toàn bộ dữ liệu. Lọc theo Thao tác/Phân hệ/Người/Khoảng ngày áp dụng trên trang đang xem.
          </div>
          <div className="text-xs text-amber-700 mt-1">
            ⚠ Một số bản ghi cũ có thể thiếu thông tin cơ sở/tháng nên không xuất hiện khi lọc cụ thể. Chọn "Tất cả" để xem đầy đủ.
          </div>
        </div>

        {/* PR-7B: warnings từ API (vd 1 source thiếu index) */}
        {warnings.length > 0 && (
          <div className="card bg-amber-50 border border-amber-200">
            <div className="text-sm font-semibold text-amber-800 mb-1">⚠ Cảnh báo từ server</div>
            <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Filters */}
        <AuditFilters
          state={filters}
          onChange={setFilters}
          onReset={handleReset}
        />

        {/* Content */}
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : filteredItems.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <AuditTable items={filteredItems} onSelect={setSelected} />
            </div>
            {/* Mobile card stack */}
            <div className="md:hidden">
              <AuditCardStack items={filteredItems} onSelect={setSelected} />
            </div>

            {/* Footer pagination */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
              <div>
                Hiển thị {filteredItems.length}/{items.length} bản ghi
                {items.length !== filteredItems.length && ' (đã lọc)'}
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingMore ? 'Đang tải...' : 'Tải thêm 50 bản ghi'}
                </button>
              )}
            </div>
          </>
        )}

        {/* Detail drawer */}
        {selected && (
          <AuditDetailDrawer
            entry={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="card text-center py-12 text-slate-400 text-sm">
      Đang tải lịch sử thao tác...
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="card text-center py-12 text-rose-600 text-sm">⚠️ {message}</div>
  );
}

function EmptyState() {
  return (
    <div className="card text-center py-16 text-slate-400">
      <div className="text-5xl mb-3">📭</div>
      <div className="text-base font-medium text-slate-600">
        Chưa có lịch sử thao tác phù hợp với bộ lọc.
      </div>
      <div className="text-sm mt-1.5">
        Thử mở rộng bộ lọc Tháng/Cơ sở hoặc bấm "Reset filter".
      </div>
    </div>
  );
}
