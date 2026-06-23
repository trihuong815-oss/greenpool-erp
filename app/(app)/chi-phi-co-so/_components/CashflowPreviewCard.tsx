'use client';

// PR-CASH1C: Preview tổng chi & net trước khi nộp báo cáo.
// Tính từ daily-summary (revenue) + expense list (chỉ status='recorded').

import { useMemo } from 'react';
import { Calculator, AlertTriangle } from 'lucide-react';
import type { DailySummaryResponse, ExpenseDoc } from '@/lib/services/finance/api-client';

interface Props {
  revenue: DailySummaryResponse | null;
  expenses: ExpenseDoc[];
}

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

export function CashflowPreviewCard({ revenue, expenses }: Props) {
  const computed = useMemo(() => {
    const recorded = expenses.filter((e) => e.status === 'recorded');
    const expTotal = { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };
    for (const e of recorded) {
      expTotal[e.paymentMethod] += e.amount;
      expTotal.total += e.amount;
    }
    const rev = revenue?.grandTotals ?? { cash: 0, transfer: 0, card: 0, total: 0 };
    const net = {
      cash:     rev.cash     - expTotal.cash,
      transfer: rev.transfer - expTotal.transfer,
      card:     rev.card     - expTotal.card,
      other:    0            - expTotal.other,
      total:    rev.total    - expTotal.total,
    };
    return { exp: expTotal, rev, net, hasOther: expTotal.other > 0, recordedCount: recorded.length };
  }, [revenue, expenses]);

  return (
    <div className="card">
      <div className="card-title">
        <Calculator size={16} className="text-emerald-600" />
        <span>Tổng hợp Thu - Chi - Net (tạm tính {computed.recordedCount} phiếu đã ghi nhận)</span>
      </div>

      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-left py-2 px-2 pl-5 font-medium">Phương thức</th>
              <th className="text-right py-2 px-2 font-medium">Thu</th>
              <th className="text-right py-2 px-2 font-medium">Chi</th>
              <th className="text-right py-2 px-2 pr-5 font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Tiền mặt"     rev={computed.rev.cash}     exp={computed.exp.cash}     net={computed.net.cash} />
            <Row label="Chuyển khoản" rev={computed.rev.transfer} exp={computed.exp.transfer} net={computed.net.transfer} />
            <Row label="Quẹt thẻ"     rev={computed.rev.card}     exp={computed.exp.card}     net={computed.net.card} />
            <Row label="Khác"         rev={0}                     exp={computed.exp.other}    net={computed.net.other} dim={!computed.hasOther} />
            <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold">
              <td className="py-2 px-2 pl-5">Tổng</td>
              <td className="py-2 px-2 text-right tabular-nums text-emerald-700">{fmt(computed.rev.total)} ₫</td>
              <td className="py-2 px-2 text-right tabular-nums text-rose-700">{fmt(computed.exp.total)} ₫</td>
              <td className={`py-2 px-2 pr-5 text-right tabular-nums ${computed.net.total < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(computed.net.total)} ₫</td>
            </tr>
          </tbody>
        </table>
      </div>

      {computed.hasOther && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 ring-1 ring-amber-200">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <span>
            Có khoản chi bằng phương thức Khác. Net khác sẽ được tính âm vì nguồn thu hiện chỉ có tiền mặt/chuyển khoản/quẹt thẻ.
          </span>
        </div>
      )}
    </div>
  );
}

function Row({ label, rev, exp, net, dim }: { label: string; rev: number; exp: number; net: number; dim?: boolean }) {
  return (
    <tr className={`border-b border-slate-100 ${dim ? 'text-slate-400' : ''}`}>
      <td className="py-2 px-2 pl-5">{label}</td>
      <td className="py-2 px-2 text-right tabular-nums">{fmt(rev)} ₫</td>
      <td className="py-2 px-2 text-right tabular-nums">{fmt(exp)} ₫</td>
      <td className={`py-2 px-2 pr-5 text-right tabular-nums font-medium ${net < 0 ? 'text-rose-600' : net > 0 ? 'text-emerald-700' : ''}`}>{fmt(net)} ₫</td>
    </tr>
  );
}
