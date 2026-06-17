'use client';

// Lịch sử audit log của 1 batch — collapsed section trong BatchDetailModal.
// 2026-06-17 — audit polish commit B.

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, History } from 'lucide-react';

interface AuditEntry {
  id: string;
  batchId: string;
  transactionId: string | null;
  action: string;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  changedByName: string;
  changedAt: string;
  reason: string | null;
}

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  edit_field:  { label: 'Sửa field',   cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  approve:     { label: 'Duyệt',       cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  return:      { label: 'Trả lại',     cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  auto_match:  { label: 'Auto-link',   cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  manual_link: { label: 'Link manual', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
};

const FIELD_LABEL: Record<string, string> = {
  customerName: 'Tên KH',
  phone: 'SĐT',
  guardianName: 'Người giám hộ',
  source: 'Nguồn',
  packageId: 'Gói',
  transactionType: 'Loại GD',
  paymentMethod: 'HT thu',
  packageValue: 'Giá trị gói',
  collectedToday: 'Thu hôm nay',
  note: 'Ghi chú',
};

function fmtValue(v: unknown): string {
  if (v == null) return '∅';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'string') return v || '∅';
  return String(v);
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return iso; }
}

interface Props {
  batchId: string;
}

export default function AuditHistory({ batchId }: Props) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || logs !== null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/sales-v2/batches/${encodeURIComponent(batchId)}/audit`);
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        const j = await r.json();
        if (!cancelled) setLogs(j.logs as AuditEntry[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Lỗi tải');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, logs, batchId]);

  return (
    <div className="border-t border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-2.5 flex items-center gap-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <History size={14} className="text-slate-400" />
        <span className="font-medium">Lịch sử audit</span>
        {logs && (
          <span className="ml-1 text-xs text-slate-400">({logs.length} entry)</span>
        )}
      </button>

      {open && (
        <div className="px-5 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-4 text-slate-400 text-sm">
              <Loader2 className="animate-spin mr-2" size={14} /> Đang tải lịch sử…
            </div>
          ) : error ? (
            <div className="text-sm text-rose-600">⚠️ {error}</div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-sm text-slate-400 italic text-center py-3">
              Chưa có thao tác audit nào (Sale gửi + duyệt diễn ra trước khi audit log được wire).
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {logs.map((log) => {
                const meta = ACTION_LABEL[log.action] ?? { label: log.action, cls: 'bg-slate-100 text-slate-700 ring-slate-200' };
                const fieldLabel = log.field ? (FIELD_LABEL[log.field] ?? log.field) : null;
                return (
                  <div key={log.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ring-1 ${meta.cls}`}>
                          {meta.label}
                        </span>
                        {fieldLabel && <span className="text-slate-700 font-medium">{fieldLabel}</span>}
                        <span className="text-slate-500 truncate">bởi <strong>{log.changedByName}</strong></span>
                      </div>
                      <span className="text-slate-400 shrink-0 tabular-nums">{fmtTime(log.changedAt)}</span>
                    </div>
                    {log.action === 'edit_field' && (
                      <div className="mt-1 text-slate-600 flex items-center gap-2 text-[11px]">
                        <span className="line-through text-slate-400">{fmtValue(log.oldValue)}</span>
                        <span className="text-slate-400">→</span>
                        <span className="text-slate-800 font-medium">{fmtValue(log.newValue)}</span>
                      </div>
                    )}
                    {log.reason && (
                      <div className="mt-1 text-slate-600 italic">"{log.reason}"</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
