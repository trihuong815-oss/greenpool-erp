'use client';

// PR-CASH1D: Table list báo cáo thu-chi.

import { ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react';
import type { DailyCashflowReportDoc, DailyCashflowReportStatus } from '@/lib/finance/cashflow-report-types';
import { DAILY_CASHFLOW_REPORT_STATUS_LABEL } from '@/lib/finance/cashflow-report-types';

interface Props {
  reports: Array<DailyCashflowReportDoc & { id: string }>;
  loading: boolean;
  error: string | null;
  emptyText: string;
  onOpen: (r: DailyCashflowReportDoc & { id: string }) => void;
  onRefresh: () => void;
}

const STATUS_PILL: Record<DailyCashflowReportStatus, string> = {
  draft:     'bg-slate-100 text-slate-700 ring-slate-200',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  sent:      'bg-sky-50 text-sky-700 ring-sky-200',
  checked:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
  returned:  'bg-rose-50 text-rose-700 ring-rose-200',
  locked:    'bg-violet-50 text-violet-700 ring-violet-200',
};

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }
function tsLabel(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v.replace('T', ' ').slice(0, 16);
  if (v._seconds) return new Date(v._seconds * 1000).toLocaleString('vi-VN');
  if (v.seconds) return new Date(v.seconds * 1000).toLocaleString('vi-VN');
  try { return new Date(v).toLocaleString('vi-VN'); } catch { return ''; }
}

export function CashflowReportTable({ reports, loading, error, emptyText, onOpen, onRefresh }: Props) {
  return (
    <div className="card">
      <div className="card-title">
        <span>Danh sách báo cáo ({reports.length})</span>
        <button type="button" onClick={onRefresh} disabled={loading} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Làm mới
        </button>
      </div>

      {error && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 ring-1 ring-rose-200 mb-3">{error}</div>}

      {!loading && reports.length === 0 ? (
        <div className="text-center text-sm text-slate-500 py-8">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <Th className="pl-5">Ngày</Th>
                <Th>Cơ sở</Th>
                <Th>Trạng thái</Th>
                <Th className="text-right">v</Th>
                <Th className="text-right">Tổng thu</Th>
                <Th className="text-right">Tổng chi</Th>
                <Th className="text-right">Net</Th>
                <Th>Cảnh báo</Th>
                <Th>Người nộp</Th>
                <Th>Kiểm tra</Th>
                <Th className="pr-5"><span aria-hidden>{' '}</span></Th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const alertCount = Array.isArray(r.alerts) ? r.alerts.length : 0;
                const net = r.net?.total ?? 0;
                return (
                  <tr key={r.id} onClick={() => onOpen(r)} className="border-b border-slate-100 hover:bg-emerald-50/40 cursor-pointer transition">
                    <Td className="pl-5 font-semibold text-slate-800">{r.date}</Td>
                    <Td>
                      <div className="text-sm font-medium text-slate-700">{r.branchId}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[10rem]" title={r.branchName}>{r.branchName}</div>
                    </Td>
                    <Td><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ring-1 ${STATUS_PILL[r.status]}`}>{DAILY_CASHFLOW_REPORT_STATUS_LABEL[r.status]}</span></Td>
                    <Td className="text-right tabular-nums">v{r.reportVersion}</Td>
                    <Td className="text-right tabular-nums text-emerald-700">{fmt(r.revenueSource?.total ?? 0)} ₫</Td>
                    <Td className="text-right tabular-nums text-rose-700">{fmt(r.expense?.totalByMethod?.total ?? 0)} ₫</Td>
                    <Td className={`text-right tabular-nums font-medium ${net < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(net)} ₫</Td>
                    <Td>
                      {alertCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 rounded">
                          <AlertTriangle size={12} /> {alertCount}
                        </span>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </Td>
                    <Td className="text-xs">
                      <div className="text-slate-700 truncate max-w-[10rem]" title={r.submittedByName}>{r.submittedByName}</div>
                      <div className="text-slate-500">{tsLabel(r.submittedAt)}</div>
                    </Td>
                    <Td className="text-xs">
                      {r.checkedByName ? (
                        <>
                          <div className="text-slate-700 truncate max-w-[10rem]" title={r.checkedByName}>{r.checkedByName}</div>
                          <div className="text-slate-500">{tsLabel(r.checkedAt)}</div>
                        </>
                      ) : <span className="text-slate-400">—</span>}
                    </Td>
                    <Td className="pr-5 text-right"><ChevronRight size={14} className="inline text-slate-400" /></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium py-2 px-2 ${className}`}>{children}</th>;
}
function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={`py-2 px-2 ${className}`} title={title}>{children}</td>;
}
