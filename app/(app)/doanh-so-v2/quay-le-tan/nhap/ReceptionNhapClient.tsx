'use client';

// V8 Reception (2026-06-18) — UI nhập doanh thu quầy lễ tân.
//
// Workflow:
//   1. Page load → fetch batch theo branch + date (mặc định hôm nay)
//   2. Nếu chưa tồn tại → skeleton với entries trống preload từ pricing config
//   3. NV_KE nhập qty + cash/transfer/card cho từng category
//   4. Total cell auto = cash + transfer + card (live preview)
//   5. Lưu nháp → status=draft; Chốt báo cáo → status=approved + noti

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Save, CheckCircle2, Loader2, AlertCircle, Info,
} from 'lucide-react';
import { BRANCHES } from '@/lib/branches';
import type { BranchId } from '@/lib/branches';
import {
  RECEPTION_CATEGORY_LABEL, categoryHasUnitPrice,
  type SalesReceptionBatch, type ReceptionCategory, type ReceptionEntry,
} from '@/lib/types/sales-reception';
import { showConfirm } from '@/components/ui/imperative-modal';

interface Props {
  callerUid: string;
  callerName: string;
  callerRole: string;
  defaultBranch: BranchId;
  allowSwitchBranch: boolean;
}

function todayInVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}
function shiftDate(d: string, delta: number): string {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function fmtDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

interface LocalEntry {
  category: ReceptionCategory;
  label: string;
  quantity: string;     // string để hiển thị
  unitPrice: string;
  cash: string;
  transfer: string;
  card: string;
  note: string;
}

function toLocal(e: ReceptionEntry): LocalEntry {
  return {
    category: e.category,
    label: e.label,
    quantity: e.quantity != null && e.quantity > 0 ? String(e.quantity) : '',
    unitPrice: e.unitPrice != null && e.unitPrice > 0 ? String(e.unitPrice) : '',
    cash: e.cash > 0 ? String(e.cash) : '',
    transfer: e.transfer > 0 ? String(e.transfer) : '',
    card: e.card > 0 ? String(e.card) : '',
    note: e.note ?? '',
  };
}

function entryTotalOf(e: LocalEntry): number {
  return (Number(e.cash) || 0) + (Number(e.transfer) || 0) + (Number(e.card) || 0);
}

export default function ReceptionNhapClient({ callerUid, callerName, callerRole, defaultBranch, allowSwitchBranch }: Props) {
  const [branchId, setBranchId] = useState<BranchId>(defaultBranch);
  const [date, setDate] = useState<string>(todayInVN());
  const [batch, setBatch] = useState<SalesReceptionBatch | null>(null);
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [note, setNote] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchBatch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ branchId, date });
      const r = await fetch(`/api/sales-v2/reception?${qs.toString()}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      const b = j.batch as SalesReceptionBatch;
      setBatch(b);
      setEntries(b.entries.map(toLocal));
      setNote(b.note ?? '');
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải');
      setBatch(null);
      setEntries([]);
    } finally { setLoading(false); }
  }, [branchId, date]);

  useEffect(() => { void fetchBatch(); }, [fetchBatch]);

  const updateEntry = useCallback((idx: number, patch: Partial<LocalEntry>) => {
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));
  }, []);

  const totals = useMemo(() => {
    let cash = 0, transfer = 0, card = 0;
    for (const e of entries) {
      cash += Number(e.cash) || 0;
      transfer += Number(e.transfer) || 0;
      card += Number(e.card) || 0;
    }
    return { cash, transfer, card, total: cash + transfer + card };
  }, [entries]);

  const isApproved = batch?.status === 'approved';
  const canEdit = !isApproved;

  async function handleSave(finalize: boolean) {
    if (!canEdit) { showToast('err', 'Báo cáo đã chốt — không sửa được'); return; }
    if (finalize) {
      const ok = await showConfirm({
        title: `Chốt báo cáo quầy lễ tân ngày ${fmtDate(date)}?`,
        description:
          `Tổng thu: ${totals.total.toLocaleString()}đ\n` +
          `Tiền mặt: ${totals.cash.toLocaleString()}đ\n` +
          `Chuyển khoản: ${totals.transfer.toLocaleString()}đ\n` +
          `Quẹt thẻ: ${totals.card.toLocaleString()}đ\n\n` +
          `Sau khi chốt, bạn KHÔNG sửa được nữa. Tổng hợp doanh thu ngày sẽ tự lên báo cáo.`,
        confirmText: 'Chốt báo cáo',
        cancelText: 'Huỷ',
        variant: 'success',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const body = {
        date, branchId, finalize,
        note,
        entries: entries.map((e) => ({
          category: e.category,
          quantity: e.quantity ? Number(e.quantity) : null,
          unitPrice: e.unitPrice ? Number(e.unitPrice) : null,
          cash: Number(e.cash) || 0,
          transfer: Number(e.transfer) || 0,
          card: Number(e.card) || 0,
          note: e.note || null,
        })),
      };
      const r = await fetch('/api/sales-v2/reception', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      const b = j.batch as SalesReceptionBatch;
      setBatch(b);
      setEntries(b.entries.map(toLocal));
      showToast('ok', finalize ? 'Đã chốt báo cáo' : 'Đã lưu nháp');
    } catch (e: any) {
      showToast('err', e?.message ?? 'Lỗi lưu');
    } finally { setSaving(false); }
  }

  const branchName = BRANCHES.find((b) => b.id === branchId)?.name ?? branchId;

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-4">
        {/* Header */}
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-800">Doanh thu quầy lễ tân</h1>
              <p className="mt-1 text-sm text-slate-600">
                Cơ sở: <strong className="text-slate-800">{branchName}</strong> · Ngày <strong className="text-slate-800">{fmtDate(date)}</strong>
              </p>
              {batch && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {batch.status === 'approved' ? (
                    <>✓ Đã chốt bởi <strong className="text-emerald-700">{batch.enteredByName}</strong> lúc {new Date(batch.approvedAt!).toLocaleString('vi-VN')}</>
                  ) : (
                    <>Trạng thái: <strong className="text-amber-700">Nháp</strong> (chưa chốt)</>
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => setDate(shiftDate(date, -1))}
                className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50" title="Ngày trước">
                <ChevronLeft size={16} />
              </button>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                max={todayInVN()}
                className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="button" onClick={() => setDate(shiftDate(date, 1))}
                disabled={date >= todayInVN()}
                className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-30" title="Ngày sau">
                <ChevronRight size={16} />
              </button>
              {allowSwitchBranch && (
                <select value={branchId} onChange={(e) => setBranchId(e.target.value as BranchId)}
                  className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* KPI totals (live preview) */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="Tiền mặt" value={`${totals.cash.toLocaleString()}đ`} tone="emerald" />
            <Kpi label="Chuyển khoản" value={`${totals.transfer.toLocaleString()}đ`} tone="sky" />
            <Kpi label="Quẹt thẻ" value={`${totals.card.toLocaleString()}đ`} tone="violet" />
            <Kpi label="Tổng" value={`${totals.total.toLocaleString()}đ`} tone="amber" />
          </div>

          {/* Action buttons */}
          {canEdit && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => handleSave(false)} disabled={saving || loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white ring-1 ring-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Lưu nháp
              </button>
              <button type="button" onClick={() => handleSave(true)} disabled={saving || loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Chốt báo cáo
              </button>
              <span className="text-xs text-slate-500 italic flex items-center gap-1">
                <Info size={12} /> Chốt báo cáo = tự duyệt + gửi noti cho QLCS / TP_KE / GD
              </span>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="card border-rose-200 bg-rose-50/40">
            <div className="text-sm text-rose-700 flex items-center gap-2"><AlertCircle size={14} /> {error}</div>
          </div>
        )}

        {/* Entries table */}
        <div className="card overflow-hidden p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              <Loader2 className="animate-spin inline mr-2" size={14} /> Đang tải...
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">Không có category nào.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  <tr>
                    <th className="px-3 py-2.5 text-left w-10">#</th>
                    <th className="px-3 py-2.5 text-left">Nội dung</th>
                    <th className="px-3 py-2.5 text-right w-24">Số lượng</th>
                    <th className="px-3 py-2.5 text-right w-32">Đơn giá</th>
                    <th className="px-3 py-2.5 text-right w-36">Tiền mặt</th>
                    <th className="px-3 py-2.5 text-right w-36">Chuyển khoản</th>
                    <th className="px-3 py-2.5 text-right w-32">Quẹt thẻ</th>
                    <th className="px-3 py-2.5 text-right w-36">Tổng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((e, i) => {
                    const hasPrice = categoryHasUnitPrice(e.category);
                    const rowTotal = entryTotalOf(e);
                    return (
                      <tr key={e.category} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2 text-slate-700 font-medium">{e.label}</td>
                        <td className="px-3 py-2 text-right">
                          {hasPrice ? (
                            <NumInput value={e.quantity} disabled={!canEdit}
                              onChange={(v) => updateEntry(i, { quantity: v })} placeholder="0" />
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {hasPrice ? (
                            <NumInput value={e.unitPrice} disabled={!canEdit} money
                              onChange={(v) => updateEntry(i, { unitPrice: v })} placeholder="0" />
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <NumInput value={e.cash} disabled={!canEdit} money
                            onChange={(v) => updateEntry(i, { cash: v })} placeholder="0" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <NumInput value={e.transfer} disabled={!canEdit} money
                            onChange={(v) => updateEntry(i, { transfer: v })} placeholder="0" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <NumInput value={e.card} disabled={!canEdit} money
                            onChange={(v) => updateEntry(i, { card: v })} placeholder="0" />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700">
                          {rowTotal > 0 ? rowTotal.toLocaleString() : <span className="text-slate-300">0</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 text-sm font-bold">
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-right text-slate-600 uppercase tracking-wider text-xs">TỔNG TIỀN</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{totals.cash.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sky-700">{totals.transfer.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-violet-700">{totals.card.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-amber-700">{totals.total.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Note */}
        <div className="card">
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Ghi chú</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit}
              rows={2} maxLength={1000}
              placeholder="Ghi chú bổ sung (tuỳ chọn)"
              className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50" />
          </label>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>{toast.msg}</div>
      )}
    </div>
  );
}

function NumInput({ value, disabled, money, onChange, placeholder }: {
  value: string;
  disabled: boolean;
  money?: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const display = value ? (money ? Number(value).toLocaleString('vi-VN') : value) : '';
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, '');
        onChange(digits);
      }}
      className="w-full px-2 py-1 rounded border border-slate-200 text-sm tabular-nums text-right focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:cursor-not-allowed"
    />
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'sky' | 'violet' | 'amber' }) {
  const cls = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  }[tone];
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${cls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-base font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
