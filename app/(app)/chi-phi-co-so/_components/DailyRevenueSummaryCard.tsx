'use client';

// PR-CASH1C: Card hiển thị tổng thu ngày — nguồn từ /api/sales-v2/daily-summary.
// Read-only: số liệu thu KHÔNG sửa được ở màn này.

import { Wallet, RefreshCw, AlertTriangle } from 'lucide-react';
import type { DailySummaryResponse } from '@/lib/services/finance/api-client';

interface Props {
  summary: DailySummaryResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString('vi-VN');
}

export function DailyRevenueSummaryCard({ summary, loading, error, onRefresh }: Props) {
  const totals = summary?.grandTotals ?? { cash: 0, transfer: 0, card: 0, total: 0 };
  const isZero = summary != null && totals.total === 0;

  return (
    <div className="card">
      <div className="card-title">
        <Wallet size={16} className="text-emerald-600" />
        <span>Tổng thu ngày</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        Nguồn thu lấy từ Đối chiếu doanh số / Tổng hợp doanh thu ngày. Không sửa số thu tại màn này.
      </p>

      {error ? (
        <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 ring-1 ring-rose-200">{error}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCell label="Tiền mặt"      value={totals.cash} loading={loading} />
          <SummaryCell label="Chuyển khoản"  value={totals.transfer} loading={loading} />
          <SummaryCell label="Quẹt thẻ"      value={totals.card} loading={loading} />
          <SummaryCell label="Tổng thu"      value={totals.total} loading={loading} highlight />
        </div>
      )}

      {!loading && !error && isZero && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 ring-1 ring-amber-200">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <span>
            Ngày này chưa có doanh thu hoặc dữ liệu doanh thu chưa được ghi nhận đủ.
            Vẫn có thể nộp báo cáo nếu đúng thực tế.
          </span>
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value, loading, highlight }: { label: string; value: number; loading: boolean; highlight?: boolean }) {
  return (
    <div className={[
      'rounded-lg px-3 py-2 ring-1',
      highlight ? 'bg-emerald-50 ring-emerald-200' : 'bg-slate-50 ring-slate-200',
    ].join(' ')}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={[
        'text-lg font-bold tabular-nums',
        highlight ? 'text-emerald-700' : 'text-slate-800',
      ].join(' ')}>
        {loading ? '…' : fmt(value)} ₫
      </div>
    </div>
  );
}
