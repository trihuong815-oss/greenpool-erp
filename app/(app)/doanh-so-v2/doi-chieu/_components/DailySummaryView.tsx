'use client';

// V8 Phase 2 (2026-06-18) — Tab "Tổng hợp doanh thu ngày" trong /doi-chieu.
//
// Bảng giống ảnh báo cáo:
//   Reception entries (vé lẻ, đồ bơi, đồ ăn, thuê tủ, bảo lưu...)
//   + Sale 4 groups (I. Thẻ tháng / II. Tích lượt / III. Học bơi / IV. Khác)
//   + Grand total

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw, Loader2, AlertCircle, CheckCircle2, FileWarning,
} from 'lucide-react';
import { BRANCHES } from '@/lib/branches';
import type { BranchId } from '@/lib/branches';
import type { ReceptionEntry } from '@/lib/types/sales-reception';
import type { ReportGroup } from '@/lib/sales-v2/auto-map-package';

interface SaleItem {
  label: string; count: number;
  cash: number; transfer: number; card: number; total: number;
}
interface SaleGroup {
  id: ReportGroup; label: string; count: number;
  cash: number; transfer: number; card: number; total: number;
  items: SaleItem[];
}
interface DailySummary {
  date: string; branchId: BranchId; branchName: string;
  reception: {
    exists: boolean;
    status: 'draft' | 'approved';
    entries: ReceptionEntry[];
    totals: { cash: number; transfer: number; card: number; total: number };
    enteredByName: string;
    approvedAt: string | null;
  };
  sales: {
    exists: boolean;
    batchCount: number;
    groups: SaleGroup[];
    totals: { cash: number; transfer: number; card: number; total: number };
  };
  grandTotals: { cash: number; transfer: number; card: number; total: number };
}

interface Props {
  // U1+U10 audit fix: date + branchId controlled từ parent (DoiChieuClient) để giữ context
  // khi user switch qua lại 2 tab "Đối chiếu batch" ↔ "Tổng hợp doanh thu ngày".
  date: string;
  branchId: BranchId;
  allowSwitchBranch: boolean;   // top role được switch all branches; QLCS/NV_KE force branch
  onChangeDate: (date: string) => void;
  onChangeBranch: (branchId: BranchId) => void;
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

export default function DailySummaryView({ date, branchId, allowSwitchBranch, onChangeDate, onChangeBranch }: Props) {
  const [data, setData] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // U9 audit fix: AbortController cancel fetch cũ khi user đổi date/branch nhanh
  // → tránh race condition response cũ ghi đè response mới.
  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const qs = new URLSearchParams({ branchId, date });
        const r = await fetch(`/api/sales-v2/daily-summary?${qs.toString()}`, { signal: ctrl.signal });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        const j = await r.json();
        if (!cancelled) setData(j as DailySummary);
      } catch (e: any) {
        if (e?.name === 'AbortError') return; // chuyển date/branch — bỏ qua silent
        if (!cancelled) { setError(e?.message ?? 'Lỗi tải'); setData(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; ctrl.abort(); };
  }, [branchId, date, tick]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              Tổng hợp doanh thu ngày {fmtDate(date)} {data?.branchName ? `· ${data.branchName}` : ''}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Gộp <strong>doanh thu Sale</strong> (gói dịch vụ approved) + <strong>doanh thu quầy lễ tân</strong> (vé lẻ / đồ bơi / ...) cùng 1 ngày.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => onChangeDate(shiftDate(date, -1))}
              className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50" title="Ngày trước">
              <ChevronLeft size={16} />
            </button>
            <input type="date" value={date} onChange={(e) => onChangeDate(e.target.value)} max={todayInVN()}
              aria-label="Chọn ngày tổng hợp"
              className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <button type="button" onClick={() => onChangeDate(shiftDate(date, 1))} disabled={date >= todayInVN()}
              className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-30" title="Ngày sau">
              <ChevronRight size={16} />
            </button>
            {allowSwitchBranch && (
              <select value={branchId} onChange={(e) => onChangeBranch(e.target.value as BranchId)}
                aria-label="Chọn cơ sở"
                className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <button type="button" onClick={() => setTick((t) => t + 1)} disabled={loading}
              className="p-2 rounded-lg bg-white ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50" title="Tải lại">
              {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            </button>
          </div>
        </div>

        {/* KPI grand totals */}
        {data && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            <KpiCard label="Tiền mặt" value={data.grandTotals.cash} tone="emerald" />
            <KpiCard label="Chuyển khoản" value={data.grandTotals.transfer} tone="sky" />
            <KpiCard label="Quẹt thẻ" value={data.grandTotals.card} tone="violet" />
            <KpiCard label="TỔNG tất cả" value={data.grandTotals.total} tone="amber" emphasis />
          </div>
        )}

        {/* Status banners */}
        {data && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <StatusBanner
              ok={data.reception.exists && data.reception.status === 'approved'}
              draft={data.reception.exists && data.reception.status === 'draft'}
              missing={!data.reception.exists}
              labelOk={`Quầy lễ tân: ${data.reception.enteredByName} đã chốt${data.reception.approvedAt ? ' ' + new Date(data.reception.approvedAt).toLocaleString('vi-VN') : ''}`}
              labelDraft="Quầy lễ tân: kế toán đã nhập nháp, chưa chốt"
              labelMissing="Quầy lễ tân: chưa nhập"
            />
            <StatusBanner
              ok={data.sales.exists}
              draft={false}
              missing={!data.sales.exists}
              labelOk={`Sale (gói): ${data.sales.batchCount} batch đã đối chiếu`}
              labelDraft=""
              labelMissing="Sale (gói): chưa có batch nào đối chiếu trong ngày"
            />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="card border-rose-200 bg-rose-50/40">
          <div className="text-sm text-rose-700 flex items-center gap-2"><AlertCircle size={14} /> {error}</div>
        </div>
      )}

      {/* Summary table */}
      {data && !loading && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-semibold sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left">Nội dung</th>
                  <th className="px-3 py-2.5 text-right w-20">SL</th>
                  <th className="px-3 py-2.5 text-right w-32">Đơn giá</th>
                  <th className="px-3 py-2.5 text-right w-32">Tiền mặt</th>
                  <th className="px-3 py-2.5 text-right w-32">Chuyển khoản</th>
                  <th className="px-3 py-2.5 text-right w-28">Quẹt thẻ</th>
                  <th className="px-3 py-2.5 text-right w-32">Tổng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* RECEPTION SECTION */}
                <SectionHeader label={`Quầy lễ tân ${data.reception.exists ? '(' + (data.reception.status === 'approved' ? 'đã chốt' : 'nháp') + ')' : '(chưa nhập)'}`} tone="sky" />
                {/* U3 audit fix: reception chưa nhập → hint rõ thay vì hiển thị skeleton rows
                   (gây hiểu lầm "đã có data 0đ"). */}
                {!data.reception.exists ? (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-500 text-xs italic">
                    💡 Kế toán cơ sở chưa nhập báo cáo quầy lễ tân cho ngày này.
                    Vào <strong>Doanh số V2 → Nhập DT quầy lễ tân</strong> để nhập.
                  </td></tr>
                ) : data.reception.entries.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-3 text-center text-slate-400 text-xs italic">Không có category</td></tr>
                ) : (
                  data.reception.entries.map((e) => <ReceptionRow key={e.category} entry={e} />)
                )}
                {data.reception.exists && <SubtotalRow label="Tổng quầy lễ tân" totals={data.reception.totals} tone="sky" />}

