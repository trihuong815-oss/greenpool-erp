'use client';

// PR-TK4B (2026-06-22) — Bảng giao dịch/khách hàng của 1 Sale (shared).
// Reuse markup từ SalesCustomerDrilldown (deprecated). Dùng cho:
//   - SaleCustomerDrawer: hiển thị trong drawer khi top role/QLCS click "Xem khách"
//   - SaleView: render trực tiếp "Khách hàng của tôi"
//
// Read-only — KHÔNG có nút sửa, KHÔNG export CSV.

import { fmtDateShort, fmtMoney, PAY_LABEL, TXN_TYPE_LABEL } from './utils';
import type { SaleCustomerTx } from './types';

interface Props {
  transactions: SaleCustomerTx[];
  /** Empty message khi sale chưa có tx tháng. Default: dùng cho top role/QLCS view. */
  emptyMessage?: string;
}

export default function SaleCustomerTable({ transactions, emptyMessage }: Props) {
  return (
    <div className="overflow-auto rounded-lg ring-1 ring-slate-200 max-h-[70vh]">
      <table className="w-full text-sm min-w-[1000px]">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-semibold sticky top-0 z-10">
          <tr>
            <th scope="col" className="px-2 py-2 text-left w-16">Ngày</th>
            <th scope="col" className="px-2 py-2 text-left">Khách hàng</th>
            <th scope="col" className="px-2 py-2 text-left">SĐT</th>
            <th scope="col" className="px-2 py-2 text-left">Gói</th>
            <th scope="col" className="px-2 py-2 text-left w-28">Loại GD</th>
            <th scope="col" className="px-2 py-2 text-left w-20">HT thu</th>
            <th scope="col" className="px-2 py-2 text-right w-28">Giá trị</th>
            <th scope="col" className="px-2 py-2 text-right w-28">Thực thu</th>
            <th scope="col" className="px-2 py-2 text-right w-28">Công nợ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {transactions.length === 0 ? (
            <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400 text-sm italic">
              {emptyMessage ?? 'Chưa có giao dịch nào đã đối chiếu trong tháng'}
            </td></tr>
          ) : (
            transactions.map((tx) => {
              const isDatCoc = tx.transactionType === 'dat_coc';
              const isTraNot = tx.transactionType === 'thanh_toan_not';
              const isLinked = tx.matchedTransactionId != null;
              return (
                <tr key={tx.id} className={isTraNot ? 'bg-violet-50/30 hover:bg-violet-100/40' : 'hover:bg-slate-50/60'}>
                  <td className="px-2 py-1.5 text-slate-500 tabular-nums whitespace-nowrap">{fmtDateShort(tx.date)}</td>
                  <td className="px-2 py-1.5 text-slate-800 font-medium">{tx.customerName || '—'}</td>
                  <td className="px-2 py-1.5 text-slate-600 tabular-nums">{tx.phone || '—'}</td>
                  <td className="px-2 py-1.5 text-slate-700 truncate max-w-[200px]" title={tx.packageName}>{tx.packageName}</td>
                  <td className="px-2 py-1.5">
                    <span className={`text-xs uppercase font-semibold px-1.5 py-0.5 rounded ring-1 ${
                      isDatCoc ? 'bg-amber-50 text-amber-700 ring-amber-200'
                      : isTraNot ? 'bg-violet-50 text-violet-700 ring-violet-200'
                      : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    }`}>{TXN_TYPE_LABEL[tx.transactionType] ?? tx.transactionType}</span>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-slate-600">{PAY_LABEL[tx.paymentMethod] ?? tx.paymentMethod}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {isTraNot
                      ? <span className="text-slate-300 text-xs" title="Trả nốt — không tạo doanh số mới">—</span>
                      : tx.packageValue.toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-sky-700 font-medium">{tx.collectedToday.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {isDatCoc ? (
                      tx.debtAmount > 0 ? (
                        <span className="text-rose-700 font-semibold" title={`Đã trả nốt ${(tx.originalDebt - tx.debtAmount).toLocaleString()}đ / ${tx.originalDebt.toLocaleString()}đ`}>
                          {tx.debtAmount.toLocaleString()}
                          {tx.originalDebt > tx.debtAmount && (
                            <span className="block text-xs text-slate-400 font-normal">/ {tx.originalDebt.toLocaleString()}</span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold" title="Đã trả đủ nốt">
                          ✓ Đã trả đủ
                        </span>
                      )
                    ) : isTraNot ? (
                      <span className="text-xs text-violet-600 italic" title={isLinked ? `Link với tx ${tx.matchedTransactionId}` : 'Chưa link'}>
                        {isLinked ? '→ link tx cũ' : tx.matchStatus === 'needs_review' ? 'Cần review' : 'Chưa link'}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Hint cho fmtMoney — dùng formatter raw .toLocaleString() trong cell tx
 *  để giữ markup nguyên với drilldown cũ (đỡ regression visual). */
void fmtMoney;
