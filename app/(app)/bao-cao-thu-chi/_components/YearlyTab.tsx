'use client';

// PR-CASH1G (2026-06-23) — Tab Theo năm cho /bao-cao-thu-chi.

import { useCallback, useEffect, useState } from 'react';
import { Filter, FileSpreadsheet, RefreshCw, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { BranchId } from '@/lib/branches';
import { BRANCHES, isBranchId } from '@/lib/branches';
import type { YearlySummary } from '@/lib/finance/cashflow-summary-types';
import { fetchYearlyCashflowSummary, buildCashflowExportUrl } from '@/lib/services/finance/api-client';

interface Props {
  myBranchId: BranchId | null;
  canSelectBranch: boolean;
  myBranchLabel: string;
  onSelectMonth: (month: string) => void;     // chuyển tab về Monthly với month đó
  onError: (msg: string) => void;
}

function currentYearVN(): number {
  const ms = Date.now() + 7 * 3600 * 1000;
  return new Date(ms).getUTCFullYear();
}
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

export function YearlyTab({ myBranchId, canSelectBranch, myBranchLabel, onSelectMonth, onError }: Props) {
  const [year, setYear] = useState<number>(currentYearVN());
  const [branchId, setBranchId] = useState<BranchId | 'all'>(canSelectBranch ? 'all' : (myBranchId ?? 'all'));
  const [summary, setSummary] = useState<YearlySummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchYearlyCashflowSummary(year, branchId === 'all' ? null : branchId);
      setSummary(r.summary);
    } catch (e: any) { onError(e?.message ?? 'Lỗi tải tổng hợp năm'); setSummary(null); }
    finally { setLoading(false); }
  }, [year, branchId, onError]);

  useEffect(() => { load(); }, [load]);

  function handleExport() {
    const url = buildCashflowExportUrl({ mode: 'yearly', year, branchId: branchId === 'all' ? null : branchId });
    window.location.href = url;
  }

  const yearOptions: number[] = [];
  for (let y = currentYearVN() + 1; y >= currentYearVN() - 3; y--) yearOptions.push(y);

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter size={14} /> Bộ lọc
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">Năm</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 focus:outline-none">
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">Cơ sở</label>
            {canSelectBranch ? (
              <select value={branchId}
                onChange={(e) => { const v = e.target.value; if (v === 'all' || isBranchId(v)) setBranchId(v as BranchId | 'all'); }}
                className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 focus:outline-none min-w-[12rem]">
                <option value="all">Toàn hệ thống</option>
                {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
              </select>
            ) : (
              <div className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 bg-slate-50 inline-flex items-center min-w-[12rem]">
                {myBranchLabel}
              </div>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={load} disabled={loading} leftIcon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}>Làm mới</Button>
            <Button variant="primary" size="sm" onClick={handleExport} leftIcon={<FileSpreadsheet size={14} />}>Xuất Excel năm</Button>
          </div>
        </div>
      </div>

      {/* PR-CASHFLOW-NORMALIZE (2026-06-27): 5 KpiCard → SegmentSummary nhất quán. */}
      {summary && (
        <SegmentSummary
          items={[
            { n: `${fmt(summary.totals.revenue.total)} ₫`,     label: 'Tổng thu năm',  tone: 'success' },
            { n: `${fmt(summary.totals.expense.total)} ₫`,     label: 'Tổng chi năm',  tone: 'danger' },
            { n: `${fmt(summary.totals.net.total)} ₫`,         label: 'Net năm',       tone: summary.totals.net.total < 0 ? 'danger' : 'success' },
            { n: summary.statusCounts.locked,                  label: 'Đã khóa',       tone: 'default' },
            { n: summary.alertDays,                            label: 'Có cảnh báo',   tone: summary.alertDays > 0 ? 'warning' : 'default' },
          ]}
        />
      )}

      {/* Bảng 12 tháng */}
      <div className="card">
        <div className="card-title"><span>12 tháng năm {year}</span></div>
        {loading ? (
          <div className="text-sm text-slate-500 py-6 text-center">Đang tải…</div>
        ) : !summary ? (
          <div className="text-sm text-slate-500 py-6 text-center">Không có dữ liệu.</div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b-2 border-slate-300 bg-slate-50/60">
                <tr className="divide-x divide-slate-200">
                  <Th className="pl-5">Tháng</Th>
                  <Th className="text-right">Tổng thu</Th>
                  <Th className="text-right">Tổng chi</Th>
                  <Th className="text-right">Net</Th>
                  <Th className="text-right">Đã nộp</Th>
                  <Th className="text-right">Kiểm tra</Th>
                  <Th className="text-right">Khóa</Th>
                  <Th className="text-right">Trả lại</Th>
                  <Th className="text-right">Thiếu</Th>
                  <Th className="text-right">Cảnh báo</Th>
                  <Th className="pr-5"></Th>
                </tr>
              </thead>
              <tbody>
                {summary.monthlyRows.map((m) => (
                  <tr key={m.month} onClick={() => onSelectMonth(m.month)}
                    className="border-b border-slate-100 hover:bg-emerald-50/40 cursor-pointer transition-colors duration-150 divide-x divide-slate-100">
                    <Td className="pl-5 font-semibold">{m.month}</Td>
                    <Td className="text-right tabular-nums text-emerald-700">{fmt(m.totalRevenue)} ₫</Td>
                    <Td className="text-right tabular-nums text-rose-700">{fmt(m.totalExpense)} ₫</Td>
                    <Td className={`text-right tabular-nums font-medium ${m.net < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(m.net)} ₫</Td>
                    <Td className="text-right tabular-nums">{m.submittedDays}</Td>
                    <Td className="text-right tabular-nums">{m.checkedDays}</Td>
                    <Td className="text-right tabular-nums">{m.lockedDays}</Td>
                    <Td className="text-right tabular-nums">{m.returnedDays}</Td>
                    <Td className="text-right tabular-nums text-slate-500">{m.missingDays}</Td>
                    <Td className="text-right tabular-nums">{m.alertDays}</Td>
                    <Td className="pr-5 text-right"><ChevronRight size={14} className="inline text-slate-400" /></Td>
                  </tr>
                ))}
                <tr className="border-t-2 border-amber-300 bg-amber-50/70 font-bold divide-x divide-amber-100">
                  <Td className="pl-5">TỔNG</Td>
                  <Td className="text-right tabular-nums text-emerald-700">{fmt(summary.totals.revenue.total)} ₫</Td>
                  <Td className="text-right tabular-nums text-rose-700">{fmt(summary.totals.expense.total)} ₫</Td>
                  <Td className={`text-right tabular-nums ${summary.totals.net.total < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(summary.totals.net.total)} ₫</Td>
                  <Td className="text-right tabular-nums">{summary.statusCounts.submitted}</Td>
                  <Td className="text-right tabular-nums">{summary.statusCounts.checked}</Td>
                  <Td className="text-right tabular-nums">{summary.statusCounts.locked}</Td>
                  <Td className="text-right tabular-nums">{summary.statusCounts.returned}</Td>
                  <Td className="text-right tabular-nums">{summary.statusCounts.missing}</Td>
                  <Td className="text-right tabular-nums">{summary.alertDays}</Td>
                  <Td></Td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Theo cơ sở */}
      {summary?.branchRows && summary.branchRows.length > 0 && (
        <div className="card">
          <div className="card-title"><span>Theo cơ sở</span></div>
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b-2 border-slate-300 bg-slate-50/60">
                <tr className="divide-x divide-slate-200">
                  <Th className="pl-5">Cơ sở</Th>
                  <Th>Tên</Th>
                  <Th className="text-right">Tổng thu</Th>
                  <Th className="text-right">Tổng chi</Th>
                  <Th className="text-right">Net</Th>
                  <Th className="text-right">Đã nộp</Th>
                  <Th className="text-right">Khóa</Th>
                  <Th className="text-right pr-5">Trả lại</Th>
                </tr>
              </thead>
              <tbody>
                {summary.branchRows.map((b) => (
                  <tr key={b.branchId} className="border-b border-slate-100 hover:bg-emerald-50/30 transition-colors duration-150 divide-x divide-slate-100">
                    <Td className="pl-5 font-semibold">{b.branchId}</Td>
                    <Td className="text-xs text-slate-500">{b.branchName}</Td>
                    <Td className="text-right tabular-nums text-emerald-700">{fmt(b.totalRevenue)} ₫</Td>
                    <Td className="text-right tabular-nums text-rose-700">{fmt(b.totalExpense)} ₫</Td>
                    <Td className={`text-right tabular-nums font-medium ${b.net < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(b.net)} ₫</Td>
                    <Td className="text-right tabular-nums">{b.submittedDays}</Td>
                    <Td className="text-right tabular-nums">{b.lockedDays}</Td>
                    <Td className="text-right tabular-nums pr-5">{b.returnedDays}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// PR-CASHFLOW-NORMALIZE (2026-06-27): KpiCard wrapper deadcode sau convert. Import SegmentSummary trực tiếp.
import { SegmentSummary } from '@/components/ui/StatCard';

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium py-2 px-2 ${className}`}>{children}</th>;
}
function Td({ children, className = '', colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`py-2 px-2 ${className}`}>{children}</td>;
}
