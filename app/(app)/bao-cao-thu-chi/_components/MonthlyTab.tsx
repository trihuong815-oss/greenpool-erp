'use client';

// PR-CASH1G (2026-06-23) — Tab Theo tháng cho /bao-cao-thu-chi.

import { useCallback, useEffect, useState } from 'react';
import { Filter, FileSpreadsheet, RefreshCw, FileText, Wallet, Receipt, TrendingDown, AlertTriangle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { BranchId } from '@/lib/branches';
import { BRANCHES, isBranchId } from '@/lib/branches';
import type { MonthlySummary } from '@/lib/finance/cashflow-summary-types';
import { fetchMonthlyCashflowSummary, buildCashflowExportUrl } from '@/lib/services/finance/api-client';
import { DAILY_CASHFLOW_REPORT_STATUS_LABEL, type DailyCashflowReportStatus } from '@/lib/finance/cashflow-report-types';

interface Props {
  myBranchId: BranchId | null;
  canSelectBranch: boolean;
  myBranchLabel: string;
  initialMonth?: string;          // PR-CASH1G: jump-to month từ YearlyTab
  onOpenReport: (reportId: string) => void;
  onError: (msg: string) => void;
}

function currentMonthVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 7);
}
function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

const STATUS_PILL: Record<DailyCashflowReportStatus, string> = {
  draft:     'bg-slate-100 text-slate-700 ring-slate-200',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  sent:      'bg-sky-50 text-sky-700 ring-sky-200',
  checked:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
  returned:  'bg-rose-50 text-rose-700 ring-rose-200',
  locked:    'bg-violet-50 text-violet-700 ring-violet-200',
};

