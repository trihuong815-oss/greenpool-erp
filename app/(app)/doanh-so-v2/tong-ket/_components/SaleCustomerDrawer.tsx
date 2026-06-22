'use client';

// PR-TK4B (2026-06-22) — Side drawer hiển thị khách/giao dịch của 1 Sale.
// Desktop: bên phải, width 600px max-width 50vw.
// Mobile (< md): full-screen overlay.
//
// Read-only — KHÔNG có nút sửa, KHÔNG export CSV.
// Close: nút X / click backdrop / ESC key.

import { useEffect } from 'react';
import { X, Users } from 'lucide-react';
import KpiMini from './KpiMini';
import SaleCustomerTable from './SaleCustomerTable';
import { fmtMoney } from './utils';
import type { SaleCustomers } from './types';

interface Props {
  sale: SaleCustomers;
  /** Target tháng cho sale (PR-TK3A). null nếu chưa đặt. */
  target: number | null;
  /** Tiến độ thời gian tháng (0-100). */
  daysElapsedPercent: number;
  /** Có hiện chip cơ sở dưới tên Sale không (top role xem all). */
  showBranch: boolean;
  onClose: () => void;
}

export default function SaleCustomerDrawer({ sale, target, daysElapsedPercent, showBranch, onClose }: Props) {
  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll while drawer open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const hasTarget = target != null && target > 0;
  const pct = hasTarget ? (sale.totals.sales / target) * 100 : null;
  const remaining = hasTarget ? Math.max(0, target - sale.totals.sales) : null;
  // Status label inline (avoid duplicate with SaleRankingTable)
  const statusLabel = (() => {
    if (!hasTarget) return null;
    if (pct! >= 100) return { text: 'Đã đạt', cls: 'bg-emerald-100 text-emerald-700 ring-emerald-300' };
    if (pct! >= daysElapsedPercent) return { text: 'Đúng tiến độ', cls: 'bg-sky-100 text-sky-700 ring-sky-300' };
    if (pct! - daysElapsedPercent >= -10) return { text: 'Cần theo sát', cls: 'bg-amber-100 text-amber-700 ring-amber-300' };
    return { text: 'Chậm tiến độ', cls: 'bg-rose-100 text-rose-700 ring-rose-300' };
  })();

  return (
    <>
      {/* Backdrop overlay — click để đóng */}
      <div
        className="fixed inset-0 bg-slate-900/40 z-40 transition-opacity"
        onClick={onClose}
        aria-label="Đóng drawer"
      />

      {/* Drawer — mobile fullscreen, desktop right 600px max 50vw */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed z-50 bg-white shadow-2xl overflow-y-auto
                   inset-0
                   md:inset-y-0 md:right-0 md:left-auto md:w-[600px] md:max-w-[50vw]"
      >
        {/* Sticky header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <Users size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h2 id="drawer-title" className="text-sm font-bold text-slate-800 truncate">
                  Khách hàng — {sale.saleName || '(chưa rõ)'}
                </h2>
                <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                  {showBranch && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {sale.branchName || sale.branchId}
                    </span>
                  )}
                  <span>{sale.totals.count} giao dịch trong tháng</span>
                  {statusLabel && (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${statusLabel.cls}`}>
                      {statusLabel.text}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Đóng"
              title="Đóng (ESC)"
            >
              <X size={18} />
              <span className="hidden sm:inline">Đóng</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* KPI mini grid */}
          <div className={`grid grid-cols-2 ${hasTarget ? 'md:grid-cols-3' : 'md:grid-cols-3'} gap-2`}>
            <KpiMini label="Số GD" value={sale.totals.count.toString()} tone="slate" />
            <KpiMini label="Doanh số" value={fmtMoney(sale.totals.sales)} tone="emerald" />
            <KpiMini label="Thực thu" value={fmtMoney(sale.totals.collected)} tone="sky" />
            <KpiMini label="Nợ phát sinh" value={fmtMoney(sale.totals.debtGenerated)} tone="amber" />
            <KpiMini label="Nợ còn lại" value={fmtMoney(sale.totals.debtRemaining)} tone="rose" />
            {hasTarget && (
              <KpiMini label={`Chỉ tiêu · ${pct!.toFixed(0)}%`} value={fmtMoney(target)} tone="emerald" />
            )}
          </div>

          {hasTarget && remaining != null && remaining > 0 && (
            <div className="text-xs text-slate-600 italic">
              Còn thiếu <strong className="text-rose-700 tabular-nums">{fmtMoney(remaining)}</strong> để đạt chỉ tiêu.
            </div>
          )}

          {/* Transactions table */}
          <SaleCustomerTable
            transactions={sale.transactions}
            emptyMessage="Sale này chưa có giao dịch nào đã đối chiếu trong tháng"
          />
        </div>
      </aside>
    </>
  );
}
