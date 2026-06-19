'use client';

// Detail modal: xem chi tiết batch + 2 action (Duyệt / Trả lại). Inline edit để
// "Sửa & Duyệt" cho kế toán — toggle "Bật sửa" trên header. Mỗi PATCH cell tự ghi audit.
// Phase 2 (2026-06-17).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Check, XCircle, CheckCircle2, RotateCcw, Loader2, Pencil, Save } from 'lucide-react';
import type {
  SalesDailyBatch,
  SalesTransaction,
  BatchStatus,
  SalesV2Source,
  TransactionType,
  PaymentMethod,
  TxReviewStatus,
} from '@/lib/types/sales-v2';
import { SOURCE_LABEL, TRANSACTION_TYPE_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/types/sales-v2';
import { branchName } from '@/lib/branches';
import { showConfirm, showPrompt } from '@/components/ui/imperative-modal';
import AuditHistory from './AuditHistory';
import MatchPicker, { MatchStatusBadge } from './MatchPicker';

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
  const [matchPickerTx, setMatchPickerTx] = useState<SalesTransaction | null>(null);

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

  // V6 2026-06-17: review counts cho footer auto-enable
  const reviewCounts = useMemo(() => {
    let pending = 0, approved = 0, rejected = 0;
    for (const r of rows) {
      const s = r.reviewStatus ?? 'pending';
      if (s === 'approved') approved++;
      else if (s === 'rejected') rejected++;
      else pending++;
    }
    return { pending, approved, rejected, total: rows.length };
  }, [rows]);

  const canApprove = canAction && reviewCounts.total > 0 && reviewCounts.pending === 0 && reviewCounts.rejected === 0;
  const canReturn = canAction && reviewCounts.rejected > 0;

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

  const handleReview = useCallback(async (id: string, status: TxReviewStatus, currentReason?: string | null) => {
    let reason: string | null = null;
    if (status === 'rejected') {
      const r = await showPrompt({
        title: 'Đánh dấu lỗi giao dịch',
        description: 'Nhập lý do để Sale biết cần sửa gì. Tối thiểu 5 ký tự.',
        defaultValue: currentReason ?? '',
        placeholder: 'VD: Sai gói (HBTE 24B thay vì 36B), giá nhập thiếu 0...',
        multiline: true,
        minLength: 5,
        maxLength: 500,
        confirmText: 'Đánh dấu lỗi',
        cancelText: 'Huỷ',
        variant: 'danger',
      });
      if (!r) return;
      reason = r;
    }
    // Optimistic
    setRows((prev) => prev.map((row) =>
      row.id === id
        ? { ...row, reviewStatus: status, rejectReason: status === 'rejected' ? reason : null }
        : row,
    ));
    try {
      const r = await fetch(`/api/sales-v2/transactions/${encodeURIComponent(id)}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, reason }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setRows((prev) => prev.map((row) => (row.id === id ? (j.transaction as SalesTransaction) : row)));
    } catch (e: any) {
      await showConfirm({
        title: 'Review lỗi',
        description: e?.message ?? 'unknown',
        confirmText: 'OK',
        cancelText: '',
        variant: 'danger',
      });
    }
  }, []);

  const handleApprove = useCallback(async () => {
    const ok = await showConfirm({
      title: `Duyệt ${reviewCounts.approved} giao dịch ngày ${batch.date}?`,
      description:
        `Sale: ${batch.saleName}\n` +
        `${totals.count} giao dịch · DS ${totals.sales.toLocaleString()}đ · Thực thu ${totals.collected.toLocaleString()}đ · Công nợ ${totals.debt.toLocaleString()}đ\n\n` +
        `Toàn bộ giao dịch đã tick ✓. Sau khi duyệt, dữ liệu trở thành chính thức cho dashboard + báo cáo.`,
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
  }, [batch, totals, reviewCounts, onAfterAction]);

  const handleReturn = useCallback(async () => {
    const ok = await showConfirm({
      title: `Trả lại ${reviewCounts.rejected} giao dịch lỗi?`,
      description:
        `Sale: ${batch.saleName}\n` +
        `Có ${reviewCounts.rejected} giao dịch đã tick ✗ (lý do từng dòng đã ghi).\n\n` +
        `Sale sẽ thấy danh sách lỗi + sửa rồi gửi đối chiếu lại.`,
      confirmText: 'Trả lại Sale',
      cancelText: 'Huỷ',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy('return');
    try {
      const r = await fetch(`/api/sales-v2/batches/${encodeURIComponent(batch.id)}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}), // server gom từng tx.rejectReason
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
  }, [batch, reviewCounts, onAfterAction]);

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
              {branchName(batch.branchId)} · {totals.count} giao dịch
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

        {/* V6 2026-06-17: Review progress strip (chỉ hiện khi pending_review) */}
        {canAction && reviewCounts.total > 0 && (
          <div className="px-5 py-2 bg-white border-b border-slate-200 flex items-center gap-3 text-xs">
            <span className="text-slate-500 font-semibold uppercase tracking-wider">Tiến độ review</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              <span className="font-bold tabular-nums">{reviewCounts.approved}</span>
              <span>/ {reviewCounts.total}</span>
              <CheckCircle2 size={11} className="text-emerald-600" />
            </span>
            {reviewCounts.rejected > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
                <span className="font-bold tabular-nums">{reviewCounts.rejected}</span> ✗
              </span>
            )}
            {reviewCounts.pending > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                <span className="font-bold tabular-nums">{reviewCounts.pending}</span> chưa tick
              </span>
            )}
          </div>
        )}

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
            <TransactionsTable
              rows={rows}
              editMode={editMode && canAction}
              canReview={canAction}
              canManualLink={canReview && batch.status === 'approved'}
              onUpdate={handleUpdateRow}
              onReview={handleReview}
              onOpenMatchPicker={(tx) => setMatchPickerTx(tx)}
            />
          )}
        </div>

        {/* Audit history (collapsed) */}
        <AuditHistory batchId={batch.id} />

        {/* Match picker modal (Phase 4) — overlay khi click cột Link */}
        {matchPickerTx && (
          <MatchPicker
            tx={matchPickerTx}
            onClose={() => setMatchPickerTx(null)}
            onLinked={(newTx) => {
              setRows((prev) => prev.map((r) => (r.id === newTx.id ? newTx : r)));
              setMatchPickerTx(null);
            }}
          />
        )}

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
                disabled={busy !== null || !canReturn}
                title={canReturn ? `Trả lại ${reviewCounts.rejected} giao dịch lỗi` : 'Tick ✗ ít nhất 1 giao dịch lỗi để trả lại'}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-sm font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy === 'return' ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />}
                Trả lại Sale{canReturn && ` (${reviewCounts.rejected})`}
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={busy !== null || !canApprove}
                title={canApprove
                  ? `Duyệt ${reviewCounts.approved} giao dịch`
                  : reviewCounts.rejected > 0
                    ? 'Có giao dịch lỗi — phải Trả lại Sale trước'
                    : 'Tick ✓ tất cả giao dịch để duyệt'}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-600 text-sm font-semibold text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy === 'approve' ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                Duyệt toàn bộ{canApprove && ` (${reviewCounts.approved})`}
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
  rows, editMode, canReview, canManualLink, onUpdate, onReview, onOpenMatchPicker,
}: {
  rows: SalesTransaction[];
  editMode: boolean;
  canReview: boolean;
  canManualLink: boolean;
  onUpdate: (id: string, patch: Partial<SalesTransaction>) => void;
  onReview: (id: string, status: TxReviewStatus, currentReason?: string | null) => void;
  onOpenMatchPicker: (tx: SalesTransaction) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[2040px] text-sm table-fixed">
        <colgroup>
          <col style={{ width: 100 }} />  {/* Review ✓ ✗ */}
          <col style={{ width: 40 }} />   {/* # */}
          <col style={{ width: 200 }} />  {/* Tên KH */}
          <col style={{ width: 130 }} />  {/* SĐT */}
          <col style={{ width: 150 }} />  {/* Người giám hộ */}
          <col style={{ width: 130 }} />  {/* Nguồn */}
          <col style={{ width: 180 }} />  {/* Gói */}
          <col style={{ width: 140 }} />  {/* Loại GD */}
          <col style={{ width: 130 }} />  {/* HT thu */}
          <col style={{ width: 110 }} />  {/* Số PT */}
          <col style={{ width: 110 }} />  {/* Số HĐ */}
          <col style={{ width: 110 }} />  {/* Giá trị */}
          <col style={{ width: 110 }} />  {/* Thu */}
          <col style={{ width: 100 }} />  {/* Công nợ */}
          <col style={{ width: 100 }} />  {/* Link */}
          <col style={{ width: 140 }} />  {/* Ghi chú */}
        </colgroup>
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          <tr>
            <th className="px-2 py-2 text-center">Review</th>
            <th className="px-2 py-2 text-center">#</th>
            <th className="px-2 py-2 text-left">Tên KH</th>
            <th className="px-2 py-2 text-left">SĐT</th>
            <th className="px-2 py-2 text-left">Người giám hộ</th>
            <th className="px-2 py-2 text-left">Nguồn</th>
            <th className="px-2 py-2 text-left">Gói</th>
            <th className="px-2 py-2 text-left">Loại GD</th>
            <th className="px-2 py-2 text-left">HT thu</th>
            <th className="px-2 py-2 text-left">Số PT</th>
            <th className="px-2 py-2 text-left">Số HĐ</th>
            <th className="px-2 py-2 text-right">Giá trị</th>
            <th className="px-2 py-2 text-left">Khuyến mãi</th>
            <th className="px-2 py-2 text-right">Thu</th>
            <th className="px-2 py-2 text-right">Công nợ</th>
            <th className="px-2 py-2 text-center">Link</th>
            <th className="px-2 py-2 text-left">Ghi chú</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => {
            const rs = r.reviewStatus ?? 'pending';
            const rowBg =
              rs === 'approved' ? 'bg-emerald-50/40 hover:bg-emerald-50/70' :
              rs === 'rejected' ? 'bg-rose-50/40 hover:bg-rose-50/70' :
                                  'hover:bg-slate-50/60';
            return (
            <tr key={r.id} className={rowBg}>
              <td className="px-2 py-1.5 text-center">
                <ReviewToggle
                  status={rs}
                  rejectReason={r.rejectReason ?? null}
                  disabled={!canReview}
                  onApprove={() => onReview(r.id, 'approved')}
                  onReject={() => onReview(r.id, 'rejected', r.rejectReason)}
                  onReset={() => onReview(r.id, 'pending')}
                />
              </td>
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
                  <div className="font-medium text-slate-700 flex items-center gap-1.5 flex-wrap">
                    <span>{r.packageName}</span>
                    {r.packageIsCustomQuantity && (
                      <span
                        className="text-xs uppercase font-bold text-violet-700 bg-violet-100 px-1 py-0.5 rounded ring-1 ring-violet-200"
                        title={`Gói tính theo ${r.packageUnitName || 'buổi'} (PT) — packageValue = số ${r.packageUnitName || 'buổi'} × đơn giá. Sale sửa qua /nhap khi batch returned.`}
                      >
                        PT
                      </span>
                    )}
                    {r.packageManualPriceWithQty && (
                      <span
                        className="text-xs uppercase font-bold text-amber-700 bg-amber-100 px-1 py-0.5 rounded ring-1 ring-amber-200"
                        title="Sale tự nhập giá trị gói + ghi số buổi (note). Giá trị không có công thức tự động."
                      >
                        Tự nhập
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400 text-xs">{r.serviceGroup}</div>
                  {/* V8.Y manual mode: số buổi (note) */}
                  {r.packageManualPriceWithQty && r.quantity != null && r.quantity > 0 && (
                    <div className="text-amber-700 text-xs mt-0.5">
                      Số buổi: <span className="font-semibold">{r.quantity.toLocaleString()}</span>
                    </div>
                  )}
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
              <td className="px-2 py-1.5">
                <EditableText value={r.receiptNo ?? ''} disabled={!editMode} onCommit={(v) => onUpdate(r.id, { receiptNo: v || null })} />
              </td>
              <td className="px-2 py-1.5">
                <EditableText value={r.contractNo ?? ''} disabled={!editMode} onCommit={(v) => onUpdate(r.id, { contractNo: v || null })} />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {(() => {
                  // V7 Promo (2026-06-18): server lưu packageValue = FINAL (sau discount).
                  // basePackageValue = TRƯỚC discount. Hiển thị cả 2 + dấu trừ rõ.
                  const base = Number(r.basePackageValue ?? r.packageValue ?? 0);
                  const discount = Number(r.discountAmount ?? 0);
                  const hasDiscount = discount > 0;
                  if (r.packageIsCustomQuantity) {
                    // PT: readonly. Show qty × up = base, − discount = final.
                    return (
                      <div title="Gói PT — Sale sửa số buổi / đơn giá ở /nhap (sau khi reject)">
                        <div className="text-[10px] text-slate-400 leading-tight">
                          {(r.quantity ?? 0).toLocaleString()} {r.packageUnitName || 'buổi'} × {(r.unitPrice ?? 0).toLocaleString()}
                        </div>
                        {hasDiscount && (
                          <div className="text-[10px] text-slate-500 leading-tight">
                            = {base.toLocaleString()} − {discount.toLocaleString()}
                          </div>
                        )}
                        <div className={`font-semibold leading-tight ${hasDiscount ? 'text-emerald-700' : 'text-slate-700'}`}>
                          {r.packageValue.toLocaleString()}
                        </div>
                      </div>
                    );
                  }
                  // Non-PT: EditableNumber nhập BASE (server tự recompute discount + final).
                  // Khi có discount: hiển thị base lớn + sub-text "= final" để kế toán hiểu.
                  return (
                    <div>
                      <EditableNumber value={base} disabled={!editMode}
                        onCommit={(v) => onUpdate(r.id, { packageValue: v })} />
                      {hasDiscount && (
                        <div className="text-[10px] text-emerald-700 leading-tight mt-0.5 tabular-nums">
                          − {discount.toLocaleString()} → <strong>{r.packageValue.toLocaleString()}</strong>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </td>
              {/* V7 Promo (2026-06-18): hiển thị mã KM cho kế toán đối chiếu — readonly */}
              <td className="px-2 py-1.5">
                {Array.isArray(r.promoSnapshots) && r.promoSnapshots.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {r.promoSnapshots.map((s) => {
                      const isDis = s.type === 'percent' || s.type === 'fixed_amount';
                      return (
                        <span key={s.id}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 max-w-fit ${
                            isDis ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
                          }`}
                          title={s.name}>
                          <span className="font-mono font-bold">{s.code || '(no-code)'}</span>
                          <span className="opacity-60">·</span>
                          <span>
                            {s.type === 'percent' && `-${s.value}%`}
                            {s.type === 'fixed_amount' && `-${s.value.toLocaleString()}đ`}
                            {s.type === 'bonus_sessions' && `+${s.value} buổi`}
                            {s.type === 'bonus_days' && `+${s.value} ngày`}
                          </span>
                        </span>
                      );
                    })}
                    {(r.bonusQuantity ?? 0) > 0 && (
                      <span className="text-[10px] text-rose-700 tabular-nums">Tặng {r.bonusQuantity} {r.packageUnitName || 'buổi'}</span>
                    )}
                    {(r.bonusDays ?? 0) > 0 && (
                      <span className="text-[10px] text-cyan-700 tabular-nums">Tặng {r.bonusDays} ngày</span>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-300 text-xs">—</span>
                )}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                <EditableNumber value={r.collectedToday} disabled={!editMode} onCommit={(v) => onUpdate(r.id, { collectedToday: v })} />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                {r.debtAmount > 0
                  ? <span className="text-rose-600">{r.debtAmount.toLocaleString()}</span>
                  : <span className="text-slate-300">0</span>}
              </td>
              <td className="px-2 py-1.5 text-center">
                <MatchStatusBadge
                  tx={r}
                  onClick={canManualLink && r.transactionType === 'thanh_toan_not' ? () => onOpenMatchPicker(r) : undefined}
                />
              </td>
              <td className="px-2 py-1.5">
                <EditableText value={r.note ?? ''} disabled={!editMode} onCommit={(v) => onUpdate(r.id, { note: v || null })} />
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Cụm 2 nút ✓ / ✗ per row. Click ✗ mở prompt nhập lý do.
 *  Nếu row đã approved/rejected, hiển thị badge + nút "↺ Reset". */
function ReviewToggle({
  status, rejectReason, disabled, onApprove, onReject, onReset,
}: {
  status: TxReviewStatus;
  rejectReason: string | null;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
  onReset: () => void;
}) {
  if (status === 'approved') {
    return (
      <button
        type="button"
        onClick={disabled ? undefined : onReset}
        disabled={disabled}
        title={disabled ? 'Đã duyệt' : 'Bỏ tick (về chưa review)'}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-bold ring-1 ring-emerald-300 hover:bg-emerald-200 disabled:cursor-not-allowed"
      >
        <CheckCircle2 size={14} /> OK
      </button>
    );
  }
  if (status === 'rejected') {
    return (
      <button
        type="button"
        onClick={disabled ? undefined : onReject}
        disabled={disabled}
        title={rejectReason ? `Lý do: ${rejectReason}\n\nClick để sửa lý do` : 'Click để sửa lý do'}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-100 text-rose-700 text-xs font-bold ring-1 ring-rose-300 hover:bg-rose-200 disabled:cursor-not-allowed"
      >
        <XCircle size={14} /> Lỗi
      </button>
    );
  }
  // pending
  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={onApprove}
        disabled={disabled}
        title="Đánh dấu OK"
        className="p-1.5 rounded-md bg-white ring-1 ring-slate-200 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        title="Đánh dấu lỗi"
        className="p-1.5 rounded-md bg-white ring-1 ring-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-700 hover:ring-rose-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        <X size={14} />
      </button>
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
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState<string>(value > 0 ? String(value) : '');
  useEffect(() => { if (!editing) setRaw(value > 0 ? String(value) : ''); }, [value, editing]);
  if (disabled) return <span className="text-slate-700 tabular-nums">{value.toLocaleString()}</span>;
  const display = editing ? raw : (value > 0 ? value.toLocaleString() : '');
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onFocus={() => setEditing(true)}
      onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => {
        setEditing(false);
        const n = Number(raw) || 0;
        if (n !== value) onCommit(n);
      }}
      className="w-full px-2 py-1 rounded border border-slate-200 text-sm text-right tabular-nums focus:bg-white focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 focus:outline-none"
    />
  );
}
