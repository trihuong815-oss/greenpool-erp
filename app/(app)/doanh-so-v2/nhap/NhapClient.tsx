'use client';

// Sale nhập doanh số ngày — orchestrator.
// Phase 1 (2026-06-17).
// State: batch (today) + rows (đã save) + localRows (đang edit chưa POST).
// Action: Thêm dòng / Lưu tạm / Gửi đối chiếu.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, Send, AlertCircle, Loader2 } from 'lucide-react';
import type { SalesDailyBatch, SalesTransaction, SalesTransactionInput, BatchStatus } from '@/lib/types/sales-v2';
import type { SalesV2Package } from '@/lib/sales-v2/packages';
import type { BranchId } from '@/lib/branches';
import SalesGrid, { type LocalRow, makeEmptyRow, validateRow, isRowEmpty, isValidPhone } from './_components/SalesGrid';
import MobileNhapView from './_components/MobileNhapView';
import { showConfirm } from '@/components/ui/imperative-modal';

interface Props {
  branchId: BranchId;
  branchName: string;
  saleName: string;
  packages: SalesV2Package[];
}

const STATUS_LABEL: Record<BatchStatus, { label: string; cls: string }> = {
  draft:           { label: 'Nháp',              cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  pending_review:  { label: 'Chờ đối chiếu',     cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  approved:        { label: 'Đã đối chiếu',      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  returned:        { label: 'Trả lại chỉnh sửa', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  locked:          { label: 'Đã khoá',           cls: 'bg-slate-200 text-slate-600 ring-slate-300' },
};

function todayInVN(): string {
  // YYYY-MM-DD theo VN timezone (UTC+7)
  const ms = Date.now() + 7 * 3600 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function fmtDateVi(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const MAX_PAST_DAYS = 7;
function minSelectableDate(): string {
  const ms = Date.now() + 7 * 3600 * 1000 - MAX_PAST_DAYS * 24 * 3600 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// V6 (2026-06-17): persist local rows (typing chưa save) qua reload bằng localStorage.
// Key = saleId_date (== batch.id). Sang ngày mới key mới → tự reset, không leak day cũ.
const STORAGE_PREFIX = 'gp-sales-v2-draft-';
const storageKey = (batchId: string) => `${STORAGE_PREFIX}${batchId}`;

export default function NhapClient({ branchId, branchName, saleName, packages }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(todayInVN());
  const [batch, setBatch] = useState<SalesDailyBatch | null>(null);
  const [rows, setRows] = useState<SalesTransaction[]>([]);
  const [localRows, setLocalRows] = useState<LocalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false); // true sau khi load localStorage xong
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // === Boot/reload khi đổi ngày: get-or-create batch + load transactions ===
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBatch(null);
    setRows([]);
    setLocalRows([]);
    setHydrated(false); // reset để rehydrate cho batch mới
    (async () => {
      try {
        const r = await fetch('/api/sales-v2/batches/by-date', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ date: selectedDate }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        const j = await r.json();
        if (cancelled) return;
        setBatch(j.batch as SalesDailyBatch);

        const txR = await fetch(`/api/sales-v2/transactions?batchId=${encodeURIComponent(j.batch.id)}`);
        if (!txR.ok) throw new Error((await txR.json().catch(() => ({}))).error ?? `HTTP ${txR.status}`);
        const txJ = await txR.json();
        if (cancelled) return;
        setRows(txJ.transactions as SalesTransaction[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Lỗi tải dữ liệu');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate]);

  // === Derived ===
  const canEdit = useMemo(() => {
    if (!batch) return false;
    return batch.status === 'draft' || batch.status === 'returned';
  }, [batch]);

  // Hydrate localRows từ localStorage sau khi batch ready. Cleanup key của ngày cũ.
  useEffect(() => {
    if (!batch || hydrated) return;
    try {
      const raw = localStorage.getItem(storageKey(batch.id));
      if (raw) {
        const parsed = JSON.parse(raw) as LocalRow[];
        if (Array.isArray(parsed)) setLocalRows(parsed);
      }
      // Cleanup key của ngày cũ cho cùng Sale (sang ngày mới: key mới khác, key cũ xoá)
      const prefix = `${STORAGE_PREFIX}${batch.saleId}_`;
      const currentKey = storageKey(batch.id);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix) && k !== currentKey) localStorage.removeItem(k);
      }
    } catch (e) {
      console.warn('[sales-v2] localStorage hydrate fail:', e);
    }
    setHydrated(true);
  }, [batch, hydrated]);

  // Persist localRows → localStorage mỗi khi state thay đổi (chỉ sau khi hydrate xong).
  useEffect(() => {
    if (!batch || !hydrated) return;
    try {
      if (localRows.length === 0) localStorage.removeItem(storageKey(batch.id));
      else localStorage.setItem(storageKey(batch.id), JSON.stringify(localRows));
    } catch (e) {
      console.warn('[sales-v2] localStorage save fail:', e);
    }
  }, [batch, hydrated, localRows]);

  // V6 (2026-06-17): Auto-ensure trailing empty row khi có thể edit — Sale không cần
  // kéo lên bấm "+ Thêm dòng" mỗi lần. Khi row cuối có dữ liệu → tự thêm 1 empty row
  // ngay sau để typing tiếp. Chỉ chạy SAU hydrate để không ghi đè localStorage data.
  useEffect(() => {
    if (!canEdit || !hydrated) return;
    setLocalRows((prev) => {
      if (prev.length === 0) return [makeEmptyRow()];
      const last = prev[prev.length - 1];
      const hasData = last.customerName.trim() || last.phone.trim() || last.packageId;
      if (hasData) return [...prev, makeEmptyRow()];
      return prev;
    });
  }, [localRows, canEdit, hydrated]);

  const totals = useMemo(() => {
    let sales = 0, collected = 0, count = 0;
    for (const r of rows) {
      sales += r.packageValue;
      collected += r.collectedToday;
      count++;
    }
    // Preview cộng localRows có dữ liệu (KHÔNG cần valid full để user thấy
    // tiền ngay khi vừa gõ; validate đủ fields chỉ check khi bấm Lưu tạm/Gửi).
    for (const lr of localRows) {
      if (isRowEmpty(lr)) continue; // skip row trống auto-add
      const pv = Number(lr.packageValue) || 0;
      const ct = Number(lr.collectedToday) || 0;
      sales += pv;
      collected += ct;
      count++;
    }
    return { sales, collected, debt: Math.max(0, sales - collected), count };
  }, [rows, localRows]);

  // === Handlers ===
  const handleAddRow = useCallback(() => {
    setLocalRows((prev) => [...prev, makeEmptyRow()]);
  }, []);

  const handleUpdateLocal = useCallback((tempId: string, patch: Partial<LocalRow>) => {
    setLocalRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
  }, []);

  const handleRemoveLocal = useCallback((tempId: string) => {
    setLocalRows((prev) => prev.filter((r) => r.tempId !== tempId));
  }, []);

  const handleUpdateSaved = useCallback(async (id: string, patch: Partial<SalesTransaction>) => {
    // Validate phone trước khi PATCH (server cũng check nhưng pre-empt để rõ UX)
    if (patch.phone !== undefined && patch.phone !== null && patch.phone.trim() && !isValidPhone(patch.phone)) {
      showToast('err', 'SĐT phải 10 số bắt đầu bằng 0');
      // Force re-render input về giá trị cũ (state không đổi nên defaultValue input vẫn cũ)
      return;
    }
    // Lưu old state để rollback nếu server reject
    const oldRow = rows.find((r) => r.id === id) ?? null;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      const r = await fetch(`/api/sales-v2/transactions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setRows((prev) => prev.map((row) => (row.id === id ? (j.transaction as SalesTransaction) : row)));
    } catch (e: any) {
      // Rollback optimistic → tránh client hiển thị giá trị sai lệch với server
      if (oldRow) setRows((prev) => prev.map((r) => (r.id === id ? oldRow : r)));
      showToast('err', `Lưu lỗi: ${e?.message ?? 'unknown'}`);
    }
  }, [rows, showToast]);

  const handleRemoveSaved = useCallback(async (id: string) => {
    const ok = await showConfirm({
      title: 'Xoá dòng này?',
      description: 'Giao dịch đã lưu sẽ bị xoá khỏi batch.',
      confirmText: 'Xoá',
      cancelText: 'Huỷ',
      variant: 'danger',
    });
    if (!ok) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    try {
      const r = await fetch(`/api/sales-v2/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    } catch (e: any) {
      showToast('err', `Xoá lỗi: ${e?.message ?? 'unknown'}`);
    }
  }, [showToast]);

  /** Lưu tạm: POST các localRows hợp lệ → thành rows. Báo lỗi rows không hợp lệ.
   *  Row hoàn toàn rỗng (do auto-add trailing) → giữ lại làm placeholder, KHÔNG count. */
  const handleSaveDraft = useCallback(async (): Promise<{ savedCount: number; invalidCount: number; failedCount: number }> => {
    if (!batch) return { savedCount: 0, invalidCount: 0, failedCount: 0 };
    setSaving(true);
    const stillLocal: LocalRow[] = [];
    let savedCount = 0, invalidCount = 0, failedCount = 0;
    const newSavedRows: SalesTransaction[] = [];
    for (const lr of localRows) {
      // Skip row trống — auto-add trailing chưa nhập gì, không phải lỗi
      if (isRowEmpty(lr)) {
        stillLocal.push(lr);
        continue;
      }
      const v = validateRow(lr);
      if (!v.ok) {
        invalidCount++;
        stillLocal.push({ ...lr, errorMessage: v.error });
        continue;
      }
      try {
        const input: SalesTransactionInput & { batchId: string } = {
          batchId: batch.id,
          customerName: lr.customerName,
          phone: lr.phone,
          guardianName: lr.guardianName || null,
          source: lr.source!,
          packageId: lr.packageId!,
          transactionType: lr.transactionType!,
          paymentMethod: lr.paymentMethod!,
          packageValue: Number(lr.packageValue),
          collectedToday: Number(lr.collectedToday),
          note: lr.note || null,
        };
        const r = await fetch('/api/sales-v2/transactions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!r.ok) {
          const err = (await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`;
          failedCount++;
          stillLocal.push({ ...lr, errorMessage: err });
          continue;
        }
        const j = await r.json();
        newSavedRows.push(j.transaction as SalesTransaction);
        savedCount++;
      } catch (e: any) {
        failedCount++;
        stillLocal.push({ ...lr, errorMessage: e?.message ?? 'Lỗi mạng' });
      }
    }
    if (newSavedRows.length > 0) {
      setRows((prev) => [...prev, ...newSavedRows]);
    }
    setLocalRows(stillLocal);
    setSaving(false);
    return { savedCount, invalidCount, failedCount };
  }, [batch, localRows]);

  const handleSaveDraftClick = useCallback(async () => {
    const res = await handleSaveDraft();
    if (res.savedCount > 0 && res.invalidCount === 0 && res.failedCount === 0) {
      showToast('ok', `Đã lưu ${res.savedCount} dòng`);
    } else if (res.savedCount > 0) {
      showToast('ok', `Lưu ${res.savedCount} dòng. Còn ${res.invalidCount + res.failedCount} dòng cần kiểm tra.`);
    } else if (res.invalidCount + res.failedCount > 0) {
      showToast('err', `${res.invalidCount + res.failedCount} dòng chưa hợp lệ — xem chi tiết ở mỗi dòng`);
    } else {
      showToast('ok', 'Chưa có dòng nào để lưu');
    }
  }, [handleSaveDraft, showToast]);

  const handleSubmit = useCallback(async () => {
    if (!batch) return;
    if (rows.length === 0 && localRows.every((r) => !validateRow(r).ok)) {
      showToast('err', 'Chưa có giao dịch nào để gửi');
      return;
    }
    const ok = await showConfirm({
      title: `Gửi đối chiếu ngày ${batch.date}?`,
      description:
        `Tổng giao dịch: ${totals.count}\n` +
        `Doanh số: ${totals.sales.toLocaleString()} VND\n` +
        `Thực thu: ${totals.collected.toLocaleString()} VND\n` +
        `Công nợ: ${totals.debt.toLocaleString()} VND\n\n` +
        `Sau khi gửi, bạn không sửa được nữa trừ khi kế toán trả lại.`,
      confirmText: 'Gửi đối chiếu',
      cancelText: 'Huỷ',
      variant: 'success',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      // 1. Save tạm trước (auto-save localRows hợp lệ)
      const draftRes = await handleSaveDraft();
      if (draftRes.invalidCount + draftRes.failedCount > 0) {
        showToast('err', `Còn ${draftRes.invalidCount + draftRes.failedCount} dòng chưa hợp lệ — vui lòng kiểm tra trước khi gửi`);
        setSubmitting(false);
        return;
      }
      // 2. Submit batch
      const r = await fetch(`/api/sales-v2/batches/${encodeURIComponent(batch.id)}/submit`, { method: 'POST' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      // 3. Refresh batch state
      const bR = await fetch(`/api/sales-v2/batches/${encodeURIComponent(batch.id)}`);
      if (bR.ok) {
        const bJ = await bR.json();
        setBatch(bJ.batch as SalesDailyBatch);
      }
      showToast('ok', 'Đã gửi đối chiếu cho kế toán');
    } catch (e: any) {
      showToast('err', `Gửi lỗi: ${e?.message ?? 'unknown'}`);
    } finally {
      setSubmitting(false);
    }
  }, [batch, rows.length, localRows, totals, handleSaveDraft, showToast]);

  // === Render ===
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <Loader2 className="animate-spin text-emerald-600" size={28} />
        <span className="ml-2 text-sm text-slate-500">Đang tải bảng nhập…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="card max-w-md text-center">
          <AlertCircle className="mx-auto mb-3 text-rose-500" size={40} />
          <div className="font-bold text-slate-800 mb-1">Lỗi tải dữ liệu</div>
          <div className="text-sm text-slate-500">{error}</div>
        </div>
      </div>
    );
  }

  if (!batch) return null;

  const statusMeta = STATUS_LABEL[batch.status];

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* Header info */}
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-800">Nhập doanh số ngày</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                <span><span className="text-slate-400">Cơ sở:</span> <strong>{branchName}</strong></span>
                <span className="text-slate-300">·</span>
                <span><span className="text-slate-400">Sale:</span> <strong>{saleName}</strong></span>
                <span className="text-slate-300">·</span>
                <label className="inline-flex items-center gap-2">
                  <span className="text-slate-400">Ngày:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    min={minSelectableDate()}
                    max={todayInVN()}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-2 py-1 rounded border border-slate-200 bg-white text-sm font-semibold focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  />
                  {selectedDate !== todayInVN() && (
                    <button
                      type="button"
                      onClick={() => setSelectedDate(todayInVN())}
                      className="text-xs text-emerald-600 hover:text-emerald-700 underline"
                    >
                      → Hôm nay
                    </button>
                  )}
                </label>
              </div>
              {selectedDate !== todayInVN() && (
                <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 ring-1 ring-amber-200 text-[11px] text-amber-700">
                  ⚠️ Đang nhập cho ngày <strong>{fmtDateVi(selectedDate)}</strong> (không phải hôm nay)
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                💡 Gõ tên thẻ/gói (vd "Thẻ học bơi", "120 lượt") để tìm nhanh. Chọn gói trẻ em sẽ hiện ô Người giám hộ. Sau khi nhập xong bấm <strong>Gửi đối chiếu ngày</strong>.
              </p>
            </div>
            <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${statusMeta.cls}`}>
              {statusMeta.label}
            </span>
          </div>

          {/* Totals strip */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <KpiCell label="Số giao dịch" value={totals.count.toString()} tone="slate" />
            <KpiCell label="Doanh số" value={totals.sales.toLocaleString() + ' đ'} tone="emerald" />
            <KpiCell label="Thực thu" value={totals.collected.toLocaleString() + ' đ'} tone="sky" />
            <KpiCell label="Công nợ" value={totals.debt.toLocaleString() + ' đ'} tone="rose" />
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canEdit || saving || submitting}
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} /> Thêm dòng
            </button>
            <button
              type="button"
              disabled={!canEdit || saving || submitting || localRows.length === 0}
              onClick={handleSaveDraftClick}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Lưu tạm
            </button>
            <button
              type="button"
              disabled={!canEdit || saving || submitting || (rows.length === 0 && localRows.length === 0)}
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-600 text-sm font-semibold text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              Gửi đối chiếu ngày
            </button>
          </div>
          {batch.status === 'returned' && batch.returnReason && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-rose-50 ring-1 ring-rose-200 text-xs text-rose-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-bold mb-1">Kế toán trả lại — sửa các dòng dưới rồi bấm "Gửi đối chiếu" lại:</div>
                <div className="whitespace-pre-line leading-relaxed">{batch.returnReason}</div>
              </div>
            </div>
          )}
        </div>

        {/* Data grid — desktop (md+) */}
        <div className="hidden md:block">
          <SalesGrid
            packages={packages}
            rows={rows}
            localRows={localRows}
            canEdit={canEdit}
            batchStatus={batch.status}
            onUpdateLocal={handleUpdateLocal}
            onRemoveLocal={handleRemoveLocal}
            onUpdateSaved={handleUpdateSaved}
            onRemoveSaved={handleRemoveSaved}
          />
        </div>

        {/* Mobile card view (<md) */}
        <div className="md:hidden">
          <MobileNhapView
            packages={packages}
            rows={rows}
            localRows={localRows}
            canEdit={canEdit}
            batchStatus={batch.status}
            onUpdateLocal={handleUpdateLocal}
            onRemoveLocal={handleRemoveLocal}
            onUpdateSaved={handleUpdateSaved}
            onRemoveSaved={handleRemoveSaved}
          />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 max-w-sm px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${
          toast.kind === 'ok' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function KpiCell({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'emerald' | 'sky' | 'rose' }) {
  const cls = {
    slate:   'bg-slate-50 text-slate-700 ring-slate-200',
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