                {/* SALE GROUPS — U4 audit fix: ẩn group count=0 toàn bộ */}
                {data.sales.exists ? (
                  data.sales.groups.filter((g) => g.count > 0).map((g) => (
                    <SaleGroupBlock key={g.id} group={g} />
                  ))
                ) : (
                  <>
                    <SectionHeader label="Sale (gói dịch vụ)" tone="emerald" />
                    <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-500 text-xs italic">
                      💡 Chưa có batch Sale nào đã đối chiếu trong ngày. Sang tab <strong>Đối chiếu batch</strong> để duyệt.
                    </td></tr>
                  </>
                )}
                {data.sales.exists && data.sales.groups.some((g) => g.count > 0) && (
                  <SubtotalRow label="Tổng Sale (gói dịch vụ)" totals={data.sales.totals} tone="emerald" />
                )}
              </tbody>
              <tfoot className="bg-slate-100 text-sm font-bold">
                <tr>
                  <td colSpan={3} className="px-3 py-3 text-right uppercase tracking-wider text-xs text-slate-700">TỔNG TẤT CẢ</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{data.grandTotals.cash.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-sky-700">{data.grandTotals.transfer.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-violet-700">{data.grandTotals.card.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-700 text-base">{data.grandTotals.total.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="card text-center py-12 text-slate-400 text-sm">
          <Loader2 className="animate-spin inline mr-2" size={16} /> Đang tải tổng hợp...
        </div>
      )}
    </div>
  );
}

// ─── Row components ──────────────────────────────────────────

