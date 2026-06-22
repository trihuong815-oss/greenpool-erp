'use client';

// PR-7A — Desktop table.
// Cột: Thời gian / Người + role / Cơ sở / Module / Action / Đối tượng / Tóm tắt / Chi tiết

import { ChevronRight } from 'lucide-react';
import { BRANCH_BY_ID } from '@/lib/branches';
import { actionLabelOrRaw, moduleLabel, isKnownAction } from '@/lib/audit-history/action-labels';
import type { AuditHistoryEntry } from '@/lib/audit-history/types';

interface Props {
  items: AuditHistoryEntry[];
  onSelect: (entry: AuditHistoryEntry) => void;
}

function fmtTimeVN(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleString('vi-VN', { hour12: false });
}

function entityRef(entry: AuditHistoryEntry): string {
  if (entry.transactionId) return `Tx ${entry.transactionId.slice(0, 6)}…`;
  if (entry.batchId) return `Batch ${entry.batchId.slice(0, 6)}…`;
  if (entry.programId) return `CT ${entry.programId.slice(0, 6)}…`;
  return '—';
}

function summary(entry: AuditHistoryEntry): string {
  if (entry.field) return `field: ${entry.field}`;
  if (entry.reason) {
    const r = entry.reason.length > 60 ? entry.reason.slice(0, 60) + '…' : entry.reason;
    return `lý do: ${r}`;
  }
  return '';
}

export default function AuditTable({ items, onSelect }: Props) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
            <tr className="text-left text-xs font-semibold text-slate-600">
              <th className="px-3 py-2 whitespace-nowrap">Thời gian</th>
              <th className="px-3 py-2">Nguồn</th>
              <th className="px-3 py-2">Người thao tác</th>
              <th className="px-3 py-2">Cơ sở</th>
              <th className="px-3 py-2">Tháng</th>
              <th className="px-3 py-2">Module</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Đối tượng</th>
              <th className="px-3 py-2">Tóm tắt</th>
              <th className="px-3 py-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const known = isKnownAction(it.action);
              const branch = it.branchId ? BRANCH_BY_ID[it.branchId] : undefined;
              return (
                <tr
                  key={it.id}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => onSelect(it)}
                >
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-700">
                    {fmtTimeVN(it.changedAtMs)}
                  </td>
                  <td className="px-3 py-2">
                    {/* PR-7B: source badge */}
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                        it.source === 'salesAuditLogs'
                          ? 'bg-sky-50 text-sky-700 border border-sky-200'
                          : 'bg-violet-50 text-violet-700 border border-violet-200'
                      }`}
                      title={it.source}
                    >
                      {it.source === 'salesAuditLogs' ? 'Sales' : 'Generic'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{it.changedByName || '(không tên)'}</div>
                    <div className="text-xs text-slate-500">{it.changedByRole || '—'}</div>
                  </td>
                  <td className="px-3 py-2">
                    {it.branchId ? (
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: branch?.color ?? '#64748b' }}
                      >
                        {branch?.id ?? it.branchId}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Không rõ</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-700">{it.month || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{moduleLabel(it.module)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${
                        known
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                      title={known ? '' : 'Action chưa có label tiếng Việt (PR-7A tolerant string)'}
                    >
                      {actionLabelOrRaw(it.action)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{entityRef(it)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{summary(it)}</td>
                  <td className="px-3 py-2 text-slate-400">
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
