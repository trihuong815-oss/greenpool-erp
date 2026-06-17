'use client';

// Detail modal: xem chi tiết batch + 2 action (Duyệt / Trả lại). Inline edit để
// "Sửa & Duyệt" cho kế toán — toggle "Bật sửa" trên header. Mỗi PATCH cell tự ghi audit.
// Phase 2 (2026-06-17).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Check, RotateCcw, Loader2, Pencil, Save } from 'lucide-react';
import type {
  SalesDailyBatch,
  SalesTransaction,
  BatchStatus,
  SalesV2Source,
  TransactionType,
  PaymentMethod,
} from '@/lib/types/sales-v2';
import { SOURCE_LABEL, TRANSACTION_TYPE_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/types/sales-v2';
import { showConfirm, showPrompt } from '@/components/ui/imperative-modal';
import AuditHistory from './AuditHistory';

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

interface Props {
  batch: SalesDailyBatch;
  canReview: boolean;
  onClose: () => void;
  onAfterAction: () => void;
}

export default function BatchDetailModal({ batch, canReview, onClose, onAfterAction }: Props) {
  const [rows, setRows] = useState<SalesTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState<null | 'approve' | 'return'>(null);
  const [error, setError] = useState<string | null>(null);

  const canAction = canReview && batch.status === 'pending_review';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/sales-v2/transactions?batchId=${encodeURIComponent(batch.id)}`);
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        const j = await r.json();
        if (!cancelled) setRows(j.transactions as SalesTransaction[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Lỗi tải');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [batch.id]);

  const totals = useMemo(() => {
    let sales = 0, collected = 0;
    for (const r of rows) {
      sales += r.packageValue;
      collected += r.collectedToday;
    }
    return { sales, collected, debt: Math.max(0, sales - collected), count: rows.length };
  }, [rows]);

  const handleUpdateRow = useCallback(async (id: string, patch: Partial<SalesTransaction>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      const r = await fetch(`/api/sales-v2/transactions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setRows((prev) => prev.map((r) => (r.id === id ? (j.transaction as SalesTransaction) : r)));
    } catch (e: any) {
      await showConfirm({
        title: 'Lưu lỗi',
        description: e?.message ?? 'unknown',
        confirmText: 'OK',
        cancelText: '',
        variant: 'danger',
      });
    }
  }, []);

  const handleApprove = useCallback(async () => {
    const ok = await showConfirm({
      title: `Duyệt batch ngày ${batch.date}?`,
      description:
        `Sale: ${batch.saleName}\n` +
        `${totals.count} giao dịch · DS ${totals.sales.toLocaleString()}đ · Thực thu ${totals.collected.toLocaleString()}đ · Công nợ ${totals.debt.toLocaleString()}đ\n\n` +
        `Sau khi duyệt, dữ liệu trở thành chính thức cho dashboard + báo cáo.`,
      confirmText: 'Duyệt',
      cancelText: 'Huỷ',
      variant: 'success',
    });
    if (!ok) return;
    setBusy('approve');
    try {
      const r = await fetch(`/api/sales-v2/batches/${encodeURIComponent(batch.id)}/approve`, { method: 'POST' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      onAfterAction();
    } catch (e: any) {
      await showConfirm({
        title: 'Duyệt lỗi',
        description: e?.message ?? 'unknown',
        confirmText: 'OK',
        cancelText: '',
        variant: 'danger',
      });
    } finally {
      setBusy(null);
    }
  }, [batch, totals, onAfterAction]);

  const handleReturn = useCallback(async () => {
    const reason = await showPrompt({
      title: `Trả lại Sale ${batch.saleName}`,
      description: 'Sale sẽ thấy lý do này khi mở /nhap. Tối thiểu 5 ký tự.',
      placeholder: 'VD: Sai gói khách hàng — kiểm tra lại HBTE 24B vs 36B',
      multiline: true,
      minLength: 5,
      maxLength: 500,
      confirmText: 'Trả lại',
      cancelText: 'Huỷ',
      variant: 'danger',
    });
    if (!reason) return;
    setBusy('return');
    try {
      const r = await fetch(`/api/sales-v2/batches/${encodeURIComponent(batch.id)}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      onAfterAction();
    } catch (e: any) {
      await showConfirm({
        title: 'Trả lại lỗi',
        description: e?.message ?? 'unknown',
        confirmText: 'OK',
        cancelText: '',
        variant: 'danger',
      });
    } finally {
      setBusy(null);
    }
  }, [batch, onAfterAction]);

  const meta = STATUS_META[batch.status];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-stretch md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div
        className="bg-white w-full md:max-w-[1400px] md:max-h-[92vh] md:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-800">
                {batch.saleName} · {fmtDate(batch.date)}
              </h2>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ${meta.cls}`}>
                {meta.label}
              </span>
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {batch.branchName} · {totals.count} giao dịch
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* KPI */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi label="Số GD" value={String(totals.count)} tone="slate" />
          <Kpi label="Doanh số" value={totals.sales.toLocaleString() + ' đ'} tone="emerald" />
          <Kpi label="Thực thu" value={totals.collected.toLocaleString() + ' đ'} tone="sky" />
          <Kpi label="Công nợ" value={totals.debt.toLocaleString() + ' đ'} tone="rose" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-2 md:px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="animate-spin mr-2" size={18} /> Đang tải giao dịch…
            </div>
          ) : error ? (
            <div className="text-center py-12 text-rose-600 text-sm">⚠️ {error}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Batch không có giao dịch nào.</div>
          ) : (
            <TransactionsTable rows={rows} editMode={editMode && canAction} onUpdate={handleUpdateRow} />
          )}
        </div>

        {/* Audit history (collapsed) */}
        <AuditHistory batchId={batch.id} />

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            {batch.status === 'pending_review' && batch.submittedAt && (
              <>Sale gửi: {new Date(batch.submittedAt).toLocaleString('vi-VN')}</>
            )}
            {batch.status === 'approved' && batch.reviewedAt && (
              <>Đã duyệt: {new Date(batch.reviewedAt).toLocaleString('vi-VN')}</>
            )}
            {batch.status === 'returned' && batch.returnReason && (
              <span className="text-rose-600 font-medium">Lý do trả lại: {batch.returnReason}</span>
            )}
          </div>
          {canAction ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                disabled={busy !== null}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ring-1 disabled:opacity-50 ${
                  editMode
                    ? 'bg-amber-50 text-amber-700 ring-amber-200'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {editMode ? <Save size={14} /> : <Pencil size={14} />}
                {editMode ? 'Đã bật sửa' : 'Sửa & duyệt'}
              </button>
              <button
                type="button"
                onClick={handleReturn}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-sm font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
              >
                {busy === 'return' ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />}
                Trả lại Sale
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-600 text-sm font-semibold text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
              >
                {busy === 'approve' ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                Duyệt toàn bộ
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-400">
              {batch.status !== 'pending_review' && '(Batch không ở trạng thái chờ duyệt)'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'emerald' | 'sky' | 'rose' }) {
  const cls = {
    slate:   'bg-white text-slate-700 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    sky:     'bg-sky-50 text-sky-700 ring-sky-200',
    rose:    'bg-rose-50 text-rose-700 ring-rose-200',
  }[tone];
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${cls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-base font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function TransactionsTable({
  rows, editMode, onUpdate,
}: {
  rows: SalesTransaction[];
  editMode: boolean;
  onUpdate: (id: string, patch: Partial<SalesTransaction>) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1500px] text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          <tr>
            <th className="px-2 py-2 text-left">#</th>
            <th className="px-2 py-2 text-left">Tên KH</th>
            <th className="px-2 py-2 text-left">SĐT</th>
            <th className="px-2 py-2 text-left">Người giám hộ</th>
            <th className="px-2 py-2 text-left">Nguồn</th>
            <th className="px-2 py-2 text-left">Gói</th>
            <th className="px-2 py-2 text-left">Loại GD</th>
            <th className="px-2 py-2 text-left">HT thu</th>
            <th className="px-2 py-2 text-right">Giá trị</th>
            <th className="px-2 py-2 text-right">Thu</th>
            <th className="px-2 py-2 text-right">Công nợ</th>
            <th className="px-2 py-2 text-left">Ghi chú</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={r.id} className="hover:bg-slate-50/60">
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{i + 1}</td>
              <td className="px-2 py-1.5"><EditableText value={r.customerName} disabled={!editMode} onCommit={(v) => onUpdate(r.id, { customerName: v })} /></td>
              <td className="px-2 py-1.5"><EditableText value={r.phone} disabled={!editMode} onCommit={(v) => onUpdate(r.id, { phone: v })} /></td>
              <td className="px-2 py-1.5">
                {r.isChildPackage ? (
                  <EditableText value={r.guardianName ?? ''} disabled={!editMode} onCommit={(v) => onUpdate(r.id, { guardianName: v || null })} />
                ) : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-2 py-1.5">
                {editMode ? (
                  <select value={r.source} onChange={(e) => onUpdate(r.id, { source: e.target.value as SalesV2Source })}
                    className="w-full px-1.5 py-1 text-xs rounded border border-slate-200 bg-white">
                    {(Object.keys(SOURCE_LABEL) as SalesV2Source[]).map((k) => (
                      <option key={k} value={k}>{SOURCE_LABEL[k]}</option>
                    ))}
                  </select>
                ) : <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">{SOURCE_LABEL[r.source]}</span>}
              </td>
              <td className="px-2 py-1.5">
                <div className="text-xs">
                  <div className="font-medium text-slate-700">{r.packageName}</div>
                  <div className="text-slate-400 text-[10px]">{r.serviceGroup}</div>
                </div>
              </td>
              <td className="px-2 py-1.5">
                {editMode ? (
                  <select value={r.transactionType} onChange={(e) => onUpdate(r.id, { transactionType: e.target.value as TransactionType })}
                    className="w-full px-1.5 py-1 text-xs rounded border border-slate-200 bg-white">
                    {(Object.keys(TRANSACTION_TYPE_LABEL) as TransactionType[]).map((k) => (
                      <option key={k} value={k}>{TRANSACTION_TYPE_LABEL[k]}</option>
                    ))}
                  </select>
                ) : <span className="text-xs">{TRANSACTION_TYPE_LABEL[r.transactionType]}</span>}
              </td>
              <td className="px-2 py-1.5">
                {editMode ? (
                  <select value={r.paymentMethod} onChange={(e) => onUpdate(r.id, { paymentMethod: e.target.value as PaymentMethod })}
                    className="w-full px-1.5 py-1 text-xs rounded border border-slate-200 bg-white">
                    {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => (
                      <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>
                    ))}
                  </select>
                ) : <span className="text-xs">{PAYMENT_METHOD_LABEL[r.paymentMethod]}</span>}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                <EditableNumber value={r.packageValue} disabled={!editMode} onCommit={(v) => onUpdate(r.id, { packageValue: v })} />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                <EditableNumber value={r.collectedToday} disabled={!editMode} onCommit={(v) => onUpdate(r.id, { collectedToday: v })} />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                {r.debtAmount > 0
                  ? <span className="text-rose-600">{r.debtAmount.toLocaleString()}</span>
                  : <span className="text-slate-300">0</span>}
              </td>
              <td className="px-2 py-1.5">
                <EditableText value={r.note ?? ''} disabled={!editMode} onCommit={(v) => onUpdate(r.id, { note: v || null })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditableText({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  if (disabled) return <span className="text-slate-700">{value || <span className="text-slate-300">—</span>}</span>;
  return (
    <input
      type="text"
      defaultValue={value}
      onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value); }}
      className="w-full px-2 py-1 rounded border border-slate-200 text-sm focus:bg-white focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 focus:outline-none"
    />
  );
}

function EditableNumber({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (v: number) => void }) {
  if (disabled) return <span className="text-slate-700">{value.toLocaleString()}</span>;
  return (
    <input
      type="number"
      min={0}
      defaultValue={value || ''}
      onBlur={(e) => { const n = Number(e.target.value) || 0; if (n !== value) onCommit(n); }}
      className="w-full px-2 py-1 rounded border border-slate-200 text-sm text-right tabular-nums focus:bg-white focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 focus:outline-none"
    />
  );
}