function ReceptionRow({ entry }: { entry: ReceptionEntry }) {
  const isEmpty = entry.total === 0;
  return (
    <tr className={isEmpty ? 'text-slate-400' : 'hover:bg-slate-50/60'}>
      <td className="px-3 py-1.5">{entry.label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{entry.quantity != null && entry.quantity > 0 ? entry.quantity.toLocaleString() : <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{entry.unitPrice != null && entry.unitPrice > 0 ? entry.unitPrice.toLocaleString() : <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{entry.cash > 0 ? entry.cash.toLocaleString() : <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{entry.transfer > 0 ? entry.transfer.toLocaleString() : <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{entry.card > 0 ? entry.card.toLocaleString() : <span className="text-slate-300">—</span>}</td>
      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{entry.total > 0 ? entry.total.toLocaleString() : <span className="text-slate-300">0</span>}</td>
    </tr>
  );
}

function SaleGroupBlock({ group }: { group: SaleGroup }) {
  if (group.count === 0) {
    return (
      <>
        <tr className="bg-slate-50/50">
          <td className="px-3 py-2 font-semibold text-slate-700">{group.label}</td>
          <td colSpan={5} className="px-3 py-2 text-right text-xs text-slate-400 italic">Chưa có giao dịch trong ngày</td>
          <td className="px-3 py-2 text-right tabular-nums text-slate-300">0</td>
        </tr>
      </>
    );
  }
  return (
    <>
      {/* Group header row với totals */}
      <tr className="bg-emerald-50/40 font-semibold">
        <td className="px-3 py-2 text-slate-800">{group.label}</td>
        <td className="px-3 py-2 text-right text-xs text-slate-500 tabular-nums">{group.count} GD</td>
        <td className="px-3 py-2"></td>
        <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{group.cash > 0 ? group.cash.toLocaleString() : <span className="text-slate-300">—</span>}</td>
        <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{group.transfer > 0 ? group.transfer.toLocaleString() : <span className="text-slate-300">—</span>}</td>
        <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{group.card > 0 ? group.card.toLocaleString() : <span className="text-slate-300">—</span>}</td>
        <td className="px-3 py-2 text-right tabular-nums text-emerald-900 font-bold">{group.total.toLocaleString()}</td>
      </tr>
      {/* Items */}
      {group.items.map((item) => (
        <tr key={item.label} className="hover:bg-emerald-50/30">
          <td className="px-3 py-1.5 pl-8 text-slate-700">{item.label}</td>
          <td className="px-3 py-1.5 text-right text-xs text-slate-500 tabular-nums">{item.count}</td>
          <td className="px-3 py-1.5"></td>
          <td className="px-3 py-1.5 text-right tabular-nums">{item.cash > 0 ? item.cash.toLocaleString() : <span className="text-slate-300">—</span>}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{item.transfer > 0 ? item.transfer.toLocaleString() : <span className="text-slate-300">—</span>}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{item.card > 0 ? item.card.toLocaleString() : <span className="text-slate-300">—</span>}</td>
          <td className="px-3 py-1.5 text-right tabular-nums font-medium">{item.total.toLocaleString()}</td>
        </tr>
      ))}
    </>
  );
}

function SectionHeader({ label, tone }: { label: string; tone: 'sky' | 'emerald' }) {
  const cls = tone === 'sky' ? 'bg-sky-100 text-sky-900' : 'bg-emerald-100 text-emerald-900';
  return (
    <tr className={cls}>
      <td colSpan={7} className="px-3 py-1.5 text-xs uppercase tracking-wider font-bold">{label}</td>
    </tr>
  );
}

function SubtotalRow({ label, totals, tone }: { label: string; totals: { cash: number; transfer: number; card: number; total: number }; tone: 'sky' | 'emerald' }) {
  const headerCls = tone === 'sky' ? 'text-sky-900 bg-sky-50' : 'text-emerald-900 bg-emerald-50';
  return (
    <tr className={`${headerCls} font-semibold border-t-2 border-slate-200`}>
      <td colSpan={3} className="px-3 py-2 text-right uppercase tracking-wider text-xs">{label}</td>
      <td className="px-3 py-2 text-right tabular-nums">{totals.cash > 0 ? totals.cash.toLocaleString() : '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums">{totals.transfer > 0 ? totals.transfer.toLocaleString() : '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums">{totals.card > 0 ? totals.card.toLocaleString() : '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums">{totals.total.toLocaleString()}</td>
    </tr>
  );
}

function KpiCard({ label, value, tone, emphasis }: { label: string; value: number; tone: 'emerald' | 'sky' | 'violet' | 'amber'; emphasis?: boolean }) {
  const cls = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  }[tone];
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${cls} ${emphasis ? 'ring-2' : ''}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className={`font-bold tabular-nums mt-0.5 ${emphasis ? 'text-lg' : 'text-base'}`}>{value.toLocaleString()}đ</div>
    </div>
  );
}

function StatusBanner({ ok, draft, missing, labelOk, labelDraft, labelMissing }: {
  ok: boolean; draft: boolean; missing: boolean;
  labelOk: string; labelDraft: string; labelMissing: string;
}) {
  if (ok) return (
    <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-emerald-700 flex items-start gap-1.5">
      <CheckCircle2 size={12} className="shrink-0 mt-0.5" /> <span>{labelOk}</span>
    </div>
  );
  if (draft) return (
    <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-amber-700 flex items-start gap-1.5">
      <FileWarning size={12} className="shrink-0 mt-0.5" /> <span>{labelDraft}</span>
    </div>
  );
  if (missing) return (
    <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-slate-500 flex items-start gap-1.5">
      <FileWarning size={12} className="shrink-0 mt-0.5" /> <span>{labelMissing}</span>
    </div>
  );
  return null;
}
