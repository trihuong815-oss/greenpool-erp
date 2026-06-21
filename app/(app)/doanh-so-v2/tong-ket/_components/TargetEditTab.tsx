'use client';

// PR-TK3B (2026-06-21) — Tab "Chỉ tiêu" trong /tong-ket.
// Form yearly view 12 tháng theo schema salesTargets hiện có.
// Highlight tháng đang xem từ /tong-ket main view.
//
// Render theo role:
//   - canWriteBranch (ADMIN/CEO/CHU_TICH/GD_KD): edit monthTargets 12 tháng + staffTargets
//   - canWriteStaff (QLCS): chỉ edit staffTargets branch mình (monthTargets readonly)
//   - view-only (GD_VP/TP_KE/TP_GS/NV_KE/Sale): chỉ xem (KHÔNG input editable, KHÔNG nút Lưu)
//   - Sale: chỉ xem target cá nhân (1 row)
//
// Reuse POST /api/sales-targets bulk upsert. Merge-safe (chỉ gửi field mình sửa).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BRANCHES, type BranchId } from '@/lib/branches';
import type { ScopeRole } from '@/lib/sales-v2/scope';
import { fmtMoney, fmtMonth } from './utils';

interface SaleRow {
  uid: string;
  displayName: string;
  email: string;
  roleId: string;
  branchId: string;
}

interface TargetDoc {
  id: string;
  year: number;
  branchId: string;
  monthTargets: number[] | null;
  staffTargets: Record<string, number[]> | null;
  // leadTargets ignored in PR-TK3B
}

interface Props {
  /** Scope của user — quyết định branch mặc định + permission UI. */
  scope: ScopeRole;
  /** roleCode để check write permission UI-side (server vẫn enforce). */
  roleCode: string;
  /** uid của Sale — Sale chỉ xem row của mình. */
  uid: string;
  /** Branch chính của user (QLCS/Sale). Top role nhận null. */
  myBranchId: BranchId | null;
  /** Tháng đang xem từ /tong-ket header — highlight column này. */
  currentMonth: string;  // 'YYYY-MM'
}

const TOP_WRITE_ROLES = new Set(['ADMIN', 'CEO', 'CHU_TICH', 'GD_KD']);
const MONTH_LABELS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

function emptyArr12(): number[] { return Array(12).fill(0); }
function sum12(arr: number[] | null | undefined): number {
  if (!arr) return 0;
  return arr.reduce((a, b) => a + (Number(b) || 0), 0);
}
function parseMonthIdx(month: string): number {
  if (!/^\d{4}-\d{2}$/.test(month)) return -1;
  return Number(month.split('-')[1]) - 1;
}

