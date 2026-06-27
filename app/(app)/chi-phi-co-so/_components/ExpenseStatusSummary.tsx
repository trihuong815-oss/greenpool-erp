'use client';

// PR-CASH1C-REFINE: Tổng hợp CHI trong ngày — KHÔNG bao gồm thu/net.
// Mục đích: cho NV_KE/TP_KE/QLCS thấy nhanh tổng chi và phân bố theo trạng thái phiếu.
// PR-CHIPHI-NORMALIZE (2026-06-27): 5 MethodCell custom (pastel ring + hover
// translate-y + gradient highlight + text font-bold riêng) → SegmentSummary
// nhất quán với pattern /tong-ket+/bao-cao-thu-chi+/de-xuat+/dieu-phoi.
// Status pill row giữ — đây là chip filter mini, context khác snapshot.

import { useMemo } from 'react';
import { EXPENSE_STATUS_LABEL, type ExpenseStatus } from '@/lib/finance/expense-types';
import type { ExpenseDoc } from '@/lib/services/finance/api-client';
import { SegmentSummary } from '@/components/ui/StatCard';

interface Props {
  expenses: ExpenseDoc[];
}

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

const STATUS_PILL: Record<ExpenseStatus, string> = {
  draft:    'bg-slate-100 text-slate-700 ring-slate-200',
  recorded: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  returned: 'bg-rose-50 text-rose-700 ring-rose-200',
  voided:   'bg-slate-100 text-slate-500 ring-slate-200',
};

export function ExpenseStatusSummary({ expenses }: Props) {
  const stats = useMemo(() => {
    const recorded = expenses.filter((e) => e.status === 'recorded');
    const byMethod = { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };
    for (const e of recorded) {
      byMethod[e.paymentMethod] += e.amount;
      byMethod.total += e.amount;
    }
    const byStatus: Record<ExpenseStatus, number> = { draft: 0, recorded: 0, returned: 0, voided: 0 };
    for (const e of expenses) byStatus[e.status] += 1;
    return { byMethod, byStatus, recordedCount: recorded.length };
  }, [expenses]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 px-1">
        Tổng chi đã ghi nhận
        <span className="text-xs font-normal text-slate-500">({stats.recordedCount} phiếu)</span>
      </div>

      <SegmentSummary
        items={[
          { n: `${fmt(stats.byMethod.cash)} ₫`,     label: 'Tiền mặt',     tone: 'default' },
          { n: `${fmt(stats.byMethod.transfer)} ₫`, label: 'Chuyển khoản', tone: 'default' },
          { n: `${fmt(stats.byMethod.card)} ₫`,     label: 'Quẹt thẻ',     tone: 'default' },
          { n: `${fmt(stats.byMethod.other)} ₫`,    label: 'Khác',         tone: 'default' },
          { n: `${fmt(stats.byMethod.total)} ₫`,    label: 'Tổng chi',     tone: 'success' },
        ]}
      />

      {/* Status breakdown — chip mini, context khác snapshot KPI */}
      <div className="flex flex-wrap gap-2 text-xs px-1">
        {(Object.keys(stats.byStatus) as ExpenseStatus[])
          .filter((s) => stats.byStatus[s] > 0)
          .map((s) => (
            <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 font-medium ${STATUS_PILL[s]}`}>
              {EXPENSE_STATUS_LABEL[s]}: <span className="tabular-nums">{stats.byStatus[s]}</span>
            </span>
          ))}
        {expenses.length === 0 && (
          <span className="text-slate-400">Chưa có phiếu chi nào.</span>
        )}
      </div>
    </div>
  );
}
