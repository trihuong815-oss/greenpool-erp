'use client';

// PR-CASH1C-REFINE: Tổng hợp CHI trong ngày — KHÔNG bao gồm thu/net.
// Mục đích: cho NV_KE/TP_KE/QLCS thấy nhanh tổng chi và phân bố theo trạng thái phiếu.

import { useMemo } from 'react';
import { Receipt, Wallet, ArrowRightLeft, CreditCard, MoreHorizontal } from 'lucide-react';
import { EXPENSE_STATUS_LABEL, type ExpenseStatus } from '@/lib/finance/expense-types';
import type { ExpenseDoc } from '@/lib/services/finance/api-client';

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
    <div className="card">
      <div className="card-title">
        <Receipt size={16} className="text-emerald-600" />
        <span>Tổng chi trong ngày ({stats.recordedCount} phiếu đã ghi nhận)</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MethodCell icon={<Wallet size={14} />} label="Tiền mặt" value={stats.byMethod.cash} />
        <MethodCell icon={<ArrowRightLeft size={14} />} label="Chuyển khoản" value={stats.byMethod.transfer} />
        <MethodCell icon={<CreditCard size={14} />} label="Quẹt thẻ" value={stats.byMethod.card} />
        <MethodCell icon={<MoreHorizontal size={14} />} label="Khác" value={stats.byMethod.other} dim={stats.byMethod.other === 0} />
        <MethodCell icon={<Receipt size={14} />} label="Tổng chi" value={stats.byMethod.total} highlight />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {(Object.keys(stats.byStatus) as ExpenseStatus[])
          .filter((s) => stats.byStatus[s] > 0)
          .map((s) => (
            <span key={s} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ring-1 font-medium ${STATUS_PILL[s]}`}>
              {EXPENSE_STATUS_LABEL[s]}: <span className="tabular-nums">{stats.byStatus[s]}</span>
            </span>
          ))}
        {expenses.length === 0 && (
          <span className="text-slate-400">Chưa có phiếu chi nào trong ngày.</span>
        )}
      </div>
    </div>
  );
}

function MethodCell({ icon, label, value, highlight, dim }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean; dim?: boolean }) {
  return (
    <div className={[
      'rounded-lg px-3 py-2.5 ring-1 transition-all duration-200',
      'hover:-translate-y-0.5 hover:shadow-md',
      highlight
        ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 ring-emerald-300 shadow-sm'
        : 'bg-white ring-slate-200 hover:ring-slate-300',
      dim ? 'opacity-60' : '',
    ].join(' ')}>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${highlight ? 'text-emerald-700' : 'text-slate-500'}`}>{icon}{label}</div>
      <div className={[
        'text-base md:text-lg font-bold tabular-nums mt-0.5',
        highlight ? 'text-emerald-700' : 'text-slate-800',
      ].join(' ')}>
        {fmt(value)} ₫
      </div>
    </div>
  );
}