export function MonthlyTab({ myBranchId, canSelectBranch, myBranchLabel, initialMonth, onOpenReport, onError }: Props) {
  const [month, setMonth] = useState<string>(initialMonth ?? currentMonthVN());
  const [branchId, setBranchId] = useState<BranchId | 'all'>(canSelectBranch ? 'all' : (myBranchId ?? 'all'));
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchMonthlyCashflowSummary(month, branchId === 'all' ? null : branchId);
      setSummary(r.summary);
    } catch (e: any) { onError(e?.message ?? 'Lỗi tải tổng hợp tháng'); setSummary(null); }
    finally { setLoading(false); }
  }, [month, branchId, onError]);

  useEffect(() => { load(); }, [load]);

  function handleExport() {
    const url = buildCashflowExportUrl({
      mode: 'monthly',
      month,
      branchId: branchId === 'all' ? null : branchId,
    });
    window.location.href = url;   // browser handle attachment download
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter size={14} /> Bộ lọc
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">Tháng</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 focus:outline-none" />
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
            <Button variant="primary" size="sm" onClick={handleExport} leftIcon={<FileSpreadsheet size={14} />}>Xuất Excel tháng</Button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KpiCard icon={<FileText size={16} />} label="Báo cáo đã có" value={String(summary.days.length)} tone="slate" />
          <KpiCard icon={<Wallet size={16} />} label="Tổng thu" value={`${fmt(summary.totals.revenue.total)} ₫`} tone="emerald" />
          <KpiCard icon={<Receipt size={16} />} label="Tổng chi" value={`${fmt(summary.totals.expense.total)} ₫`} tone="rose" />
          <KpiCard icon={<TrendingDown size={16} />} label="Net" value={`${fmt(summary.totals.net.total)} ₫`} tone={summary.totals.net.total < 0 ? 'rose' : 'emerald'} />
          <KpiCard icon={<FileText size={16} />} label="Đã khóa" value={String(summary.statusCounts.locked)} tone="violet" />
          <KpiCard icon={<AlertTriangle size={16} />} label="Có cảnh báo" value={String(summary.alertDays)} tone={summary.alertDays > 0 ? 'amber' : 'slate'} />
        </div>
      )}

      {/* Status breakdown row */}
      {summary && (
        <div className="card text-xs text-slate-700 flex flex-wrap gap-2">
          <Pill cls="bg-amber-50 text-amber-700 ring-amber-200">Đã nộp/gửi: {summary.statusCounts.submitted}</Pill>
          <Pill cls="bg-emerald-50 text-emerald-700 ring-emerald-200">Đã kiểm tra: {summary.statusCounts.checked}</Pill>
          <Pill cls="bg-violet-50 text-violet-700 ring-violet-200">Đã khóa: {summary.statusCounts.locked}</Pill>
          <Pill cls="bg-rose-50 text-rose-700 ring-rose-200">Trả lại: {summary.statusCounts.returned}</Pill>
          <Pill cls="bg-slate-100 text-slate-700 ring-slate-200">Chưa nộp (ước tính): {summary.statusCounts.missing}</Pill>
          <span className="ml-auto text-slate-500">Tháng có {summary.daysInMonth} ngày · đã đếm đến ngày {summary.daysCounted}</span>
        </div>
      )}

      {/* Bảng theo ngày */}
      <div className="card">
        <div className="card-title">
          <span>Theo ngày ({summary?.days.length ?? 0})</span>
        </div>
        {loading ? (
          <div className="text-sm text-slate-500 py-6 text-center">Đang tải…</div>
        ) : !summary || summary.days.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">Chưa có báo cáo trong tháng này.</div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <Th className="pl-5">Ngày</Th>
                  <Th>Cơ sở</Th>
                  <Th className="text-right">Tổng thu</Th>
                  <Th className="text-right">Tổng chi</Th>
                  <Th className="text-right">Net</Th>
                  <Th>Trạng thái</Th>
                  <Th>Cảnh báo</Th>
                  <Th className="pr-5"></Th>
                </tr>
              </thead>
              <tbody>
                {summary.days.map((d) => (
                  <tr key={`${d.date}-${d.branchId}`} onClick={() => onOpenReport(d.reportId)}
                    className="border-b border-slate-100 hover:bg-emerald-50/40 cursor-pointer">
                    <Td className="pl-5 font-semibold">{d.date}</Td>
                    <Td>{d.branchId} — <span className="text-xs text-slate-500">{d.branchName}</span></Td>
                    <Td className="text-right tabular-nums text-emerald-700">{fmt(d.revenueTotal)} ₫</Td>
                    <Td className="text-right tabular-nums text-rose-700">{fmt(d.expenseTotal)} ₫</Td>
                    <Td className={`text-right tabular-nums font-medium ${d.netTotal < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(d.netTotal)} ₫</Td>
                    <Td><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ring-1 ${STATUS_PILL[d.status]}`}>{DAILY_CASHFLOW_REPORT_STATUS_LABEL[d.status]}</span></Td>
                    <Td>{d.alertCount > 0 ? <span className="inline-flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={12} /> {d.alertCount}</span> : <span className="text-xs text-slate-400">—</span>}</Td>
                    <Td className="pr-5 text-right"><ChevronRight size={14} className="inline text-slate-400" /></Td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <Td className="pl-5">TỔNG</Td>
                  <Td className="text-xs text-slate-500">{summary.scope === 'system' ? 'Toàn hệ thống' : (summary.branchId ?? '')}</Td>
                  <Td className="text-right tabular-nums text-emerald-700">{fmt(summary.totals.revenue.total)} ₫</Td>
                  <Td className="text-right tabular-nums text-rose-700">{fmt(summary.totals.expense.total)} ₫</Td>
                  <Td className={`text-right tabular-nums ${summary.totals.net.total < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(summary.totals.net.total)} ₫</Td>
                  <Td colSpan={3}></Td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const TONE_CLS: Record<string, string> = {
  slate: 'bg-white text-slate-700 ring-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
};

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: keyof typeof TONE_CLS }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ring-1 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${TONE_CLS[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-90">{icon}{label}</div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
function Pill({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full ring-1 text-xs font-medium ${cls}`}>{children}</span>;
}
function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium py-2 px-2 ${className}`}>{children}</th>;
}
function Td({ children, className = '', colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`py-2 px-2 ${className}`}>{children}</td>;
}
