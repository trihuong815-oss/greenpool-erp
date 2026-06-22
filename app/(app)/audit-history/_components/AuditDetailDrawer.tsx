'use client';

// PR-7A — Detail drawer cho 1 audit entry.
// Read-only, không có nút sửa/xóa.
// Mobile fullscreen, desktop right-side 600px.

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BRANCH_BY_ID } from '@/lib/branches';
import { actionLabelOrRaw, moduleLabel, isKnownAction } from '@/lib/audit-history/action-labels';
import type { AuditHistoryEntry } from '@/lib/audit-history/types';

interface Props {
  entry: AuditHistoryEntry;
  onClose: () => void;
}

function fmtTimeVN(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleString('vi-VN', { hour12: false });
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function AuditDetailDrawer({ entry, onClose }: Props) {
  // ESC để đóng
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const branch = BRANCH_BY_ID[entry.branchId];
  const known = isKnownAction(entry.action);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 z-40"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className="fixed inset-0 md:inset-y-0 md:right-0 md:left-auto md:w-[600px] md:max-w-[50vw] bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
        role="dialog"
        aria-label="Chi tiết audit entry"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-500 font-mono truncate">id: {entry.id}</div>
            <div className="text-base font-semibold text-slate-800 truncate flex items-center gap-2">
              <span
                className={`inline-block px-2 py-0.5 rounded-md text-sm font-medium ${
                  known
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {actionLabelOrRaw(entry.action)}
              </span>
              <span className="text-sm text-slate-500">{moduleLabel(entry.module)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-200"
            aria-label="Đóng"
          >
            <X size={16} />
            <span className="hidden sm:inline">Đóng</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {/* Metadata grid */}
          <section>
            <h3 className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-1 mb-2">
              Metadata
            </h3>
            <dl className="grid grid-cols-3 gap-y-1.5 gap-x-3">
              <Row label="Thời gian">{fmtTimeVN(entry.changedAtMs)}</Row>
              <Row label="Người thao tác">{entry.changedByName || '(không tên)'}</Row>
              <Row label="Vai trò"><span className="font-mono text-xs">{entry.changedByRole}</span></Row>
              <Row label="UID"><span className="font-mono text-xs">{entry.changedBy}</span></Row>
              <Row label="Cơ sở">
                <span
                  className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: branch?.color ?? '#64748b' }}
                >
                  {branch?.name ?? entry.branchId}
                </span>
              </Row>
              <Row label="Tháng">{entry.month || '—'}</Row>
              <Row label="Action raw"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{entry.action}</code></Row>
              {entry.field && (
                <Row label="Field">
                  <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{entry.field}</code>
                </Row>
              )}
            </dl>
          </section>

          {/* Entity refs */}
          {(entry.batchId || entry.transactionId || entry.programId) && (
            <section>
              <h3 className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-1 mb-2">
                Đối tượng
              </h3>
              <dl className="grid grid-cols-1 gap-y-1.5">
                {entry.batchId && (
                  <Row label="Batch ID" wide>
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded break-all">{entry.batchId}</code>
                  </Row>
                )}
                {entry.transactionId && (
                  <Row label="Transaction ID" wide>
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded break-all">{entry.transactionId}</code>
                  </Row>
                )}
                {entry.programId && (
                  <Row label="Program ID" wide>
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded break-all">{entry.programId}</code>
                  </Row>
                )}
              </dl>
            </section>
          )}

          {/* Diff */}
          <section>
            <h3 className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-1 mb-2">
              Thay đổi
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold text-rose-600 mb-1">TRƯỚC</div>
                <pre className="text-xs bg-rose-50 border border-rose-100 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-64">
                  {fmtValue(entry.oldValue)}
                </pre>
              </div>
              <div>
                <div className="text-xs font-semibold text-emerald-700 mb-1">SAU</div>
                <pre className="text-xs bg-emerald-50 border border-emerald-100 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-64">
                  {fmtValue(entry.newValue)}
                </pre>
              </div>
            </div>
          </section>

          {/* Reason + IP */}
          {(entry.reason || entry.ip) && (
            <section>
              <h3 className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-1 mb-2">
                Bối cảnh
              </h3>
              <dl className="grid grid-cols-1 gap-y-1.5">
                {entry.reason && (
                  <Row label="Lý do" wide>{entry.reason}</Row>
                )}
                {entry.ip && (
                  <Row label="IP" wide><code className="text-xs">{entry.ip}</code></Row>
                )}
              </dl>
            </section>
          )}

          {/* Footer note */}
          <div className="text-xs text-slate-400 italic pt-2 border-t border-slate-100">
            🔒 Read-only. Audit log retention vĩnh viễn ≥10 năm. Không thể sửa/xóa.
          </div>
        </div>
      </aside>
    </>
  );
}

function Row({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  if (wide) {
    return (
      <>
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd className="text-sm text-slate-800">{children}</dd>
      </>
    );
  }
  return (
    <>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 col-span-2">{children}</dd>
    </>
  );
}
