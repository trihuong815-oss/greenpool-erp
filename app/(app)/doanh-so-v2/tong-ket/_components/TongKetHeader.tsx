'use client';

// PR-TK1 (2026-06-21) — Header card cho /tong-ket. Tách từ TongKetClient.tsx.
// Tiêu đề + subtitle theo scope + month picker prev/next + branch filter (chỉ top).

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BRANCHES, type BranchId } from '@/lib/branches';
import type { ScopeRole } from '@/lib/sales-v2/scope';
import { currentMonthVN, fmtMonth, shiftMonth } from './utils';

interface Props {
  scope: ScopeRole;
  month: string;
  branchId: BranchId | 'all';
  showBranchFilter: boolean;
  onMonthChange: (month: string) => void;
  onBranchChange: (branchId: BranchId | 'all') => void;
}

export default function TongKetHeader(props: Props) {
  const { scope, month, branchId, showBranchFilter, onMonthChange, onBranchChange } = props;
  const cur = currentMonthVN();

  const subtitle = scope === 'sale'
    ? 'Dữ liệu cá nhân của bạn (chỉ tính giao dịch đã được kế toán duyệt).'
    : scope === 'top'
      ? 'Toàn hệ thống (chỉ data đã đối chiếu chính thức).'
      : 'Dữ liệu cơ sở bạn quản lý (đã đối chiếu).';

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Tổng kết tháng {fmtMonth(month)}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50"
            title="Tháng trước"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            value={month}
            max={cur}
            onChange={(e) => onMonthChange(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            disabled={month >= cur}
            className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Tháng sau"
          >
            <ChevronRight size={16} />
          </button>
          {showBranchFilter && (
            <select
              value={branchId}
              onChange={(e) => onBranchChange(e.target.value as BranchId | 'all')}
              className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Tất cả cơ sở</option>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
