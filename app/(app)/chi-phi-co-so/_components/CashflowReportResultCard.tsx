'use client';

// PR-CASH1C: Card hiển thị báo cáo thu-chi gần nhất (last submitted) + kết quả vừa nộp.

import { FileCheck2, RefreshCw } from 'lucide-react';
import type { DailyCashflowReportDoc } from '@/lib/finance/cashflow-report-types';
import { DAILY_CASHFLOW_REPORT_STATUS_LABEL, CASHFLOW_ALERT_LABEL } from '@/lib/finance/cashflow-report-types';

interface Props {
  report: (DailyCashflowReportDoc & { id: string }) | null;
  loading: boolean;
  canSubmit: boolean;
  onRefresh: () => void;
}

function fmt(n: number): string { return n.toLocaleString('vi-VN'); }

const STATUS_PILL: Record<string, string> = {
  draft:     'bg-slate-100 text-slate-700 ring-slate-200',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  sent:      'bg-sky-50 text-sky-700 ring-sky-200',
  checked:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
  returned:  'bg-rose-50 text-rose-700 ring-rose-200',
  locked:    'bg-violet-50 text-violet-700 ring-violet-200',
};

function tsLabel(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v.replace('T', ' ').slice(0, 16);
  if (v._seconds) return new Date(v._seconds * 1000).toLocaleString('vi-VN');
  if (v.seconds) return new Date(v.seconds * 1000).toLocaleString('vi-VN');
  try { return new Date(v).toLocaleString('vi-VN'); } catch { return ''; }
}

export function CashflowReportResultCard({ report, loading, canSubmit, onRefresh }: Props) {
  return (
    <div className="card">
      <div className="card-title">
        <FileCheck2 size={16} className="text-emerald-600" />
        <span>Báo cáo thu-chi đã nộp</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      {!report ? (
        <div className="text-sm text-slate-500 py-6 text-center">
          {canSubmit
            ? <>Chưa có báo cáo cho ngày + cơ sở này. Bấm <strong className="text-slate-700">Nộp báo cáo</strong> bên trên để tạo.</>
            : <>Chưa có báo cáo cho ngày + cơ sở này. Kế toán cơ sở cần lập và nộp báo cáo.</>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Info label="Mã báo cáo" value={<span className="font-mono text-xs">{report.id}</span>} />
            <Info label="Phiên bản" value={`v${report.reportVersion}`} />
            <Info label="Trạng thái" value={
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ring-1 ${STATUS_PILL[report.status] ?? 'bg-slate-100'}`}>
                {DAILY_CASHFLOW_REPORT_STATUS_LABEL[report.status]}
              </span>
            } />
            <Info label="Người nộp" value={<>
              <div className="font-medium">{report.submittedByName ?? '—'}</div>
              <div className="text-xs text-slate-500">{tsLabel(report.submittedAt)}</div>
            </>} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <NumberStat label="Tổng thu" value={report.revenueSource?.total ?? 0} tone="emerald" />
            <NumberStat label="Tổng chi" value={report.expense?.totalByMethod?.total ?? 0} tone="rose" />
            <NumberStat label="Net" value={report.net?.total ?? 0} tone={(report.net?.total ?? 0) < 0 ? 'rose' : 'emerald'} />
          </div>

          {Array.isArray(report.alerts) && report.alerts.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-600">Cảnh báo ({report.alerts.length})</div>
              {report.alerts.map((a, i) => (
                <div key={i} className="text-xs px-3 py-2 rounded-lg ring-1 bg-amber-50 ring-amber-200 text-amber-800">
                  <span className="font-medium">{CASHFLOW_ALERT_LABEL[a.code] ?? a.code}</span>
                  {a.message && <span className="text-amber-700"> — {a.message}</span>}
                </div>
              ))}
            </div>
          )}

          {report.status === 'returned' && report.returnReason && (
            <div className="text-xs px-3 py-2 rounded-lg ring-1 bg-rose-50 ring-rose-200 text-rose-800">
              <span className="font-semibold">Lý do trả lại:</span> {report.returnReason}
              {report.returnedByName && <span className="text-rose-700"> ({report.returnedByName})</span>}
            </div>
          )}

          {report.status === 'checked' && report.checkedByName && (
            <div className="text-xs text-emerald-700">
              Đã kiểm tra bởi {report.checkedByName} {report.checkedAt ? `lúc ${tsLabel(report.checkedAt)}` : ''}.
              {report.checkNote ? ` Ghi chú: ${report.checkNote}` : ''}
            </div>
          )}

          {Array.isArray(report.revisions) && report.revisions.length > 0 && (
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer font-medium">Lịch sử phiên bản ({report.revisions.length})</summary>
              <ul className="mt-2 space-y-1 pl-4 list-disc">
                {report.revisions.map((r, i) => (
                  <li key={i}>
                    v{r.reportVersion} — bởi {r.submittedByName ?? '—'} lúc {tsLabel(r.submittedAt)}
                    {r.reason ? ` (${r.reason})` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className="text-sm text-slate-800">{value}</div>
    </div>
  );
}

function NumberStat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'rose' }) {
  const cls = tone === 'emerald' ? 'bg-emerald-50 ring-emerald-200 text-emerald-700' : 'bg-rose-50 ring-rose-200 text-rose-700';
  return (
    <div className={`rounded-lg ring-1 px-3 py-2 ${cls}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-lg font-bold tabular-nums">{fmt(value)} ₫</div>
    </div>
  );
}
