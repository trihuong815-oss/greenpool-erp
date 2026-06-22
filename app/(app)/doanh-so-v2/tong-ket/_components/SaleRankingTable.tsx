'use client';

// PR-TK4B (2026-06-22) — Bảng ranking Sale + nút "Xem khách" mở Drawer.
// Replace SalesCustomerDrilldown card-ngang pattern.
//
// Source data: data.salesCustomers (đã filter scope server-side) + saleTargetsThisMonth.
// Server enforce scope — component KHÔNG cần check permission lại:
//   - Sale role: KHÔNG dùng table này (SaleView render trực tiếp SaleCustomerTable)
//   - QLCS: chỉ Sale cơ sở mình (salesCustomers đã filter)
//   - Top role: tất cả Sale trong scope (branch filter hoặc all)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Eye } from 'lucide-react';
import { fmtMoney } from './utils';
import type { SaleCustomers, TargetStatus } from './types';
import SaleCustomerDrawer from './SaleCustomerDrawer';

interface Props {
  salesCustomers: Record<string, SaleCustomers>;
  /** Map saleId → target VND tháng (PR-TK3A). Optional. */
  saleTargetsThisMonth?: Record<string, number>;
  /** Tiến độ thời gian (% ngày đã qua trong tháng) từ targetSummary.daysElapsedPercent
   *  (server đã compute). Dùng cho status compute per-Sale. Default 0 nếu không có. */
  daysElapsedPercent?: number;
  /** Hiện cột Cơ sở khi top role xem all branches. */
  showBranchColumn: boolean;
}

// Inline mini helper — duplicate logic computeTargetStatus từ target-progress.ts
// vì file đó 'server-only'. Acceptable: 1 function 5 dòng, dễ test inline.
function computeSaleStatus(target: number | null, actualPct: number | null, daysPct: number): TargetStatus {
  if (target == null || target <= 0 || actualPct == null) return 'not_set';
  if (actualPct >= 100) return 'achieved';
  if (actualPct >= daysPct) return 'on_track';
  if (actualPct - daysPct >= -10) return 'watch';
  return 'behind';
}

const STATUS_LABEL: Record<TargetStatus, string> = {
  achieved: 'Đã đạt',
  on_track: 'Đúng tiến độ',
  watch: 'Cần theo sát',
  behind: 'Chậm tiến độ',
  not_set: 'Chưa đặt',
};

const STATUS_BADGE: Record<TargetStatus, string> = {
  achieved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  on_track: 'bg-sky-50 text-sky-700 ring-sky-200',
  watch:    'bg-amber-50 text-amber-700 ring-amber-200',
  behind:   'bg-rose-50 text-rose-700 ring-rose-200',
  not_set:  'bg-slate-50 text-slate-600 ring-slate-200',
};

