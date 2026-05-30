'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Save, Loader2, CheckCircle2, AlertCircle, Calendar, RotateCcw, Plus, X } from 'lucide-react';
import {
  entriesApi, SOURCES, type PeriodType, type SalesEntryUpsert,
} from '@/lib/services/sales/pipeline-api-client';
import {
  packageSalesApi, packagesApi, packageGroupsApi, packageQuantitiesApi,
  comparePackagesSmart,
  type PackageSaleUpsert, type PackageQuantityUpsert,
  type PackageItem, type PackageGroup,
} from '@/lib/services/sales/packages-api-client';

interface BranchRef { id: string; name: string; }
interface StaffUser { id: string; name: string; roleId: string; branchId: string | null; status?: string; }

interface Props {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  allowedBranches: BranchRef[];
  staffUsers: StaffUser[];
}

const SOURCE_LABEL: Record<string, string> = {
  MKT: 'Nguồn từ MKT',
  Sale: 'Nguồn từ cá nhân sale',
  Renew: 'Nguồn renew',
  Referral: 'Nguồn Referral',
  'Walk-in': 'Nguồn Walk-in',
};

const MONTHS = [
  '01 — Tháng 1', '02 — Tháng 2', '03 — Tháng 3', '04 — Tháng 4',
  '05 — Tháng 5', '06 — Tháng 6', '07 — Tháng 7', '08 — Tháng 8',
  '09 — Tháng 9', '10 — Tháng 10', '11 — Tháng 11', '12 — Tháng 12',
];
const YEARS = [2024, 2025, 2026, 2027];

type CellMetric = 'leads' | 'closed' | 'notClosed';
type RowKey = string; // `${saleId}__${source}`

interface RowData {
  saleId: string;
  saleName: string;
  saleSubtype: 'member' | 'pt';   // derive từ staff.roleId — group UI theo nhóm
  source: typeof SOURCES[number];
  leads: number;
  closed: number;
  notClosed: number;
  isExisting: boolean; // true = đã có doc, false = mới (sẽ tạo)
}

