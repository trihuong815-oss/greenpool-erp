'use client';

// PR-TK4A (2026-06-22) — Layout cho NV_SALE / NV_SALE_PT.
// PR-TK4D (2026-06-22) — Thêm pagination 50/page khi >50 GD + empty state Sale.

import { useEffect, useMemo, useState } from 'react';
import { Users, ChevronLeft, ChevronRight } from 'lucide-react';
import MonthlyKpiCards from '../MonthlyKpiCards';
import BusinessAlerts from '../BusinessAlerts';
import TargetProgressCard from '../TargetProgressCard';
import SaleCustomerTable from '../SaleCustomerTable';
import type { Summary } from '../types';

interface Props {
  data: Summary;
  /** uid của Sale đang login — tìm row trong salesCustomers. */
  uid: string;
}

const PAGE_SIZE = 50;

export default function SaleView({ data, uid }: Props) {
  // PR-TK4B: Sale render trực tiếp "Khách hàng của tôi" — KHÔNG dùng ranking/drawer.
  // Server đã enforce: salesCustomers chỉ chứa Sale của mình (1 entry hoặc rỗng).
  const myCustomers = data.salesCustomers?.[uid] ?? null;
  const transactions = myCustomers?.transactions ?? [];

  // PR-TK4D: Pagination 50/page khi >50 GD. Reset page=1 khi data đổi.
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const showPagination = transactions.length > PAGE_SIZE;

  useEffect(() => {
    // Reset page khi data (month) đổi
    setPage(1);
  }, [transactions]);

  const pageTxs = useMemo(() => {
    if (!showPagination) return transactions;
    const start = (page - 1) * PAGE_SIZE;
    return transactions.slice(start, start + PAGE_SIZE);
  }, [transactions, page, showPagination]);

  return (
    <>
      <BusinessAlerts data={data} />

      <MonthlyKpiCards
        totals={data.totals}
        customerCount={data.customerCount}
        pendingReviewCount={(data.txStatusStats?.pending ?? 0) + (data.batchStats?.pendingReview ?? 0)}
      />

      <TargetProgressCard targetSummary={data.targetSummary} />

      <div className="card">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Users size={16} className="text-emerald-600" />
          Khách hàng của tôi ({transactions.length} giao dịch)
          {showPagination && (
            <span className="text-xs text-slate-500 font-normal ml-1">
              · trang {page}/{totalPages}
            </span>
          )}
        </h3>

        <SaleCustomerTable
          transactions={pageTxs}
          emptyMessage="Bạn chưa có giao dịch nào trong tháng này."
        />

        {showPagination && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, transactions.length)} / {transactions.length} giao dịch
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium ring-1 ring-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
                Trước
              </button>
              <span className="text-xs text-slate-600 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium ring-1 ring-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Sau
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