export default function SaleRankingTable(props: Props) {
  const { salesCustomers, saleTargetsThisMonth, daysElapsedPercent = 0, showBranchColumn } = props;

  // Selected sale for drawer
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  // Reset selection khi data đổi (month/branch change) → tránh drawer hiển thị data cũ
  useEffect(() => {
    setSelectedSaleId(null);
  }, [salesCustomers]);

  // Sorted ranking — doanh số DESC
  const ranked = useMemo(
    () => Object.values(salesCustomers).sort((a, b) => b.totals.sales - a.totals.sales),
    [salesCustomers],
  );

  const openDrawer = useCallback((saleId: string) => setSelectedSaleId(saleId), []);
  const closeDrawer = useCallback(() => setSelectedSaleId(null), []);

  if (ranked.length === 0) return null;

  const selectedSale = selectedSaleId ? salesCustomers[selectedSaleId] : null;
  const selectedTarget = selectedSaleId ? (saleTargetsThisMonth?.[selectedSaleId] ?? null) : null;

  return (
    <>
      <div className="card">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Users size={16} className="text-emerald-600" />
          Xếp hạng Sale theo doanh số ({ranked.length} người)
        </h3>

        {/* PR-TK4D: Desktop ≥md → table với sticky thead. Mobile <md → card stack. */}
        <div className="hidden md:block">
          <div className="overflow-auto max-h-[70vh] rounded ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-left w-10">#</th>
                  {showBranchColumn && <th className="px-2 py-2 text-left">Cơ sở</th>}
                  <th className="px-2 py-2 text-left">Sale</th>
                  <th className="px-2 py-2 text-right">Số GD</th>
                  <th className="px-2 py-2 text-right">Doanh số</th>
                  <th className="px-2 py-2 text-right">Thực thu</th>
                  <th className="px-2 py-2 text-right">Công nợ còn lại</th>
                  <th className="px-2 py-2 text-right">Chỉ tiêu</th>
                  <th className="px-2 py-2 text-right">% hoàn thành</th>
                  <th className="px-2 py-2 text-left">Trạng thái</th>
                  <th className="px-2 py-2 text-center w-24">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranked.map((s, i) => {
                  const target = saleTargetsThisMonth?.[s.saleId] ?? null;
                  const hasTarget = target != null && target > 0;
                  const pct = hasTarget ? (s.totals.sales / target) * 100 : null;
                  const status = computeSaleStatus(target, pct, daysElapsedPercent);
                  return (
                    <tr key={s.saleId} className="hover:bg-slate-50/60">
                      <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                      {showBranchColumn && (
                        <td className="px-2 py-1.5 text-slate-600 text-xs">
                          {s.branchName || s.branchId}
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-slate-800 font-medium">{s.saleName || '(chưa rõ)'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s.totals.count}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{fmtMoney(s.totals.sales)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-sky-700">{fmtMoney(s.totals.collected)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">
                        {s.totals.debtRemaining > 0 ? fmtMoney(s.totals.debtRemaining) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                        {hasTarget ? fmtMoney(target) : <span className="text-slate-300 text-xs italic">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {hasTarget ? `${pct!.toFixed(1)}%` : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${STATUS_BADGE[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => openDrawer(s.saleId)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-emerald-200 transition"
                          title={`Xem ${s.totals.count} giao dịch của ${s.saleName}`}
                        >
                          <Eye size={12} />
                          Xem khách
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile card stack */}
        <div className="md:hidden space-y-2">
          {ranked.map((s, i) => {
            const target = saleTargetsThisMonth?.[s.saleId] ?? null;
            const hasTarget = target != null && target > 0;
            const pct = hasTarget ? (s.totals.sales / target) * 100 : null;
            const status = computeSaleStatus(target, pct, daysElapsedPercent);
            return (
              <div key={s.saleId} className="rounded-lg ring-1 ring-slate-200 p-3 bg-white">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400 tabular-nums">#{i + 1}</div>
                    <div className="font-semibold text-slate-800 truncate">{s.saleName || '(chưa rõ)'}</div>
                    {showBranchColumn && (
                      <div className="text-xs text-slate-500 mt-0.5">{s.branchName || s.branchId}</div>
                    )}
                  </div>
                  <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${STATUS_BADGE[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div>
                    <div className="text-slate-500">Doanh số</div>
                    <div className="font-semibold text-emerald-700 tabular-nums">{fmtMoney(s.totals.sales)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Thực thu</div>
                    <div className="font-semibold text-sky-700 tabular-nums">{fmtMoney(s.totals.collected)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Số GD</div>
                    <div className="font-semibold tabular-nums">{s.totals.count}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Công nợ còn lại</div>
                    <div className="font-semibold text-rose-700 tabular-nums">
                      {s.totals.debtRemaining > 0 ? fmtMoney(s.totals.debtRemaining) : '—'}
                    </div>
                  </div>
                  {hasTarget && (
                    <>
                      <div>
                        <div className="text-slate-500">Chỉ tiêu</div>
                        <div className="font-semibold tabular-nums">{fmtMoney(target)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">% hoàn thành</div>
                        <div className="font-semibold tabular-nums">{pct!.toFixed(1)}%</div>
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openDrawer(s.saleId)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-emerald-200 transition"
                >
                  <Eye size={12} />
                  Xem khách
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {selectedSale && (
        <SaleCustomerDrawer
          sale={selectedSale}
          target={selectedTarget}
          daysElapsedPercent={daysElapsedPercent}
          showBranch={showBranchColumn}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}