export function NhapClient(props: Props) {
  const { allowedBranches, staffUsers } = props;

  // --- Period selector ---
  const today = new Date();
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [day, setDay] = useState<number>(today.getDate());
  const [branchId, setBranchId] = useState<string>(allowedBranches[0]?.id ?? '');

  const period = useMemo(() => {
    if (periodType === 'month') return `${year}-${String(month).padStart(2, '0')}`;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }, [periodType, year, month, day]);

  // --- Loại kỳ ---
  // Cho phép cả Tháng và Ngày — user tự chọn theo nhu cầu.
  const allowedPeriodTypes = useMemo<PeriodType[]>(() => ['month', 'day'], []);

  // Auto-switch periodType nếu hiện tại không hợp lệ
  useEffect(() => {
    if (!allowedPeriodTypes.includes(periodType)) {
      setPeriodType(allowedPeriodTypes[0]);
    }
  }, [allowedPeriodTypes, periodType]);

  // --- Data ---
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ===== Phase 2 (revised): bảng tổng hợp tháng (Sale doanh số + Lead matrix + SL gói) =====
  // 2 modal riêng: Lead (Section 1) + Doanh số/Gói (Section 2 + Section 3 combined).
  const [entryLeadOpen, setEntryLeadOpen] = useState(false);
  const [entryRevPkgOpen, setEntryRevPkgOpen] = useState(false);
  const [monthDetail, setMonthDetail] = useState<MonthDetailData | null>(null);
  const [monthDetailLoading, setMonthDetailLoading] = useState(false);
  const [monthlyQty, setMonthlyQty] = useState<{ packageId: string; packageName: string; groupId: string; groupName: string; quantity: number; revenue?: number }[]>([]);
  const [monthlyQtyLoading, setMonthlyQtyLoading] = useState(false);
  const [summaryRefresh, setSummaryRefresh] = useState(0);

  useEffect(() => {
    if (!branchId) { setMonthDetail(null); setMonthlyQty([]); return; }
    let cancelled = false;
    setMonthDetailLoading(true);
    setMonthlyQtyLoading(true);
    // Fetch song song: month-detail (doanh số + lead) + package-quantities (SL gói)
    Promise.all([
      fetch(`/api/sales/month-detail?branchId=${encodeURIComponent(branchId)}&year=${year}&month=${month}`, { cache: 'no-store' })
        .then(async (r) => (r.ok ? r.json() : null))
        .catch(() => null),
      packageQuantitiesApi.list({ year, month, branchId })
        .catch(() => []),
    ]).then(([d, q]) => {
      if (cancelled) return;
      setMonthDetail(d);
      setMonthlyQty(q);
    }).finally(() => {
      if (cancelled) return;
      setMonthDetailLoading(false);
      setMonthlyQtyLoading(false);
    });
    return () => { cancelled = true; };
  }, [branchId, year, month, summaryRefresh]);

  const branchName = allowedBranches.find((b) => b.id === branchId)?.name ?? branchId;

  // Sale active của branch hiện tại — entry form chỉ ghi cho NV_SALE active.
  // staffUsers từ server đã được lọc NV_SALE (có cả inactive cho ManageSalesModal).
  const branchStaff = useMemo(
    () => staffUsers.filter(
      (s) => (s.status ?? 'active') === 'active' && s.branchId === branchId,
    ),
    [staffUsers, branchId],
  );

  function showToast(t: 'success' | 'error', msg: string) {
    setToast({ type: t, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // Build default grid: cartesian (branchStaff × SOURCES) - 6 nguồn per nhân viên
  function buildDefaultRows(): RowData[] {
    const out: RowData[] = [];
    for (const staff of branchStaff) {
      for (const source of SOURCES) {
        out.push({
          saleId: staff.id,
          saleName: staff.name,
          saleSubtype: staff.roleId === 'NV_SALE_PT' ? 'pt' : 'member',
          source,
          leads: 0, closed: 0, notClosed: 0,
          isExisting: false,
        });
      }
    }
    return out;
  }

  // Load existing entries for period+branch, merge với default rows
  async function load() {
    if (!branchId || branchStaff.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      // Cross-mode load: nếu đang ở month-mode → fetch cả day-mode docs trong cùng calendar month.
      // Sum (leads/closed/notClosed) per (saleId, source) — show user tổng đã nhập để có thể clear.
      let rawExisting: Awaited<ReturnType<typeof entriesApi.list>>;
      if (periodType === 'month') {
        const parsed = /^(\d{4})-(\d{2})$/.exec(period);
        if (parsed) {
          rawExisting = await entriesApi.listMonth({ year: Number(parsed[1]), month: Number(parsed[2]), branchId });
        } else {
          rawExisting = await entriesApi.list({ period, periodType, branchId });
        }
      } else {
        rawExisting = await entriesApi.list({ period, periodType, branchId });
      }
      // Aggregate per (saleId, source) cho cross-mode (vd. 1 day-mode + 1 month-mode → sum)
      const sumMap: Record<string, { saleId: string; saleName: string; source: string; leads: number; closed: number; notClosed: number }> = {};
      for (const e of rawExisting) {
        const key = `${e.saleId}__${e.source}`;
        if (!sumMap[key]) sumMap[key] = { saleId: e.saleId, saleName: e.saleName, source: e.source, leads: 0, closed: 0, notClosed: 0 };
        sumMap[key].leads += e.leads;
        sumMap[key].closed += e.closed;
        sumMap[key].notClosed += e.notClosed;
      }
      const existing = Object.values(sumMap);
      const byKey: Record<string, typeof existing[number]> = {};
      existing.forEach((e) => { byKey[`${e.saleId}__${e.source}`] = e; });

      const def = buildDefaultRows();
      const merged = def.map((d) => {
        const ex = byKey[`${d.saleId}__${d.source}`];
        if (!ex) return d;
        return {
          ...d,
          leads: ex.leads, closed: ex.closed, notClosed: ex.notClosed,
          saleName: ex.saleName || d.saleName,
          isExisting: true,
        };
      });

      // Bổ sung entries của sale không còn trong staffUsers (vd user inactive)
      for (const ex of existing) {
        const key = `${ex.saleId}__${ex.source}`;
        if (!merged.find((r) => `${r.saleId}__${r.source}` === key)) {
          // Inactive sale → fallback: tìm trong staffUsers (kể cả inactive) để biết subtype, nếu không có thì 'member'
          const u = staffUsers.find((x) => x.id === ex.saleId);
          merged.push({
            saleId: ex.saleId, saleName: ex.saleName || '(unknown)',
            saleSubtype: u?.roleId === 'NV_SALE_PT' ? 'pt' : 'member',
            source: ex.source as typeof SOURCES[number],
            leads: ex.leads, closed: ex.closed, notClosed: ex.notClosed,
            isExisting: true,
          });
        }
      }
      setRows(merged);
    } catch (e: any) {
      showToast('error', 'Load lỗi: ' + e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period, branchId, branchStaff.length]);

  function updateCell(rowIdx: number, metric: CellMetric, value: number) {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      const v = Math.max(0, value);
      const next = { ...r, [metric]: v };
      // Ràng buộc: chốt ≤ số lượng (không có lead thì không thể có chốt).
      if (metric === 'closed') {
        next.closed = Math.min(v, next.leads);
      } else if (metric === 'leads') {
        // Nếu hạ leads xuống dưới closed hiện tại → tự hạ closed xuống bằng leads.
        if (next.closed > next.leads) next.closed = next.leads;
      }
      // Auto: notClosed = leads − closed (luôn ≥ 0).
      if (metric === 'leads' || metric === 'closed') {
        next.notClosed = Math.max(0, next.leads - next.closed);
      }
      return next;
    }));
  }

  // Group rows theo saleId để render bảng có rowspan.
  // Sort theo subtype trước (member trên, pt dưới) — bảng sẽ render liền 2 nhóm.
  const groupedRows = useMemo(() => {
    const groups: { saleId: string; saleName: string; saleSubtype: 'member' | 'pt'; rows: { row: RowData; idx: number }[] }[] = [];
    rows.forEach((r, idx) => {
      let g = groups.find((x) => x.saleId === r.saleId);
      if (!g) {
        g = { saleId: r.saleId, saleName: r.saleName, saleSubtype: r.saleSubtype, rows: [] };
        groups.push(g);
      }
      g.rows.push({ row: r, idx });
    });
    // Member trước, PT sau (PT chỉ có ở cơ sở 24)
    return groups.sort((a, b) => {
      if (a.saleSubtype !== b.saleSubtype) return a.saleSubtype === 'member' ? -1 : 1;
      return a.saleName.localeCompare(b.saleName, 'vi');
    });
  }, [rows]);

  // Có sale PT trong danh sách không? — để render separator header trong bảng
  const hasPTGroup = useMemo(() => groupedRows.some((g) => g.saleSubtype === 'pt'), [groupedRows]);
  const firstPTSaleId = useMemo(() => groupedRows.find((g) => g.saleSubtype === 'pt')?.saleId ?? null, [groupedRows]);

  // Totals per row + per sale + grand
  const totals = useMemo(() => {
    const sumPerSale: Record<string, { leads: number; closed: number; notClosed: number }> = {};
    let g = { leads: 0, closed: 0, notClosed: 0 };
    rows.forEach((r) => {
      sumPerSale[r.saleId] ??= { leads: 0, closed: 0, notClosed: 0 };
      sumPerSale[r.saleId].leads += r.leads;
      sumPerSale[r.saleId].closed += r.closed;
      sumPerSale[r.saleId].notClosed += r.notClosed;
      g.leads += r.leads; g.closed += r.closed; g.notClosed += r.notClosed;
    });
    return { perSale: sumPerSale, grand: g };
  }, [rows]);

  async function save() {
    if (rows.length === 0) { showToast('error', 'Không có dòng nào'); return; }
    setSaving(true);
    try {
      // Logic: chỉ gửi row có metric > 0 HOẶC row đã có doc cũ (isExisting). Row cũ + tất cả zero → API delete.
      const entriesToSend = rows.filter((r) => r.leads > 0 || r.closed > 0 || r.notClosed > 0 || r.isExisting);
      const hasExisting = rows.some((r) => r.isExisting);
      if (entriesToSend.length === 0 && !hasExisting) {
        showToast('error', 'Tất cả dòng đều = 0, không có gì để lưu');
        setSaving(false);
        return;
      }
      const entries: SalesEntryUpsert[] = entriesToSend.map((r) => ({
        period, periodType, branchId,
        saleId: r.saleId, saleName: r.saleName,
        source: r.source,
        leads: r.leads, closed: r.closed, notClosed: r.notClosed,
      }));
      const res = await entriesApi.bulkUpsert(entries);
      const written = (res as any).written ?? 0;
      const deleted = (res as any).deleted ?? 0;
      if (written === 0 && deleted > 0) {
        showToast('success', `Đã xoá ${deleted} dòng Lead cho ${period} · ${branchId}`);
      } else if (written > 0 && deleted > 0) {
        showToast('success', `Đã lưu ${written} · xoá ${deleted} dòng Lead cho ${period} · ${branchId}`);
      } else {
        showToast('success', `Đã lưu ${written} dòng cho ${period} · ${branchId}`);
      }
      await load();
    } catch (e: any) {
      showToast('error', 'Lưu lỗi: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const periodLabel = periodType === 'month' ? `Tháng ${month}/${year}` : `Ngày ${day}/${month}/${year}`;
  const daysInMonth = new Date(year, month, 0).getDate();

  // ===== Default view: 3 bảng tổng hợp tháng + nút "Nhập dữ liệu" =====
  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Toolbar: Cơ sở + Năm + Tháng + nút Nhập dữ liệu */}
      <div className="card">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0 grid grid-cols-3 gap-3 items-end max-w-2xl">
            <FieldLabel label="Cơ sở">
              <select
                value={branchId} onChange={(e) => setBranchId(e.target.value)}
                disabled={allowedBranches.length === 1}
                className={inputCls + ' font-semibold'}
              >
                {allowedBranches.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.name}</option>)}
              </select>
            </FieldLabel>
            <FieldLabel label="Năm">
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputCls}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </FieldLabel>
            <FieldLabel label="Tháng">
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={inputCls}>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </FieldLabel>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEntryLeadOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-lg hover:shadow-md transition"
            >
              <Plus size={16} /> Nhập Lead
            </button>
            <button
              onClick={() => setEntryRevPkgOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-semibold rounded-lg hover:shadow-md transition"
            >
              <Plus size={16} /> Nhập doanh số & gói
            </button>
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          📊 Đang xem <strong>tháng {month}/{year}</strong> — cơ sở <strong>{branchName}</strong>.
          <strong className="text-amber-700"> Nhập Lead</strong>: lead theo sale × nguồn ·
          <strong className="text-emerald-700"> Nhập doanh số & gói</strong>: doanh số theo sale + SL/doanh số gói.
          Quản lý sale ở <a href="/quan-ly-sale" className="text-emerald-700 underline">Quản trị → Quản lý Sale</a>.
        </div>
      </div>

      {/* Bảng tổng hợp tháng: Doanh số + Lead + SL gói */}
      <MonthlyTripleView
        data={monthDetail}
        loading={monthDetailLoading}
        year={year}
        month={month}
        branchName={branchName}
        monthlyQty={monthlyQty}
        monthlyQtyLoading={monthlyQtyLoading}
      />

      {/* ===== Modal A: Nhập Lead ===== */}
      {entryLeadOpen && (
        <EntryFormModal
          title="Nhập Lead"
          color="amber"
          onClose={() => { setEntryLeadOpen(false); setSummaryRefresh((k) => k + 1); }}
          headerRight={
            <div className="text-xs text-amber-50/90">
              Cơ sở <strong>{branchId}</strong> · Năm <strong>{year}</strong>
            </div>
          }
        >
          <div className="space-y-4">
      {/* Selectors (chung cho cả 2 modal) */}
      <div className="card">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-end">
          <FieldLabel label="Cơ sở">
            <select
              value={branchId} onChange={(e) => setBranchId(e.target.value)}
              disabled={allowedBranches.length === 1}
              className={inputCls + ' font-semibold'}
            >
              {allowedBranches.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.name}</option>)}
            </select>
          </FieldLabel>
          <FieldLabel label="Loại kỳ">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              {(['month', 'day'] as const).map((pt) => {
                const allowed = allowedPeriodTypes.includes(pt);
                const active = periodType === pt;
                return (
                  <button
                    key={pt}
                    onClick={() => allowed && setPeriodType(pt)}
                    disabled={!allowed}
                    title=""
                    className={`flex-1 py-1.5 text-sm rounded ${
                      active ? 'bg-white shadow text-emerald-700 font-semibold'
                      : allowed ? 'text-slate-600 hover:bg-white/50'
                      : 'text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    {pt === 'month' ? 'Tháng' : 'Ngày'}
                  </button>
                );
              })}
            </div>
          </FieldLabel>
          <FieldLabel label="Năm">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputCls}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </FieldLabel>
          <FieldLabel label="Tháng">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={inputCls}>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </FieldLabel>
          {periodType === 'day' ? (
            <FieldLabel label="Ngày">
              <select value={day} onChange={(e) => setDay(Number(e.target.value))} className={inputCls}>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </FieldLabel>
          ) : <div />}
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <div className="text-slate-600"><Calendar className="inline" size={14} /> Đang nhập: <strong>{periodLabel}</strong> · cơ sở <strong>{branchId}</strong> · key: <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{period}</code></div>
          <button onClick={load} disabled={loading} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
            <RotateCcw size={12} /> Reload
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`card flex items-center gap-2 ${toast.type === 'success' ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="text-emerald-700" size={18} /> : <AlertCircle className="text-rose-700" size={18} />}
          <div className={`text-sm ${toast.type === 'success' ? 'text-emerald-900' : 'text-rose-900'}`}>{toast.msg}</div>
        </div>
      )}

      {/* Grid */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="text-center py-12 text-slate-500"><Loader2 className="inline animate-spin" size={18} /> Đang tải...</div>
        ) : branchStaff.length === 0 ? (
          <div className="text-center py-12 text-slate-500">Chưa có nhân viên sale cho cơ sở này. Vào /users để thêm.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th rowSpan={2} className="p-2 border border-slate-300 text-left w-48">Tên sale</th>
                <th rowSpan={2} className="p-2 border border-slate-300 text-left w-56">Nguồn</th>
                <th colSpan={3} className="p-2 border border-slate-300 text-center">Bảng nhập Lead</th>
              </tr>
              <tr>
                <th className="p-2 border border-slate-300 text-center w-32">Số lượng</th>
                <th className="p-2 border border-slate-300 text-center w-32">Chốt</th>
                <th className="p-2 border border-slate-300 text-center w-32">Chưa chốt</th>
              </tr>
            </thead>
            <tbody>
              {/* Separator header trước nhóm Member (nếu cũng có nhóm PT — vd cơ sở 24) */}
              {hasPTGroup && groupedRows.some((g) => g.saleSubtype === 'member') && (
                <tr className="bg-emerald-50">
                  <td colSpan={5} className="p-2 border border-slate-300 font-bold uppercase tracking-wider text-xs text-emerald-800">
                    Sale Thẻ Member
                  </td>
                </tr>
              )}
              {groupedRows.map((g) => (
                <Fragment key={g.saleId}>
                  {/* Separator header trước nhóm PT đầu tiên */}
                  {g.saleId === firstPTSaleId && (
                    <tr className="bg-amber-50">
                      <td colSpan={5} className="p-2 border border-slate-300 font-bold uppercase tracking-wider text-xs text-amber-800">
                        Sale PT Gym (cơ sở 24)
                      </td>
                    </tr>
                  )}
                  {g.rows.map((rg, i) => {
                    const r = rg.row;
                    return (
                      <tr key={`${g.saleId}__${r.source}`} className="hover:bg-slate-50">
                        {i === 0 && (
                          <td rowSpan={g.rows.length} className={`p-2 border border-slate-300 font-semibold text-slate-800 align-top ${g.saleSubtype === 'pt' ? 'bg-amber-50/60' : 'bg-emerald-50/50'}`}>
                            {g.saleName}
                            {g.saleSubtype === 'pt' && (
                              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-200 text-amber-900 align-middle">PT</span>
                            )}
                          </td>
                        )}
                        <td className="p-2 border border-slate-300 text-slate-600">{SOURCE_LABEL[r.source]}</td>
                        <NumCell value={r.leads}     onChange={(v) => updateCell(rg.idx, 'leads', v)} />
                        <NumCell value={r.closed}    onChange={(v) => updateCell(rg.idx, 'closed', v)} />
                        {/* Chưa chốt = leads − closed (read-only, auto) */}
                        <td className="p-2 border border-slate-300 text-right text-amber-700 tabular-nums bg-amber-50/40">
                          {r.notClosed}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Subtotal per sale */}
                  <tr key={`${g.saleId}__subtotal`} className="bg-slate-50 font-semibold">
                    <td colSpan={2} className="p-2 border border-slate-300 text-right text-slate-700">
                      Tổng {g.saleName}{g.saleSubtype === 'pt' && <span className="ml-1 text-[10px] font-bold text-amber-700">(PT)</span>}
                    </td>
                    <td className="p-2 border border-slate-300 text-right tabular-nums">{totals.perSale[g.saleId]?.leads ?? 0}</td>
                    <td className="p-2 border border-slate-300 text-right text-emerald-700 tabular-nums">{totals.perSale[g.saleId]?.closed ?? 0}</td>
                    <td className="p-2 border border-slate-300 text-right text-amber-700 tabular-nums">{totals.perSale[g.saleId]?.notClosed ?? 0}</td>
                  </tr>
                </Fragment>
              ))}
              {/* Grand total */}
              <tr className="bg-emerald-100 font-bold">
                <td colSpan={2} className="p-2 border border-slate-400 text-right">TỔNG CƠ SỞ {branchId}</td>
                <td className="p-2 border border-slate-400 text-right tabular-nums">{totals.grand.leads}</td>
                <td className="p-2 border border-slate-400 text-right text-emerald-800 tabular-nums">{totals.grand.closed}</td>
                <td className="p-2 border border-slate-400 text-right text-amber-800 tabular-nums">{totals.grand.notClosed}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Save bar — Lead */}
      <div className="card flex items-center justify-between shadow-sm">
        <div className="text-sm text-slate-600">
          <strong>Bảng Lead:</strong> {rows.filter((r) => r.isExisting).length} dòng đã có / {rows.filter((r) => r.leads > 0 || r.closed > 0 || r.notClosed > 0).length} dòng sẽ lưu
        </div>
        <button
          onClick={save} disabled={saving || loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-lg hover:shadow-md transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {saving ? 'Đang lưu...' : `Lưu Lead — ${periodLabel}`}
        </button>
      </div>
          </div>{/* end Modal A content */}
        </EntryFormModal>
      )}

      {/* ===== Modal B: Nhập Doanh số & Gói ===== */}
      {entryRevPkgOpen && (
        <EntryFormModal
          title="Nhập doanh số & số lượng gói"
          color="emerald"
          onClose={() => { setEntryRevPkgOpen(false); setSummaryRefresh((k) => k + 1); }}
          headerRight={
            <div className="text-xs text-emerald-50/90">
              Cơ sở <strong>{branchId}</strong> · Năm <strong>{year}</strong>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Selectors riêng cho Modal B (period mode + selectors) */}
            <div className="card">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-end">
                <FieldLabel label="Cơ sở">
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={allowedBranches.length === 1} className={inputCls + ' font-semibold'}>
                    {allowedBranches.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.name}</option>)}
                  </select>
                </FieldLabel>
                <FieldLabel label="Loại kỳ (Doanh số per Sale)">
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                    {(['month', 'day'] as const).map((pt) => {
                      const allowed = allowedPeriodTypes.includes(pt);
                      const active = periodType === pt;
                      return (
                        <button key={pt} onClick={() => allowed && setPeriodType(pt)} disabled={!allowed}
                          className={`flex-1 py-1.5 text-sm rounded ${active ? 'bg-white shadow text-emerald-700 font-semibold' : allowed ? 'text-slate-600 hover:bg-white/50' : 'text-slate-300 cursor-not-allowed'}`}>
                          {pt === 'month' ? 'Tháng' : 'Ngày'}
                        </button>
                      );
                    })}
                  </div>
                </FieldLabel>
                <FieldLabel label="Năm">
                  <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputCls}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </FieldLabel>
                <FieldLabel label="Tháng">
                  <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={inputCls}>
                    {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </FieldLabel>
                {periodType === 'day' ? (
                  <FieldLabel label="Ngày (chỉ Doanh số per Sale)">
                    <select value={day} onChange={(e) => setDay(Number(e.target.value))} className={inputCls}>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </FieldLabel>
                ) : <div />}
              </div>
              <div className="mt-3 text-xs text-slate-500">
                <Calendar className="inline" size={12} /> Đang nhập: <strong>{periodLabel}</strong> · cơ sở <strong>{branchId}</strong>
                {' · '}<em>Lưu ý: Bảng gói luôn theo tháng (không phụ thuộc mode ngày).</em>
              </div>
            </div>

            {/* Toast */}
            {toast && (
              <div className={`card flex items-center gap-2 ${toast.type === 'success' ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
                {toast.type === 'success' ? <CheckCircle2 className="text-emerald-700" size={18} /> : <AlertCircle className="text-rose-700" size={18} />}
                <div className={`text-sm ${toast.type === 'success' ? 'text-emerald-900' : 'text-rose-900'}`}>{toast.msg}</div>
              </div>
            )}

            {/* Section 2: Doanh số per Sale */}
            <SimpleRevenueSection
              branchId={branchId}
              period={period}
              periodType={periodType}
              periodLabel={periodLabel}
              staff={branchStaff}
              onToast={showToast}
            />

            {/* Section 3 (combined): SL + Doanh số per gói — 1 bảng, 2 cột input */}
            <PackageCombinedSection
              branchId={branchId}
              year={year}
              month={month}
              periodLabel={`Tháng ${month}/${year}`}
              onToast={showToast}
            />
          </div>{/* end Modal B content */}
        </EntryFormModal>
      )}
    </div>
  );
}

// ============================================================================
// Bảng nhập doanh số — simplified: # | Tên sale | Doanh số
// Cùng layout cho cả mode tháng + ngày. Lưu với placeholder packageId='__total'
// (API skip package validation cho '__total'). Aggregation theo saleId vẫn đúng.
// ============================================================================

interface RevenueRow {
  saleId: string;
  saleName: string;
  revenue: number;
  isExisting: boolean;
}

function SimpleRevenueSection({ branchId, period, periodType, periodLabel, staff, onToast }: {
  branchId: string;
  period: string;
  periodType: PeriodType;
  periodLabel: string;
  staff: StaffUser[];
  onToast: (t: 'success' | 'error', msg: string) => void;
}) {
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!branchId || staff.length === 0) { setRows([]); return; }
    setLoading(true);
    try {
      // Cross-mode: nếu đang ở month-mode → fetch cả day-mode docs trong cùng calendar month.
      // Đảm bảo user thấy hết data đã nhập (kể cả day-mode lẻ) để có thể clear hoàn toàn.
      let existing: typeof rows extends never ? never : Awaited<ReturnType<typeof packageSalesApi.list>>;
      if (periodType === 'month') {
        const parsed = /^(\d{4})-(\d{2})$/.exec(period);
        if (parsed) {
          existing = await packageSalesApi.listMonth({
            year: Number(parsed[1]), month: Number(parsed[2]), branchId,
          });
        } else {
          existing = await packageSalesApi.list({ period, periodType, branchId });
        }
      } else {
        existing = await packageSalesApi.list({ period, periodType, branchId });
      }
      // Sum revenue per saleId (legacy data có thể chứa nhiều record/sale khác package — gộp lại 1 dòng).
      const revBySale = new Map<string, number>();
      for (const e of existing) {
        if (e.saleId === '__aggregate') continue; // bỏ aggregate cũ — form mới chỉ per-sale
        revBySale.set(e.saleId, (revBySale.get(e.saleId) ?? 0) + e.revenue);
      }
      setRows(staff.map((s) => ({
        saleId: s.id,
        saleName: s.name,
        revenue: revBySale.get(s.id) ?? 0,
        isExisting: revBySale.has(s.id),
      })));
    } catch (e: any) {
      onToast('error', 'Load doanh số: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [branchId, period, periodType, staff.length]);

  function updateRow(idx: number, revenue: number) {
    setRows((rs) => rs.map((r, i) => i === idx ? { ...r, revenue: Math.max(0, revenue) } : r));
  }

  async function save() {
    const toWrite = rows.filter((r) => r.revenue > 0);
    const hasExisting = rows.some((r) => r.isExisting);
    if (toWrite.length === 0 && !hasExisting) {
      onToast('error', 'Tất cả dòng = 0, không có gì để lưu');
      return;
    }
    setSaving(true);
    try {
      // Gửi cả dòng = 0 (cho phép XOÁ data đã nhập): user set về 0 + bấm Lưu → API delete docs.
      const entries: PackageSaleUpsert[] = toWrite.map((r) => ({
        period, periodType, branchId,
        saleId: r.saleId, saleName: r.saleName,
        groupId: '__total', groupName: '(Tổng)',
        packageId: '__total', packageName: '(Tổng theo sale)',
        quantity: 1, unitPrice: r.revenue, revenue: r.revenue,
      }));
      // replace=true → xoá entries cũ không có trong batch này (vd. legacy entries chi tiết theo gói).
      // Top-level period/branchId fallback cho clear-all case (entries=[]).
      const res = await packageSalesApi.bulkUpsert(entries, {
        replace: true, period, periodType, branchId,
      });
      const written = res.written ?? 0;
      const deleted = res.deleted ?? 0;
      if (written === 0 && deleted > 0) {
        onToast('success', `Đã xoá ${deleted} dòng doanh số ${periodLabel}`);
      } else if (written > 0 && deleted > 0) {
        onToast('success', `Đã lưu ${written} sale · xoá ${deleted} sale cũ — ${periodLabel}`);
      } else {
        onToast('success', `Đã lưu doanh số ${written} sale cho ${periodLabel}`);
      }
      await load();
      // Check chênh lệch giữa per-Sale (vừa lưu) và per-Gói (Section 3) — cảnh báo ngay nếu mismatch.
      const m = /^(\d{4})-(\d{2})/.exec(period);
      if (m) await checkDiscrepancy(branchId, Number(m[1]), Number(m[2]), onToast);
    } catch (e: any) {
      onToast('error', 'Lưu lỗi: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const grandTotal = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <>
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Bảng nhập doanh số</h3>
            <p className="text-xs text-slate-500">
              Nhập tổng doanh số theo từng sale cho <strong>{periodLabel}</strong>. Sale nào không có doanh số → bỏ trống (= 0).
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-500"><Loader2 className="inline animate-spin" size={16} /> Đang tải...</div>
        ) : staff.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            Cơ sở chưa có sale nào. Vào <a href="/quan-ly-sale" className="text-emerald-700 underline">Quản trị → Quản lý Sale</a> để thêm.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 border border-slate-300 text-left w-12">#</th>
                <th className="p-2 border border-slate-300 text-left">Tên sale</th>
                <th className="p-2 border border-slate-300 text-center w-56">Doanh số (VND)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.saleId} className="hover:bg-slate-50">
                  <td className="p-2 border border-slate-300 text-slate-400 text-center tabular-nums">{idx + 1}</td>
                  <td className="p-2 border border-slate-300 font-medium text-slate-800">{r.saleName}</td>
                  <td className="p-1 border border-slate-300">
                    <MoneyInput
                      value={r.revenue}
                      onChange={(v) => updateRow(idx, v)}
                      className="w-full px-2 py-1 text-right text-sm border-0 tabular-nums focus:ring-2 focus:ring-emerald-400 rounded font-semibold text-blue-700"
                    />
                  </td>
                </tr>
              ))}
              <tr className="bg-emerald-100 font-bold">
                <td colSpan={2} className="p-2 border border-slate-400 text-right">TỔNG cơ sở</td>
                <td className="p-2 border border-slate-400 text-right text-blue-800 tabular-nums">
                  {grandTotal.toLocaleString('vi-VN')}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="card flex items-center justify-between sticky bottom-4 shadow-lg">
        <div className="text-sm text-slate-600">
          <strong>Bảng Doanh số:</strong> {rows.filter((r) => r.isExisting).length} sale có data /
          {' '}{rows.filter((r) => r.revenue > 0).length} sẽ lưu — tổng{' '}
          <strong className="text-blue-700">{grandTotal.toLocaleString('vi-VN')}₫</strong>
        </div>
        <button
          onClick={save} disabled={saving || loading || rows.length === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-semibold rounded-lg hover:shadow-md transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {saving ? 'Đang lưu...' : `Lưu Doanh số — ${periodLabel}`}
        </button>
      </div>
    </>
  );
}

// ============================================================================
// PackageCombinedSection — GỘP 3A + 3B vào 1 bảng.
// 1 row/gói với 2 ô input: SL gói + Doanh số. Cả 2 đều optional — user chỉ nhập 1 cũng OK.
// Save: gửi entries có cả quantity + revenue (0 cũng gửi). API merge từng field, cleanup
// xoá doc nếu cả 2 fields = 0.
// ============================================================================
interface CombinedRow {
  packageId: string;
  packageName: string;
  groupId: string;
  groupName: string;
  quantity: number;
  revenue: number;
  hasExistingQty: boolean;
  hasExistingRev: boolean;
}

function PackageCombinedSection({ branchId, year, month, periodLabel, onToast }: {
  branchId: string;
  year: number;
  month: number;
  periodLabel: string;
  onToast: (t: 'success' | 'error', msg: string) => void;
}) {
  const [groups, setGroups] = useState<PackageGroup[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [rows, setRows] = useState<CombinedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!branchId) { setRows([]); return; }
    setLoading(true);
    try {
      const [grs, pks, existing] = await Promise.all([
        packageGroupsApi.list(branchId),
        packagesApi.list({ branchId, activeOnly: true }),
        packageQuantitiesApi.list({ year, month, branchId }),
      ]);
      setGroups(grs.filter((g) => g.active !== false));
      const pksSorted = [...pks].sort(comparePackagesSmart);
      setPackages(pksSorted);
      const qtyByPkg = new Map<string, number>();
      const revByPkg = new Map<string, number>();
      const hasQty = new Set<string>();
      const hasRev = new Set<string>();
      for (const e of existing) {
        qtyByPkg.set(e.packageId, e.quantity ?? 0);
        if ((e.quantity ?? 0) > 0) hasQty.add(e.packageId);
        if (e.revenue !== undefined && e.revenue !== null) {
          revByPkg.set(e.packageId, e.revenue);
          if (e.revenue > 0) hasRev.add(e.packageId);
        }
      }
      const grpById = new Map(grs.map((g) => [g.id, g]));
      setRows(pksSorted.map((p) => ({
        packageId: p.id,
        packageName: p.name,
        groupId: p.groupId,
        groupName: grpById.get(p.groupId)?.name ?? '(?)',
        quantity: qtyByPkg.get(p.id) ?? 0,
        revenue: revByPkg.get(p.id) ?? 0,
        hasExistingQty: hasQty.has(p.id),
        hasExistingRev: hasRev.has(p.id),
      })));
    } catch (e: any) {
      onToast('error', 'Load gói: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [branchId, year, month]);

  function updateQty(packageId: string, v: number) {
    setRows((rs) => rs.map((r) => r.packageId === packageId ? { ...r, quantity: Math.max(0, v) } : r));
  }
  function updateRev(packageId: string, v: number) {
    setRows((rs) => rs.map((r) => r.packageId === packageId ? { ...r, revenue: Math.max(0, v) } : r));
  }

  async function save() {
    const hasAnyValue = rows.some((r) => r.quantity > 0 || r.revenue > 0);
    const hasAnyExisting = rows.some((r) => r.hasExistingQty || r.hasExistingRev);
    if (!hasAnyValue && !hasAnyExisting) {
      onToast('error', 'Tất cả ô = 0, không có gì để lưu');
      return;
    }
    setSaving(true);
    try {
      // Gửi MỌI row với cả quantity + revenue (kể cả 0). API merge cả 2, cleanup xoá doc
      // khi sau merge cả qty=0 AND revenue=0.
      const entries: PackageQuantityUpsert[] = rows.map((r) => ({
        packageId: r.packageId,
        packageName: r.packageName,
        groupId: r.groupId,
        groupName: r.groupName,
        quantity: r.quantity,
        revenue: r.revenue,
      }));
      const { written, deleted } = await packageQuantitiesApi.bulkUpsert(
        { year, month, branchId, entries },
      );
      const d = deleted ?? 0;
      onToast('success',
        d > 0 ? `Gói: lưu ${written} · xoá ${d} gói trống — ${periodLabel}`
              : `Đã lưu ${written} gói cho ${periodLabel}`);
      await load();
      // Check chênh lệch giữa per-Gói (vừa lưu) và per-Sale (Section 2) — cảnh báo ngay nếu mismatch.
      await checkDiscrepancy(branchId, year, month, onToast);
    } catch (e: any) {
      onToast('error', 'Lưu gói: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const byGroup = useMemo(() => {
    const out: { group: PackageGroup; pkgs: CombinedRow[] }[] = [];
    for (const g of groups) {
      const pkgs = rows.filter((r) => r.groupId === g.id);
      if (pkgs.length > 0) out.push({ group: g, pkgs });
    }
    return out;
  }, [groups, rows]);

  const grandTotalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const grandTotalRev = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <>
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Bảng nhập gói dịch vụ (SL + Doanh số)</h3>
            <p className="text-xs text-slate-500">
              Nhập <strong>SL gói</strong> và/hoặc <strong>Doanh số (VND)</strong> cho từng gói trong <strong>{periodLabel}</strong>.
              Có thể chỉ nhập 1 trong 2 — không bắt buộc đủ cả. Gói không phát sinh → bỏ trống.
            </p>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-8 text-slate-500"><Loader2 className="inline animate-spin" size={16} /> Đang tải...</div>
        ) : packages.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            Cơ sở chưa có gói dịch vụ nào. Vào <a href="/doanh-so/packages" className="text-emerald-700 underline">Quản trị → Quản lý gói dịch vụ</a> để thêm.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 border border-slate-300 text-left w-12">#</th>
                <th className="p-2 border border-slate-300 text-left w-48">Nhóm</th>
                <th className="p-2 border border-slate-300 text-left">Gói dịch vụ</th>
                <th className="p-2 border border-slate-300 text-center w-32">SL gói</th>
                <th className="p-2 border border-slate-300 text-center w-48">Doanh số (VND)</th>
              </tr>
            </thead>
            <tbody>
              {byGroup.map(({ group, pkgs }) => (
                <Fragment key={group.id}>
                  {pkgs.map((r, idx) => (
                    <tr key={r.packageId} className="hover:bg-slate-50">
                      {idx === 0 && (
                        <td rowSpan={pkgs.length} className="p-2 border border-slate-300 text-slate-400 text-center align-top tabular-nums bg-slate-50/30">
                          —
                        </td>
                      )}
                      {idx === 0 && (
                        <td rowSpan={pkgs.length} className="p-2 border border-slate-300 font-semibold text-slate-800 align-top bg-emerald-50/40">
                          {group.name}
                          <div className="text-[10px] text-slate-500 font-normal">{pkgs.length} gói</div>
                        </td>
                      )}
                      <td className="p-2 border border-slate-300 text-slate-700">{r.packageName}</td>
                      <td className="p-1 border border-slate-300">
                        <input
                          type="number" min={0} step={1} value={r.quantity}
                          onChange={(e) => updateQty(r.packageId, Number(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-right text-sm border-0 tabular-nums focus:ring-2 focus:ring-purple-400 rounded font-semibold text-purple-700"
                        />
                      </td>
                      <td className="p-1 border border-slate-300">
                        <MoneyInput
                          value={r.revenue}
                          onChange={(v) => updateRev(r.packageId, v)}
                          className="w-full px-2 py-1 text-right text-sm border-0 tabular-nums focus:ring-2 focus:ring-blue-400 rounded font-semibold text-blue-700"
                        />
                      </td>
                    </tr>
                  ))}
                  {/* Subtotal per group */}
                  <tr className="bg-slate-100 font-semibold text-xs">
                    <td colSpan={3} className="p-2 border border-slate-300 text-right text-slate-700">Tổng {group.name}</td>
                    <td className="p-2 border border-slate-300 text-right tabular-nums text-purple-700">{pkgs.reduce((s, r) => s + r.quantity, 0)}</td>
                    <td className="p-2 border border-slate-300 text-right tabular-nums text-blue-700">{pkgs.reduce((s, r) => s + r.revenue, 0).toLocaleString('vi-VN')}</td>
                  </tr>
                </Fragment>
              ))}
              <tr className="bg-gradient-to-r from-purple-100 to-blue-100 font-bold">
                <td colSpan={3} className="p-2 border border-slate-400 text-right">TỔNG CƠ SỞ</td>
                <td className="p-2 border border-slate-400 text-right text-purple-800 tabular-nums">{grandTotalQty} gói</td>
                <td className="p-2 border border-slate-400 text-right text-blue-800 tabular-nums">{grandTotalRev.toLocaleString('vi-VN')}₫</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
      <div className="card flex items-center justify-between shadow-sm">
        <div className="text-sm text-slate-600 space-y-0.5">
          <div>
            <strong className="text-purple-700">SL:</strong> {rows.filter((r) => r.hasExistingQty).length} gói có data · {rows.filter((r) => r.quantity > 0).length} sẽ lưu · tổng <strong>{grandTotalQty}</strong>
          </div>
          <div>
            <strong className="text-blue-700">Doanh số:</strong> {rows.filter((r) => r.hasExistingRev).length} gói có data · {rows.filter((r) => r.revenue > 0).length} sẽ lưu · tổng <strong>{grandTotalRev.toLocaleString('vi-VN')}₫</strong>
          </div>
        </div>
        <button
          onClick={save} disabled={saving || loading || rows.length === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-700 text-white font-semibold rounded-lg hover:shadow-md transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {saving ? 'Đang lưu...' : `Lưu gói (SL + Doanh số) — ${periodLabel}`}
        </button>
      </div>
    </>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-slate-100';

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function NumCell({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <td className="p-1 border border-slate-300">
      <input
        type="number" min={0} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full px-2 py-1 text-right text-sm border-0 tabular-nums focus:ring-2 focus:ring-emerald-400 rounded"
      />
    </td>
  );
}

// MoneyInput — input text format thousand-separator (1.000.000 VND).
// Native <input type="number"> không cho display dấu chấm → dùng text + parse/format manual.
// Mobile keyboard: inputMode="numeric" để bật bàn phím số. Cap 999 tỷ (12 chữ số).
function MoneyInput({
  value, onChange, className = '', placeholder = '0', disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value === 0 ? '' : value.toLocaleString('vi-VN')}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
        onChange(digits ? Number(digits) : 0);
      }}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}

// Gọi sau mỗi save (Modal B 2 form). Server-side check 2 tổng per-Sale vs per-Gói.
// Mismatch → show warning toast + tự upsert discrepancy doc (admin xem ở dashboard).
// Match → tự xoá discrepancy doc nếu đã có.
async function checkDiscrepancy(
  branchId: string,
  year: number,
  month: number,
  onToast: (t: 'success' | 'error', msg: string) => void,
): Promise<void> {
  try {
    const res = await fetch('/api/discrepancies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId, year, month }),
    });
    if (!res.ok) return;
    const j = await res.json() as { match: boolean; perSaleRev: number; perPkgRev: number; diff: number };
    if (!j.match) {
      const absDiff = Math.abs(j.diff);
      onToast(
        'error',
        `⚠ Cảnh báo chênh lệch T${month}/${year}: Doanh số theo Sale ${j.perSaleRev.toLocaleString('vi-VN')}₫ ≠ theo Gói ${j.perPkgRev.toLocaleString('vi-VN')}₫. Chênh ${absDiff.toLocaleString('vi-VN')}₫. Vui lòng kiểm tra lại. (Sau 24h chưa xử lý sẽ báo GĐ Kinh doanh.)`,
      );
    }
  } catch {
    // Silent fail — không ảnh hưởng main save flow
  }
}

// ============================================================================
// Phase 2: MonthlyTripleView — 3 bảng tổng hợp tháng
//   1. Theo gói dịch vụ (qty + revenue)
//   2. Theo Sale (qty + revenue)
//   3. Lead × Nguồn matrix (per Sale × per Source)
// ============================================================================
const LEAD_SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;
type LeadSource = typeof LEAD_SOURCES[number];

interface MonthDetailData {
  branchId: string; year: number; month: number;
  totalQty: number; totalRevenue: number; lineCount: number;
  bySale: { saleId: string; saleName: string; qty: number; revenue: number }[];
  bySalePackage: {
    saleId: string; saleName: string;
    totalQty: number; totalRevenue: number;
    packages: { packageId: string; packageName: string; groupName: string; qty: number; revenue: number }[];
  }[];
  hasDayMode: boolean;
  leadsBySale: {
    saleId: string; saleName: string;
    bySource: Record<LeadSource, { leads: number; closed: number; notClosed: number }>;
    totalLeads: number; totalClosed: number; totalNotClosed: number;
  }[];
  leadsBySource: Record<LeadSource, { leads: number; closed: number; notClosed: number }>;
  leadsTotal: { leads: number; closed: number; notClosed: number };
  hasDayModeLeads: boolean;
  // Targets — đã set ở /doanh-so dashboard
  hasTargets: boolean;
  monthRevenueTarget: number;
  yearRevenueTarget: number;
  monthLeadTarget: number;
  yearLeadTarget: number;
}

// Format đầy đủ — dấu chấm tách nghìn (vi-VN), KHÔNG rút gọn "tr/tỷ" (tránh sai sum tổng).
function fmtMoney(n: number): string {
  return n.toLocaleString('vi-VN');
}

function MonthlyTripleView({ data, loading, year, month, branchName, monthlyQty, monthlyQtyLoading }: {
  data: MonthDetailData | null;
  loading: boolean;
  year: number;
  month: number;
  branchName: string;
  monthlyQty: { packageId: string; packageName: string; groupId: string; groupName: string; quantity: number; revenue?: number }[];
  monthlyQtyLoading: boolean;
}) {
  if (loading) {
    return (
      <div className="card text-center py-16 text-slate-500">
        <Loader2 className="inline animate-spin" size={20} /> Đang tải dữ liệu tháng {month}/{year}…
      </div>
    );
  }

  // Fallback rỗng — giữ y nguyên cấu trúc UI cho cơ sở chưa nhập data (mọi cơ sở phải đồng nhất).
  const safe: MonthDetailData = data ?? {
    branchId: '', year, month,
    totalQty: 0, totalRevenue: 0, lineCount: 0,
    bySale: [], bySalePackage: [],
    hasDayMode: false,
    leadsBySale: [],
    leadsBySource: {
      MKT: { leads: 0, closed: 0, notClosed: 0 },
      Sale: { leads: 0, closed: 0, notClosed: 0 },
      Renew: { leads: 0, closed: 0, notClosed: 0 },
      Referral: { leads: 0, closed: 0, notClosed: 0 },
      'Walk-in': { leads: 0, closed: 0, notClosed: 0 },
    },
    leadsTotal: { leads: 0, closed: 0, notClosed: 0 },
    hasDayModeLeads: false,
    hasTargets: false,
    monthRevenueTarget: 0,
    yearRevenueTarget: 0,
    monthLeadTarget: 0,
    yearLeadTarget: 0,
  };
  const noActual = safe.lineCount === 0 && safe.leadsTotal.leads === 0;
  const revPct = safe.monthRevenueTarget > 0 ? Math.round((safe.totalRevenue / safe.monthRevenueTarget) * 100) : 0;
  const leadPct = safe.monthLeadTarget > 0 ? Math.round((safe.leadsTotal.leads / safe.monthLeadTarget) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Banner — phân biệt 3 trạng thái: 1) chưa target+chưa actual, 2) có target chưa actual, 3) có actual */}
      {noActual && !safe.hasTargets && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 flex items-center gap-3">
          <div className="text-2xl">📭</div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-700">
              Tháng {month}/{year} — {branchName} chưa có dữ liệu thực tế và chưa đặt mục tiêu
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Đặt mục tiêu tại <a href="/doanh-so" className="text-emerald-700 underline">/doanh-so</a> · Bấm <strong>+ Nhập dữ liệu</strong> để nhập Lead/Gói.
            </div>
          </div>
        </div>
      )}
      {noActual && safe.hasTargets && (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3 flex items-center gap-3">
          <div className="text-2xl">🎯</div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-900">
              Tháng {month}/{year} — {branchName} đã đặt mục tiêu, chưa có doanh số thực tế
            </div>
            <div className="text-xs text-amber-800/80 mt-0.5">
              Mục tiêu tháng: <strong>{fmtMoney(safe.monthRevenueTarget)}</strong>{safe.monthLeadTarget > 0 && <> · <strong>{safe.monthLeadTarget}</strong> lead</>}.
              Bấm <strong>+ Nhập dữ liệu</strong> để bắt đầu nhập Lead/Gói dịch vụ.
            </div>
          </div>
        </div>
      )}

      {/* KPI quick stats — 2 cột (bỏ "Tổng số gói" vì form đã đơn giản hoá, không track gói nữa) */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi
          label="Doanh số tháng (thực / mục tiêu)"
          value={fmtMoney(safe.totalRevenue)}
          accent="emerald"
          sub={safe.monthRevenueTarget > 0 ? `Mục tiêu ${fmtMoney(safe.monthRevenueTarget)} · ${revPct}% đạt` : 'Chưa đặt mục tiêu'}
        />
        <Kpi
          label="Lead tháng (thực / mục tiêu)"
          value={`${safe.leadsTotal.leads} / ${safe.leadsTotal.closed}`}
          accent="amber"
          sub={
            safe.monthLeadTarget > 0
              ? `Mục tiêu ${safe.monthLeadTarget} lead · ${leadPct}% đạt · ${safe.leadsTotal.leads > 0 ? Math.round((safe.leadsTotal.closed / safe.leadsTotal.leads) * 100) : 0}% chốt`
              : `${safe.leadsTotal.leads > 0 ? Math.round((safe.leadsTotal.closed / safe.leadsTotal.leads) * 100) : 0}% chốt · chưa đặt mục tiêu lead`
          }
        />
      </div>

      {/* Bảng 1: Doanh số theo Sale (simplified — chỉ Sale + Doanh số + % tổng) */}
      <BySaleSimpleTable rows={safe.bySalePackage} total={safe.totalRevenue} />

      {/* Bảng 2: Lead matrix (không liên quan doanh số — giữ nguyên) */}
      <LeadMatrixTable
        rowsBySale={safe.leadsBySale}
        bySource={safe.leadsBySource}
        total={safe.leadsTotal}
      />

      {/* Bảng 3A: SL gói dịch vụ tháng (cơ cấu) — data riêng từ packageQuantities collection */}
      <PackageQtySummaryTable rows={monthlyQty} loading={monthlyQtyLoading} />

      {/* Bảng 3B: Doanh số theo gói dịch vụ tháng — share collection với 3A, dùng field revenue */}
      <PackageRevSummaryTable rows={monthlyQty} loading={monthlyQtyLoading} />
    </div>
  );
}

function PackageRevSummaryTable({ rows, loading }: {
  rows: { packageId: string; packageName: string; groupId: string; groupName: string; quantity: number; revenue?: number }[];
  loading: boolean;
}) {
  // Group rows by groupName, chỉ giữ row có revenue > 0.
  const grouped = useMemo(() => {
    const byGroup = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.revenue || r.revenue <= 0) continue;
      if (!byGroup.has(r.groupId)) byGroup.set(r.groupId, []);
      byGroup.get(r.groupId)!.push(r);
    }
    return Array.from(byGroup.entries()).map(([gid, items]) => ({
      groupId: gid,
      groupName: items[0]?.groupName ?? '(không có tên)',
      items: [...items].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0)),
      groupTotal: items.reduce((s, x) => s + (x.revenue ?? 0), 0),
    })).sort((a, b) => b.groupTotal - a.groupTotal);
  }, [rows]);

  const grandTotal = useMemo(() => rows.reduce((s, r) => s + (r.revenue ?? 0), 0), [rows]);

  if (loading) {
    return (
      <div className="rounded-xl border border-blue-200 bg-white shadow-sm py-10 text-center text-slate-500">
        <Loader2 className="inline animate-spin" size={16} /> Đang tải doanh số gói...
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-blue-900">💰 Doanh số theo gói dịch vụ (cơ cấu tháng)</h3>
        <span className="text-[11px] text-slate-500">
          {grouped.length} nhóm · {rows.filter((r) => (r.revenue ?? 0) > 0).length} gói · <strong className="text-blue-700">{grandTotal.toLocaleString('vi-VN')}₫</strong>
        </span>
      </header>
      {grouped.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">
          Tháng này chưa có dữ liệu doanh số theo gói. Bấm <strong>+ Nhập dữ liệu</strong> → cuộn xuống "Bảng nhập doanh số theo gói dịch vụ".
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums table-fixed">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-semibold w-12">#</th>
                <th className="px-3 py-2 text-left font-semibold w-48">Nhóm</th>
                <th className="px-3 py-2 text-left font-semibold">Gói dịch vụ</th>
                <th className="px-3 py-2 text-center font-semibold w-44">Doanh số</th>
                <th className="px-3 py-2 text-center font-semibold w-24">% cơ cấu</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g, gIdx) => (
                <Fragment key={g.groupId}>
                  {g.items.map((r, idx) => {
                    const rev = r.revenue ?? 0;
                    const pct = grandTotal > 0 ? Math.round((rev / grandTotal) * 100) : 0;
                    const rowBg = (gIdx + idx) % 2 === 1 ? 'bg-slate-50/40' : 'bg-white';
                    return (
                      <tr key={r.packageId} className={`border-t border-slate-100 hover:bg-blue-50/30 ${rowBg}`}>
                        {idx === 0 && (
                          <td rowSpan={g.items.length} className={`px-3 py-1.5 text-slate-400 align-top ${rowBg} border-r border-slate-100`}>
                            {gIdx + 1}
                          </td>
                        )}
                        {idx === 0 && (
                          <td rowSpan={g.items.length} className={`px-3 py-1.5 font-semibold text-blue-900 align-top ${rowBg} border-r border-slate-100`}>
                            {g.groupName}
                            <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                              {g.items.length} gói · {g.groupTotal.toLocaleString('vi-VN')}₫ ({grandTotal > 0 ? Math.round((g.groupTotal / grandTotal) * 100) : 0}%)
                            </div>
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-slate-700">{r.packageName}</td>
                        <td className="px-3 py-1.5 text-center font-bold text-blue-700">{fmtMoney(rev)}</td>
                        <td className="px-3 py-1.5 text-center text-slate-500">{pct}%</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="bg-gradient-to-r from-blue-100 to-indigo-50 font-bold text-blue-900">
              <tr className="border-t-2 border-blue-300">
                <td colSpan={3} className="px-3 py-2 text-right">Tổng cơ sở</td>
                <td className="px-3 py-2 text-center">{fmtMoney(grandTotal)}</td>
                <td className="px-3 py-2 text-center">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function PackageQtySummaryTable({ rows, loading }: {
  rows: { packageId: string; packageName: string; groupId: string; groupName: string; quantity: number }[];
  loading: boolean;
}) {
  // Group rows by groupName + sort theo qty desc trong nhóm.
  const grouped = useMemo(() => {
    const byGroup = new Map<string, typeof rows>();
    for (const r of rows) {
      if (r.quantity <= 0) continue; // ẩn gói SL=0 cho gọn (form chính vẫn hiện đủ)
      if (!byGroup.has(r.groupId)) byGroup.set(r.groupId, []);
      byGroup.get(r.groupId)!.push(r);
    }
    return Array.from(byGroup.entries()).map(([gid, items]) => ({
      groupId: gid,
      groupName: items[0].groupName,
      items: [...items].sort((a, b) => b.quantity - a.quantity),
      groupTotal: items.reduce((s, x) => s + x.quantity, 0),
    })).sort((a, b) => b.groupTotal - a.groupTotal);
  }, [rows]);

  const grandTotal = useMemo(() => rows.reduce((s, r) => s + r.quantity, 0), [rows]);

  if (loading) {
    return (
      <div className="rounded-xl border border-purple-200 bg-white shadow-sm py-10 text-center text-slate-500">
        <Loader2 className="inline animate-spin" size={16} /> Đang tải SL gói...
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-purple-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 bg-gradient-to-r from-purple-50 to-fuchsia-50 border-b border-purple-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-purple-900">📦 Số lượng gói dịch vụ (cơ cấu tháng)</h3>
        <span className="text-[11px] text-slate-500">
          {grouped.length} nhóm · {rows.filter((r) => r.quantity > 0).length} gói · <strong className="text-purple-700">{grandTotal.toLocaleString('vi-VN')}</strong> gói tổng
        </span>
      </header>
      {grouped.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">
          Tháng này chưa có dữ liệu SL gói. Bấm <strong>+ Nhập dữ liệu</strong> → cuộn xuống "Bảng nhập số lượng gói dịch vụ".
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums table-fixed">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-semibold w-12">#</th>
                <th className="px-3 py-2 text-left font-semibold w-48">Nhóm</th>
                <th className="px-3 py-2 text-left font-semibold">Gói dịch vụ</th>
                <th className="px-3 py-2 text-center font-semibold w-28">Số lượng</th>
                <th className="px-3 py-2 text-center font-semibold w-24">% cơ cấu</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g, gIdx) => (
                <Fragment key={g.groupId}>
                  {g.items.map((r, idx) => {
                    const pct = grandTotal > 0 ? Math.round((r.quantity / grandTotal) * 100) : 0;
                    const rowBg = (gIdx + idx) % 2 === 1 ? 'bg-slate-50/40' : 'bg-white';
                    return (
                      <tr key={r.packageId} className={`border-t border-slate-100 hover:bg-purple-50/30 ${rowBg}`}>
                        {idx === 0 && (
                          <td rowSpan={g.items.length} className={`px-3 py-1.5 text-slate-400 align-top ${rowBg} border-r border-slate-100`}>
                            {gIdx + 1}
                          </td>
                        )}
                        {idx === 0 && (
                          <td rowSpan={g.items.length} className={`px-3 py-1.5 font-semibold text-purple-900 align-top ${rowBg} border-r border-slate-100`}>
                            {g.groupName}
                            <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                              {g.items.length} gói · {g.groupTotal} ({grandTotal > 0 ? Math.round((g.groupTotal / grandTotal) * 100) : 0}%)
                            </div>
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-slate-700">{r.packageName}</td>
                        <td className="px-3 py-1.5 text-center font-bold text-purple-700">{r.quantity}</td>
                        <td className="px-3 py-1.5 text-center text-slate-500">{pct}%</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="bg-gradient-to-r from-purple-100 to-fuchsia-50 font-bold text-purple-900">
              <tr className="border-t-2 border-purple-300">
                <td colSpan={3} className="px-3 py-2 text-right">Tổng cơ sở</td>
                <td className="px-3 py-2 text-center">{grandTotal}</td>
                <td className="px-3 py-2 text-center">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent: 'emerald' | 'sky' | 'amber'; sub?: string }) {
  const A = {
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    sky:     'bg-sky-50 text-sky-800 ring-sky-200',
    amber:   'bg-amber-50 text-amber-800 ring-amber-200',
  }[accent];
  return (
    <div className={`rounded-xl ring-1 px-4 py-3 ${A}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[11px] opacity-70 mt-0.5">{sub}</div>}
    </div>
  );
}

function BySaleSimpleTable({ rows, total }: {
  rows: MonthDetailData['bySalePackage'];
  total: number;
}) {
  // Sort desc theo doanh số. __aggregate xếp cuối với label đặc biệt.
  const sorted = [...rows].sort((a, b) => {
    if (a.saleId === '__aggregate') return 1;
    if (b.saleId === '__aggregate') return -1;
    return b.totalRevenue - a.totalRevenue;
  });
  return (
    <div className="rounded-xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-emerald-900">👤 Doanh số theo Sale</h3>
        <span className="text-[11px] text-slate-500">{sorted.length} sale</span>
      </header>
      {sorted.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">Chưa có dữ liệu doanh số sale</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums table-fixed">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-semibold w-12">#</th>
                <th className="px-3 py-2 text-left font-semibold">Sale</th>
                <th className="px-3 py-2 text-center font-semibold w-44">Doanh số</th>
                <th className="px-3 py-2 text-center font-semibold w-24">% tổng</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((sale, idx) => {
                const isAggregate = sale.saleId === '__aggregate';
                const pct = total > 0 ? Math.round((sale.totalRevenue / total) * 100) : 0;
                return (
                  <tr key={sale.saleId} className={`border-t border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/40' : ''} hover:bg-emerald-50/30`}>
                    <td className="px-3 py-1.5 text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-1.5 font-semibold text-slate-800">
                      {isAggregate ? <em className="text-slate-500">{sale.saleName}</em> : sale.saleName}
                    </td>
                    <td className="px-3 py-1.5 text-center font-bold text-emerald-700">{fmtMoney(sale.totalRevenue)}</td>
                    <td className="px-3 py-1.5 text-center text-slate-500">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gradient-to-r from-emerald-100 to-teal-50 font-bold text-emerald-900">
              <tr className="border-t-2 border-emerald-300">
                <td colSpan={2} className="px-3 py-2 text-right">Tổng ({sorted.length} sale)</td>
                <td className="px-3 py-2 text-center">{fmtMoney(total)}</td>
                <td className="px-3 py-2 text-center">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function LeadMatrixTable({ rowsBySale, bySource, total }: {
  rowsBySale: MonthDetailData['leadsBySale'];
  bySource: MonthDetailData['leadsBySource'];
  total: MonthDetailData['leadsTotal'];
}) {
  const closeRate = total.leads > 0 ? Math.round((total.closed / total.leads) * 100) : 0;
  return (
    <div className="rounded-xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-emerald-900">🎯 Lead theo Sale × Nguồn</h3>
        <span className="text-[11px] text-slate-500">Mỗi ô: <span className="text-slate-700 font-semibold">SL lead</span> / <span className="text-emerald-700 font-semibold">SL chốt</span></span>
      </header>
      {rowsBySale.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">Chưa có dữ liệu lead</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-slate-50 z-10">Sale</th>
                {LEAD_SOURCES.map((src) => (
                  <th key={src} className="px-2 py-2 text-center font-semibold">{src}</th>
                ))}
                <th className="px-3 py-2 text-center font-semibold bg-emerald-50 text-emerald-800">Tổng</th>
                <th className="px-3 py-2 text-center font-semibold bg-emerald-50 text-emerald-800 w-14">% chốt</th>
              </tr>
            </thead>
            <tbody>
              {rowsBySale.map((r, i) => {
                const rate = r.totalLeads > 0 ? Math.round((r.totalClosed / r.totalLeads) * 100) : 0;
                const isAggregate = r.saleId === '__aggregate';
                return (
                  <tr key={r.saleId} className={`border-t border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/40' : ''} hover:bg-emerald-50/40`}>
                    <td className={`px-3 py-1.5 font-medium text-slate-800 sticky left-0 z-10 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                      {isAggregate ? <em className="text-slate-500">{r.saleName}</em> : r.saleName}
                    </td>
                    {LEAD_SOURCES.map((src) => {
                      const cell = r.bySource[src];
                      const empty = cell.leads === 0 && cell.closed === 0;
                      return (
                        <td key={src} className="px-2 py-1.5 text-center">
                          {empty ? <span className="text-slate-300">—</span> : (
                            <span className="tabular-nums">
                              <span className="text-slate-700">{cell.leads}</span>
                              <span className="text-slate-400 mx-0.5">/</span>
                              <span className="text-emerald-700 font-semibold">{cell.closed}</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-center font-semibold bg-emerald-50/40">
                      <span className="text-slate-700">{r.totalLeads}</span>
                      <span className="text-slate-400 mx-0.5">/</span>
                      <span className="text-emerald-700">{r.totalClosed}</span>
                    </td>
                    <td className="px-3 py-1.5 text-center font-bold text-emerald-700 bg-emerald-50/40">{rate}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gradient-to-r from-emerald-100 to-teal-50 font-bold text-emerald-900">
              <tr className="border-t-2 border-emerald-300">
                <td className="px-3 py-2 sticky left-0 bg-emerald-100 z-10">Tổng theo nguồn</td>
                {LEAD_SOURCES.map((src) => {
                  const c = bySource[src];
                  return (
                    <td key={src} className="px-2 py-2 text-center">
                      <span className="text-emerald-900">{c.leads}</span>
                      <span className="text-emerald-700 mx-0.5">/</span>
                      <span className="text-emerald-800">{c.closed}</span>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center bg-emerald-200/60">
                  <span>{total.leads}</span>
                  <span className="mx-0.5">/</span>
                  <span>{total.closed}</span>
                </td>
                <td className="px-3 py-2 text-center bg-emerald-200/60">{closeRate}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Phase 2: Entry Form Modal — wrap form nhập trong overlay
// ============================================================================
function EntryFormModal({ children, onClose, headerRight, title = 'Nhập dữ liệu', color = 'emerald' }: {
  children: React.ReactNode;
  onClose: () => void;
  headerRight?: React.ReactNode;
  title?: string;
  color?: 'emerald' | 'amber';
}) {
  const headerBg = color === 'amber'
    ? 'from-amber-500 to-orange-600'
    : 'from-emerald-600 to-teal-600';
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[94vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`px-5 py-3 bg-gradient-to-r ${headerBg} text-white flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-2">
            <Plus size={18} />
            <h2 className="text-base font-bold">{title}</h2>
          </div>
          <div className="flex items-center gap-3">
            {headerRight}
            <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5 bg-slate-50/40">
          {children}
        </div>
        <div className="px-5 py-2.5 border-t border-slate-200 bg-white flex items-center justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            Đóng (thay đổi đã lưu qua nút Lưu)
          </button>
        </div>
      </div>
    </div>
  );
}