export default function TargetEditTab(props: Props) {
  const { scope, roleCode, uid, myBranchId, currentMonth } = props;

  // Permissions UI (server still enforce)
  const canWriteBranch = TOP_WRITE_ROLES.has(roleCode);
  const isQlcs = roleCode.startsWith('QLCS_');
  const canWriteStaff = canWriteBranch || isQlcs;
  const isSaleView = scope === 'sale';

  // Year picker — default = year từ currentMonth
  const [year, setYear] = useState<number>(() => {
    if (/^\d{4}-\d{2}$/.test(currentMonth)) return Number(currentMonth.split('-')[0]);
    return new Date().getFullYear();
  });

  // Branch picker: Top chọn 1 branch để edit, QLCS/Sale force branch mình
  const initialBranch: BranchId = (myBranchId ?? (BRANCHES[0].id as BranchId));
  const [branchId, setBranchId] = useState<BranchId>(initialBranch);
  const showBranchPicker = scope === 'top';

  // Highlight tháng đang xem
  const highlightMonthIdx = parseMonthIdx(currentMonth);

  // Server state
  const [target, setTarget] = useState<TargetDoc | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local edit state (mirror target)
  const [monthTargetsLocal, setMonthTargetsLocal] = useState<number[]>(emptyArr12());
  const [staffTargetsLocal, setStaffTargetsLocal] = useState<Record<string, number[]>>({});

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch target + sales mỗi khi year/branch đổi
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      // 1. List target năm (tất cả branches) — reuse GET /api/sales-targets
      const tRes = await fetch(`/api/sales-targets?year=${year}`, { cache: 'no-store' });
      if (!tRes.ok) throw new Error(`Target HTTP ${tRes.status}`);
      const tJson = await tRes.json();
      const rows: TargetDoc[] = Array.isArray(tJson?.rows) ? tJson.rows : [];
      const found = rows.find((r) => r.branchId === branchId) ?? null;
      setTarget(found);
      setMonthTargetsLocal(found?.monthTargets && found.monthTargets.length === 12
        ? [...found.monthTargets]
        : emptyArr12());
      setStaffTargetsLocal(found?.staffTargets ?? {});

      // 2. List Sale của branch (cho form staffTargets) — bỏ qua nếu Sale view (chỉ xem mình)
      if (!isSaleView) {
        const sRes = await fetch(`/api/sales-staff?branchId=${branchId}`, { cache: 'no-store' });
        if (sRes.ok) {
          const sJson = await sRes.json();
          setSales(Array.isArray(sJson?.sales) ? sJson.sales : []);
        } else if (sRes.status !== 403) {
          // 403 acceptable cho NV_KE — bỏ qua
          console.warn('[TargetEditTab] sales list fail:', sRes.status);
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải');
    } finally {
      setLoading(false);
    }
  }, [year, branchId, isSaleView]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Compute year total
  const yearTotal = useMemo(() => sum12(monthTargetsLocal), [monthTargetsLocal]);

  // Handlers
  const updateMonthTarget = useCallback((idx: number, value: string) => {
    setSaved(false);
    setMonthTargetsLocal((prev) => {
      const next = [...prev];
      next[idx] = Math.max(0, Number(value.replace(/[^0-9]/g, '')) || 0);
      return next;
    });
  }, []);

  const updateStaffTarget = useCallback((saleUid: string, monthIdx: number, value: string) => {
    setSaved(false);
    setStaffTargetsLocal((prev) => {
      const arr = prev[saleUid] ? [...prev[saleUid]] : emptyArr12();
      arr[monthIdx] = Math.max(0, Number(value.replace(/[^0-9]/g, '')) || 0);
      return { ...prev, [saleUid]: arr };
    });
  }, []);

  const saveBranchTargets = useCallback(async () => {
    if (saving || !canWriteBranch) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/sales-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{ year, branchId, monthTargets: monthTargetsLocal }],
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setSaved(true);
      await fetchData();  // refresh
    } catch (e: any) {
      setError(e?.message ?? 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  }, [saving, canWriteBranch, year, branchId, monthTargetsLocal, fetchData]);

  const saveStaffTargets = useCallback(async () => {
    if (saving || !canWriteStaff) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Lọc bỏ saleId có toàn 0 (clean)
      const clean: Record<string, number[]> = {};
      for (const [sid, arr] of Object.entries(staffTargetsLocal)) {
        if (arr.some((v) => v > 0)) clean[sid] = arr;
      }
      const res = await fetch('/api/sales-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{ year, branchId, staffTargets: clean }],
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setSaved(true);
      await fetchData();
    } catch (e: any) {
      setError(e?.message ?? 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  }, [saving, canWriteStaff, year, branchId, staffTargetsLocal, fetchData]);

  // Sale view: chỉ render row target cá nhân từ staffTargetsLocal[uid]
  if (isSaleView) {
    const myTargets = staffTargetsLocal[uid] ?? emptyArr12();
    return (
      <div className="space-y-4">
        <TabHeader year={year} setYear={setYear} branchId={branchId} setBranchId={setBranchId} showBranchPicker={false} loading={loading} />
        <div className="card">
          <h3 className="text-sm font-bold text-slate-800 mb-3">Chỉ tiêu cá nhân tháng (read-only)</h3>
          {loading ? <Loader size={16} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  <tr>
                    {MONTH_LABELS.map((lbl, i) => (
                      <th key={i} className={`px-2 py-2 text-right ${i === highlightMonthIdx ? 'bg-emerald-50 text-emerald-700' : ''}`}>
                        {lbl}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right">Năm</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {myTargets.map((v, i) => (
                      <td key={i} className={`px-2 py-1.5 text-right tabular-nums ${i === highlightMonthIdx ? 'bg-emerald-50 font-semibold text-emerald-700' : 'text-slate-700'}`}>
                        {v > 0 ? fmtMoney(v) : <span className="text-slate-300 text-xs italic">—</span>}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold text-emerald-700">
                      {sum12(myTargets) > 0 ? fmtMoney(sum12(myTargets)) : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TabHeader
        year={year} setYear={setYear}
        branchId={branchId} setBranchId={setBranchId}
        showBranchPicker={showBranchPicker}
        loading={loading}
      />

      {error && <ErrorBox message={error} />}
      {saved && <SavedBox />}

      {loading ? (
        <div className="card text-center py-12 text-slate-500"><Loader size={20} /> Đang tải…</div>
      ) : (
        <>
          {/* Branch monthTargets — top write role: editable; QLCS/view-only: readonly */}
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-slate-800">
                Chỉ tiêu cơ sở {branchId} · năm {year}
                {!canWriteBranch && <span className="ml-2 text-xs font-normal text-slate-500">(chỉ xem)</span>}
              </h3>
              {canWriteBranch && (
                <button
                  type="button"
                  onClick={saveBranchTargets}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? <Loader size={14} /> : <Save size={14} />}
                  Lưu chỉ tiêu cơ sở
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  <tr>
                    {MONTH_LABELS.map((lbl, i) => (
                      <th key={i} className={`px-2 py-2 text-right ${i === highlightMonthIdx ? 'bg-emerald-50 text-emerald-700' : ''}`}>
                        {lbl}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right">Năm</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {monthTargetsLocal.map((v, i) => (
                      <td key={i} className={`px-1 py-1 ${i === highlightMonthIdx ? 'bg-emerald-50' : ''}`}>
                        {canWriteBranch ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={v > 0 ? v.toLocaleString() : ''}
                            onChange={(e) => updateMonthTarget(i, e.target.value)}
                            placeholder="0"
                            className="w-full px-2 py-1 text-right tabular-nums text-sm rounded ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        ) : (
                          <div className="px-2 py-1 text-right tabular-nums text-slate-700">
                            {v > 0 ? fmtMoney(v) : <span className="text-slate-300 italic">—</span>}
                          </div>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold text-emerald-700">
                      {yearTotal > 0 ? fmtMoney(yearTotal) : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Tổng chỉ tiêu năm tự cộng từ 12 tháng. Tháng đang xem ({fmtMonth(currentMonth)}) được highlight.
            </div>
          </div>

          {/* Staff targets — top + QLCS editable; view-only role readonly */}
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-slate-800">
                Chỉ tiêu Sale ({sales.length} người)
                {!canWriteStaff && <span className="ml-2 text-xs font-normal text-slate-500">(chỉ xem)</span>}
              </h3>
              {canWriteStaff && (
                <button
                  type="button"
                  onClick={saveStaffTargets}
                  disabled={saving || sales.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? <Loader size={14} /> : <Save size={14} />}
                  Lưu chỉ tiêu Sale
                </button>
              )}
            </div>

            {sales.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm italic">
                Cơ sở này chưa có Sale active. Thêm Sale ở /quan-ly-sale trước khi đặt chỉ tiêu.
              </div>
            ) : (
              <div className="overflow-auto rounded-lg ring-1 ring-slate-200 max-h-[60vh]">
                <table className="w-full text-sm min-w-[1100px]">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left sticky left-0 bg-slate-50 z-20">Sale</th>
                      {MONTH_LABELS.map((lbl, i) => (
                        <th key={i} className={`px-2 py-2 text-right w-24 ${i === highlightMonthIdx ? 'bg-emerald-100 text-emerald-700' : ''}`}>
                          {lbl}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-right w-28">Năm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sales.map((s) => {
                      const arr = staffTargetsLocal[s.uid] ?? emptyArr12();
                      const total = sum12(arr);
                      return (
                        <tr key={s.uid} className="hover:bg-slate-50/60">
                          <td className="px-2 py-1 text-slate-800 font-medium sticky left-0 bg-white z-10 truncate max-w-[200px]" title={s.email}>
                            {s.displayName || s.email}
                            {s.roleId === 'NV_SALE_PT' && (
                              <span className="ml-1 text-[9px] font-bold text-violet-700 bg-violet-100 px-1 rounded">PT</span>
                            )}
                          </td>
                          {arr.map((v, i) => (
                            <td key={i} className={`px-1 py-0.5 ${i === highlightMonthIdx ? 'bg-emerald-50' : ''}`}>
                              {canWriteStaff ? (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={v > 0 ? v.toLocaleString() : ''}
                                  onChange={(e) => updateStaffTarget(s.uid, i, e.target.value)}
                                  placeholder="0"
                                  className="w-full px-1.5 py-0.5 text-right tabular-nums text-xs rounded ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                              ) : (
                                <div className="px-1.5 py-0.5 text-right tabular-nums text-slate-700 text-xs">
                                  {v > 0 ? v.toLocaleString() : <span className="text-slate-300 italic">—</span>}
                                </div>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-right tabular-nums font-semibold text-emerald-700">
                            {total > 0 ? fmtMoney(total) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function TabHeader(props: {
  year: number;
  setYear: (y: number) => void;
  branchId: BranchId;
  setBranchId: (b: BranchId) => void;
  showBranchPicker: boolean;
  loading: boolean;
}) {
  const { year, setYear, branchId, setBranchId, showBranchPicker, loading } = props;
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Quản lý chỉ tiêu doanh số</h2>
          <p className="mt-0.5 text-xs text-slate-600">Yearly view 12 tháng — tháng hiện tại trong Tổng kết được highlight</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs font-semibold text-slate-500 uppercase">Năm:</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {showBranchPicker && (
            <>
              <label className="text-xs font-semibold text-slate-500 uppercase">Cơ sở:</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value as BranchId)}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Loader({ size = 16 }: { size?: number }) {
  return <Loader2 className="animate-spin inline-block" size={size} />;
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-200 text-sm">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

function SavedBox() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-sm">
      <CheckCircle2 size={16} className="shrink-0" />
      <span>Đã lưu chỉ tiêu thành công.</span>
    </div>
  );
}
