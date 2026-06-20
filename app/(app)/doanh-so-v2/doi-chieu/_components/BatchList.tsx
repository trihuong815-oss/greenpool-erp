'use client';

// Bảng list batches.
// Phase 2 (2026-06-17).

import { Loader2, ChevronRight } from 'lucide-react';
import type { SalesDailyBatch, BatchStatus } from '@/lib/types/sales-v2';
import { branchName } from '@/lib/branches';

const STATUS_META: Record<BatchStatus, { label: string; cls: string }> = {
  draft:           { label: 'Nháp',              cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  pending_review:  { label: 'Chờ đối chiếu',     cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  approved:        { label: 'Đã đối chiếu',      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  returned:        { label: 'Trả lại Sale',      cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  locked:          { label: 'Đã khoá',           cls: 'bg-slate-200 text-slate-600 ring-slate-300' },
};

function fmtDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
}

interface Props {
  batches: SalesDailyBatch[];
  loading: boolean;
  onSelect: (b: SalesDailyBatch) => void;
}

export default function BatchList({ batches, loading, onSelect }: Props) {
  if (loading && batches.length === 0) {
    return (
      <div className="card flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={18} /> Đang tải…
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="card text-center py-16 text-slate-400">
        <div className="text-4xl mb-2">📭</div>
        <div className="text-sm">Không có batch nào khớp bộ lọc.</div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            <tr>
              <th className="px-3 py-2.5 text-left">Ngày</th>
              <th className="px-3 py-2.5 text-left">Cơ sở</th>
              <th className="px-3 py-2.5 text-left">Người nhập</th>
              <th className="px-3 py-2.5 text-right">Số GD</th>
              <th className="px-3 py-2.5 text-right">DS phát sinh</th>
              <th className="px-3 py-2.5 text-right">Thực thu</th>
              <th className="px-3 py-2.5 text-right">Công nợ</th>
              <th className="px-3 py-2.5 text-left">Trạng thái</th>
              <th className="px-3 py-2.5 text-left">Cập nhật</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map((b) => {
              const meta = STATUS_META[b.status];
              return (
                <tr
                  key={b.id}
                  onClick={() => onSelect(b)}
                  className="hover:bg-slate-50/60 cursor-pointer transition group"
                >
                  <td className="px-3 py-2.5 font-medium text-slate-800 tabular-nums">{fmtDate(b.date)}</td>
                  <td className="px-3 py-2.5 text-slate-600">{branchName(b.branchId)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-700 font-medium truncate max-w-[160px]">{b.saleName}</span>
                      {/* M2.1 PR-4 (2026-06-20): submitterRoleType chỉ có giá trị khi
                          server enrich (flag SALES_V2_QLCS_BADGE ON). Undefined → không hiện badge. */}
                      {b.submitterRoleType === 'sale' && (
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200">
                          Sale
                        </span>
                      )}
                      {b.submitterRoleType === 'qlcs' && (
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ring-1 bg-violet-50 text-violet-700 ring-violet-200"
                          title="Quản lý cơ sở nhập hỗ trợ Sale">
                          QLCS hỗ trợ
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{b.totalTransactions}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">
                    {b.totalSalesAmount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sky-700">
                    {b.totalCollectedAmount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {b.totalDebtAmount > 0
                      ? <span className="text-rose-600 font-medium">{b.totalDebtAmount.toLocaleString()}</span>
                      : <span className="text-slate-300">0</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{fmtTime(b.submittedAt ?? b.updatedAt)}</td>
                  <td className="px-3 py-2.5 text-slate-300 group-hover:text-emerald-600">
                    <ChevronRight size={16} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
