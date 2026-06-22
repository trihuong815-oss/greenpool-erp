'use client';

// PR-7A — Mobile card stack (< md). Mỗi card 1 audit entry, tap để mở detail drawer.

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

export default function AuditCardStack({ items, onSelect }: Props) {
  return (
    <div className="space-y-2">
      {items.map((it) => {
        const known = isKnownAction(it.action);
        const branch = it.branchId ? BRANCH_BY_ID[it.branchId] : undefined;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it)}
            className="w-full text-left card hover:bg-slate-50 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* Action + module badge + source + branch */}
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${
                      known
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {actionLabelOrRaw(it.action)}
                  </span>
                  <span className="text-xs text-slate-500">{moduleLabel(it.module)}</span>
                  {/* PR-7B: source badge */}
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                      it.source === 'salesAuditLogs'
                        ? 'bg-sky-50 text-sky-700 border border-sky-200'
                        : 'bg-violet-50 text-violet-700 border border-violet-200'
                    }`}
                  >
                    {it.source === 'salesAuditLogs' ? 'Sales' : 'Generic'}
                  </span>
                  {it.branchId ? (
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: branch?.color ?? '#64748b' }}
                    >
                      {branch?.id ?? it.branchId}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Không rõ cơ sở</span>
                  )}
                </div>

                {/* Person + role */}
                <div className="text-sm font-medium text-slate-800 truncate">
                  {it.changedByName || '(không tên)'}
                  <span className="ml-1.5 text-xs text-slate-500 font-normal">
                    · {it.changedByRole}
                  </span>
                </div>

                {/* Time + month */}
                <div className="text-xs text-slate-500 mt-1 tabular-nums">
                  {fmtTimeVN(it.changedAtMs)}
                  {it.month && <> · Tháng {it.month}</>}
                </div>

                {/* Optional field/reason */}
                {(it.field || it.reason) && (
                  <div className="text-xs text-slate-500 mt-1 truncate">
                    {it.field && <>field: <span className="font-mono">{it.field}</span></>}
                    {it.field && it.reason && ' · '}
                    {it.reason && <>lý do: {it.reason}</>}
                  </div>
                )}
              </div>

              <ChevronRight size={16} className="text-slate-400 mt-1 shrink-0" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
