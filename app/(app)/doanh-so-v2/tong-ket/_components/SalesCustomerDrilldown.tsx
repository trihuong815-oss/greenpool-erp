'use client';

// PR-TK1 (2026-06-21) — V8.X "Khách hàng theo Sale" drill-down.
// Tách từ TongKetClient.tsx — gộp BranchChipFilter + SaleTabs + TxTable.
// CHỈ refactor — không đổi logic state, filter, sort, format.
//
// ⚠️ DEPRECATED — PR-TK4B (2026-06-22):
// File này KHÔNG còn được sử dụng trong 5 view (TopExecutive/Accountant/Qlcs/Sale/ReadOnlyAudit).
// Pattern card ngang Sale + tabs đã được THAY bằng SaleRankingTable + SaleCustomerDrawer
// (top role/QLCS/TP_GS/TP_KE) và SaleCustomerTable trực tiếp (Sale).
// Giữ file để rollback nếu cần. Có thể xoá sau 2 tuần verify production stable.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import KpiMini from './KpiMini';
import { fmtMoney, fmtDateShort, TXN_TYPE_LABEL, PAY_LABEL } from './utils';
import type { SaleCustomers } from './types';

interface Props {
  salesCustomers: Record<string, SaleCustomers>;
}

export default function SalesCustomerDrilldown({ salesCustomers }: Props) {
  const salesList = useMemo(
    () => Object.values(salesCustomers).sort((a, b) => b.totals.sales - a.totals.sales),
    [salesCustomers],
  );

  // Branch options: derive từ salesList
  const branchOptions = useMemo(() => {
    const map = new Map<string, { branchId: string; branchName: string; saleCount: number }>();
    for (const s of salesList) {
      const bid = s.branchId;
      if (!bid) continue;
      const existing = map.get(bid);
      if (existing) existing.saleCount += 1;
      else map.set(bid, { branchId: bid, branchName: s.branchName || bid, saleCount: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.branchName.localeCompare(b.branchName, 'vi'));
  }, [salesList]);

  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const toggleBranch = useCallback((bid: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(bid)) next.delete(bid);
      else next.add(bid);
      return next;
    });
  }, []);
  const clearBranches = useCallback(() => setSelectedBranches(new Set()), []);

  const filteredSalesList = useMemo(() => {
    if (selectedBranches.size === 0) return salesList;
    return salesList.filter((s) => selectedBranches.has(s.branchId));
  }, [salesList, selectedBranches]);

  const [activeSaleId, setActiveSaleId] = useState<string>(() => salesList[0]?.saleId ?? '');
  useEffect(() => {
    if (filteredSalesList.length === 0) return;
    const stillExists = filteredSalesList.some((s) => s.saleId === activeSaleId);
    if (!stillExists) setActiveSaleId(filteredSalesList[0].saleId);
  }, [filteredSalesList, activeSaleId]);

  const active = filteredSalesList.find((s) => s.saleId === activeSaleId) ?? filteredSalesList[0];

  const showBranchFilter = branchOptions.length > 1;
  const showTabs = filteredSalesList.length > 1;
  const hideSaleBranchChip = branchOptions.length === 1 || selectedBranches.size === 1;

  if (!active) {
    return (
      <div className="card">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Users size={16} className="text-emerald-600" />
          Khách hàng theo Sale
        </h3>
        {showBranchFilter && (
          <BranchChipFilter
            options={branchOptions}
            selected={selectedBranches}
            onToggle={toggleBranch}
            onClear={clearBranches}
            totalSaleCount={salesList.length}
          />
        )}
        <div className="text-center text-slate-400 text-sm italic py-8">
          Không có Sale nào trong cơ sở đã chọn. Bỏ filter hoặc chọn cơ sở khác.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
        <Users size={16} className="text-emerald-600" />
        {showTabs
          ? `Khách hàng theo Sale (${filteredSalesList.length} người · ${filteredSalesList.reduce((s, x) => s + x.totals.count, 0)} giao dịch)`
          : `Khách hàng của ${active.saleName || 'tôi'} (${active.totals.count} giao dịch)`}
      </h3>

      {showBranchFilter && (
        <BranchChipFilter
          options={branchOptions}
          selected={selectedBranches}
          onToggle={toggleBranch}
          onClear={clearBranches}
          totalSaleCount={salesList.length}
        />
      )}

      {showTabs && (
        <div className="flex gap-1.5 mb-4 border-b border-slate-200 pb-3 overflow-x-auto" role="tablist">
          {filteredSalesList.map((s) => {
            const isActive = s.saleId === activeSaleId;
            return (
              <button
                key={s.saleId}
                type="button"
                onClick={() => setActiveSaleId(s.saleId)}
                role="tab"
                aria-selected={isActive}
                className={`shrink-0 inline-flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg text-left transition ring-1 ${
                  isActive
                    ? 'bg-emerald-600 text-white ring-emerald-600'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  {s.saleName || '(chưa rõ)'}
                  {!hideSaleBranchChip && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-normal ${isActive ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                      {s.branchName || s.branchId}
                    </span>
                  )}
                </span>
                <span className={`text-xs tabular-nums ${isActive ? 'opacity-90' : 'text-slate-500'}`}>
                  {s.totals.count} GD · {fmtMoney(s.totals.sales)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <KpiMini label="Số GD" value={active.totals.count.toString()} tone="slate" />
        <KpiMini label="Doanh số" value={fmtMoney(active.totals.sales)} tone="emerald" />
        <KpiMini label="Thực thu" value={fmtMoney(active.totals.collected)} tone="sky" />
        <KpiMini label="Nợ phát sinh" value={fmtMoney(active.totals.debtGenerated)} tone="amber" />
        <KpiMini label="Nợ còn lại" value={fmtMoney(active.totals.debtRemaining)} tone="rose" />
      </div>

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
            {active.transactions.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400 text-sm italic">
                Sale này chưa có giao dịch nào đã đối chiếu trong tháng
              </td></tr>
            ) : (
              active.transactions.map((tx) => {
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
    </div>
  );
}

/** Chip filter cơ sở multi-select (V8.X). Inline trong drilldown để gọn — chỉ dùng ở đây. */
function BranchChipFilter({ options, selected, onToggle, onClear, totalSaleCount }: {
  options: Array<{ branchId: string; branchName: string; saleCount: number }>;
  selected: Set<string>;
  onToggle: (bid: string) => void;
  onClear: () => void;
  totalSaleCount: number;
}) {
  const isAll = selected.size === 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-1">Cơ sở:</span>
      <button
        type="button"
        onClick={onClear}
        aria-pressed={isAll}
        className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition ring-1 ${
          isAll
            ? 'bg-emerald-600 text-white ring-emerald-600'
            : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
        }`}
      >
        Tất cả
        <span className={`text-xs tabular-nums ${isAll ? 'opacity-90' : 'text-slate-400'}`}>
          ({totalSaleCount})
        </span>
      </button>
      {options.map((opt) => {
        const active = selected.has(opt.branchId);
        return (
          <button
            key={opt.branchId}
            type="button"
            onClick={() => onToggle(opt.branchId)}
            aria-pressed={active}
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition ring-1 ${
              active
                ? 'bg-emerald-600 text-white ring-emerald-600'
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {opt.branchName}
            <span className={`text-xs tabular-nums ${active ? 'opacity-90' : 'text-slate-400'}`}>
              ({opt.saleCount})
            </span>
          </button>
        );
      })}
    </div>
  );
}
