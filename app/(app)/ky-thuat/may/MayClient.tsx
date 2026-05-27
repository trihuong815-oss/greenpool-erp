'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Plus, Settings, Filter, Droplet, Flame, X, Save, Loader2, AlertCircle, CheckCircle2, Trash2, Edit3 } from 'lucide-react';
import { machinesApi, machineRunsApi, type MachineType, type CttSubArea } from '@/lib/services/ky-thuat/machines-api-client';

export interface MachineAgg {
  branchId: string;
  branchName: string;
  // total/byMonth: tổng giờ chạy
  // totalCapacity/byMonthCapacity: tổng công suất tích luỹ (standardCapacity × giờ). Đơn vị: kW × h = kWh cho cả lọc + nhiệt.
  loc:   { total: number; byMonth: number[]; totalCapacity: number; byMonthCapacity: number[] };
  nhiet: { total: number; byMonth: number[]; totalCapacity: number; byMonthCapacity: number[] };
}

export interface MachineSetup {
  id: string; branchId: string; name: string; type: MachineType;
  standardCapacity: number; capacityUnit: string; sortOrder: number; active: boolean;
  /** Chỉ CTT — bể máy thuộc về (indoor/outdoor/kid) */
  subArea?: CttSubArea | null;
}

const SUB_AREA_LABEL: Record<CttSubArea, string> = {
  indoor:  'Bể trong nhà',
  outdoor: 'Bể ngoài trời',
  kid:     'Bể vầy',
};

export interface RunRow {
  id: string; branchId: string; date: string; day: number;
  machineId: string; machineName: string; machineType: MachineType;
  hoursRun: number; notes?: string | null; updatedByName?: string;
  /** Công suất máy tại thời điểm tính tổng = standardCapacity của machine. */
  capacity: number;
  capacityUnit: string;
}

interface Props {
  year: number;
  branchId: string | null;
  month: number | null;
  branchName: string | null;
  agg: MachineAgg[];
  machines: MachineSetup[];
  detailRuns: RunRow[];
  canWriteThisBranch: boolean;
  canSetup: boolean;
}

const YEARS = [2024, 2025, 2026, 2027];
const MONTH_LABELS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
function fmt(v: number): string { return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 }); }

export function MayClient(props: Props) {
  const { year, branchId, month, branchName, agg, machines, detailRuns, canWriteThisBranch, canSetup } = props;
  const router = useRouter();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);

  function showToast(t: 'success' | 'error', msg: string) {
    setToast({ type: t, msg });
    setTimeout(() => setToast(null), 4000);
  }
  function changeYear(y: number) {
    const params = new URLSearchParams();
    params.set('year', String(y));
    if (branchId) params.set('branchId', branchId);
    if (month) params.set('month', String(month));
    router.push(`/ky-thuat/may?${params.toString()}`);
  }

  return (
    <div className="max-w-7xl mx-auto px-5 py-6">
      {/* Breadcrumb + filter + nút */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          {(branchId || month) && (
            <Link href="/ky-thuat/may" className="text-cyan-700 hover:underline inline-flex items-center gap-1">
              <ArrowLeft size={14} /> Tổng năm 5 cơ sở
            </Link>
          )}
          {branchId && !month && <ChevronRight size={14} className="text-slate-400" />}
          {branchId && <span className="font-semibold text-slate-800">{branchName} · 12 tháng</span>}
          {month && (
            <>
              <ChevronRight size={14} className="text-slate-400" />
              <Link href={`/ky-thuat/may?year=${year}&branchId=${branchId}`} className="text-cyan-700 hover:underline">← 12 tháng</Link>
              <ChevronRight size={14} className="text-slate-400" />
              <span className="font-semibold text-slate-800">Tháng {month}/{year}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex flex-col">
            <span className="text-[10px] uppercase font-semibold text-slate-500">Năm</span>
            <select value={year} onChange={(e) => changeYear(Number(e.target.value))}
              className="h-9 mt-0.5 rounded-lg border-2 border-cyan-200 bg-white px-2.5 text-sm outline-none focus:border-cyan-500">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {branchId && canSetup && (
            <button onClick={() => setSetupOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-white text-cyan-700 border-2 border-cyan-300 font-semibold rounded-lg hover:bg-cyan-50 transition">
              <Settings size={16} /> Setup máy
            </button>
          )}
          {branchId && month && canWriteThisBranch && (
            <button onClick={() => setEntryOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-teal-700 text-white font-semibold rounded-lg hover:shadow-md transition">
              <Plus size={16} /> Nhập giờ chạy
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div className={`mb-4 rounded-xl p-3 flex items-center gap-2 ${toast.type === 'success' ? 'border border-emerald-300 bg-emerald-50' : 'border border-rose-300 bg-rose-50'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="text-emerald-700" size={18} /> : <AlertCircle className="text-rose-700" size={18} />}
          <div className={`text-sm ${toast.type === 'success' ? 'text-emerald-900' : 'text-rose-900'}`}>{toast.msg}</div>
        </div>
      )}

      {/* Views */}
      {!branchId && !month && <YearView agg={agg} year={year} />}
      {branchId && !month && <BranchView agg={agg.find((a) => a.branchId === branchId)!} machines={machines} branchId={branchId} year={year} />}
      {branchId && month && (
        <MonthView
          machines={machines.filter((m) => m.active)}
          detailRuns={detailRuns}
          branchName={branchName!}
          month={month}
          year={year}
        />
      )}

      {setupOpen && branchId && canSetup && (
        <SetupMachineModal
          branchId={branchId} initialMachines={machines}
          onClose={(changed) => {
            setSetupOpen(false);
            if (changed) { showToast('success', 'Cập nhật setup máy'); router.refresh(); }
          }}
          onError={(m) => showToast('error', m)}
        />
      )}
      {entryOpen && branchId && month && canWriteThisBranch && (
        <RunEntryModal
          branchId={branchId} year={year} month={month}
          machines={machines.filter((m) => m.active)}
          existingByKey={Object.fromEntries(detailRuns.map((r) => [`${r.date}_${r.machineId}`, r.hoursRun]))}
          onClose={(saved) => {
            setEntryOpen(false);
            if (saved) { showToast('success', 'Lưu giờ chạy'); router.refresh(); }
          }}
          onError={(m) => showToast('error', m)}
        />
      )}
    </div>
  );
}

// ───────── YEAR VIEW ─────────
function YearView({ agg, year }: { agg: MachineAgg[]; year: number }) {
  const totalLoc = agg.reduce((s, a) => s + a.loc.total, 0);
  const totalNhiet = agg.reduce((s, a) => s + a.nhiet.total, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard icon={<Filter size={20} />} label={`Tổng giờ máy lọc ${year}`} value={`${fmt(totalLoc)} h`} accent="cyan" />
        <KpiCard icon={<Flame size={20} />} label={`Tổng giờ máy nhiệt ${year}`} value={`${fmt(totalNhiet)} h`} accent="rose" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <header className="px-4 py-3 bg-gradient-to-r from-cyan-50 to-teal-50 border-b border-cyan-100">
          <h3 className="text-sm font-bold text-cyan-900">Tổng năm {year} theo cơ sở</h3>
        </header>
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Cơ sở</th>
              <th className="px-3 py-2 text-right font-semibold text-cyan-800">Máy lọc (h)</th>
              <th className="px-3 py-2 text-right font-semibold text-rose-800">Máy nhiệt (h)</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {agg.map((a) => (
              <tr key={a.branchId} className="border-t border-slate-100 hover:bg-cyan-50/40">
                <td className="px-3 py-2.5 font-semibold text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex w-9 justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-700">{a.branchId}</span>
                    {a.branchName}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-cyan-700">{a.loc.total > 0 ? fmt(a.loc.total) : '—'}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-rose-700">{a.nhiet.total > 0 ? fmt(a.nhiet.total) : '—'}</td>
                <td className="px-3 py-2.5 text-right">
                  <Link href={`/ky-thuat/may?year=${year}&branchId=${a.branchId}`}
                    className="inline-flex items-center gap-0.5 text-cyan-700 hover:text-cyan-900 text-xs font-semibold">
                    Chi tiết <ChevronRight size={12} />
                  </Link>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-cyan-300 bg-gradient-to-r from-cyan-100 to-teal-50 font-bold text-cyan-900">
              <td className="px-3 py-2.5">Tổng hệ thống</td>
              <td className="px-3 py-2.5 text-right">{fmt(totalLoc)}</td>
              <td className="px-3 py-2.5 text-right">{fmt(totalNhiet)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────── BRANCH VIEW (12 tháng) ─────────
function BranchView({ agg, machines, branchId, year }: { agg: MachineAgg; machines: MachineSetup[]; branchId: string; year: number }) {
  const locMachines = machines.filter((m) => m.type === 'loc');
  const nhietMachines = machines.filter((m) => m.type === 'nhiet');
  // Unit suffix: nếu mọi máy cùng type share 1 đơn vị → hiện đơn vị; nếu trộn → để trống.
  const dominantUnit = (list: MachineSetup[]): string => {
    const units = new Set(list.map((m) => m.capacityUnit).filter(Boolean));
    return units.size === 1 ? [...units][0] : '';
  };
  const locUnit = dominantUnit(locMachines);
  const nhietUnit = dominantUnit(nhietMachines);
  // Đơn vị năng lượng: capacity(kW) × h = kWh. Helper xử lý case khác (m³/h cũ — backward compat).
  const energyUnit = (u: string) => {
    if (!u) return 'kWh';
    if (u.toLowerCase() === 'kw') return 'kWh';
    if (u.toLowerCase() === 'm³/h' || u.toLowerCase() === 'm3/h') return 'm³';
    if (u.endsWith('/h')) return u.slice(0, -2);
    return u + '·h';
  };
  const locEnergyUnit = energyUnit(locUnit);
  const nhietEnergyUnit = energyUnit(nhietUnit);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard icon={<Filter size={20} />} label="Máy lọc cả năm" value={`${fmt(agg.loc.total)} h`} accent="cyan"
          sub={`${locMachines.length} máy · ${fmt(agg.loc.totalCapacity)} ${locEnergyUnit}`} />
        <KpiCard icon={<Flame size={20} />} label="Máy nhiệt cả năm" value={`${fmt(agg.nhiet.total)} h`} accent="rose"
          sub={`${nhietMachines.length} máy · ${fmt(agg.nhiet.totalCapacity)} ${nhietEnergyUnit}`} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <header className="px-4 py-3 bg-gradient-to-r from-cyan-50 to-teal-50 border-b border-cyan-100">
          <h3 className="text-sm font-bold text-cyan-900">Chi tiết 12 tháng — {agg.branchName}</h3>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-semibold w-20">Tháng</th>
                <th className="px-3 py-2 text-right font-semibold text-cyan-800">Lọc (h)</th>
                <th className="px-3 py-2 text-right font-semibold text-cyan-800" title="Tổng công suất Lọc = Σ (công suất chuẩn × giờ chạy)">
                  Lọc tổng{locEnergyUnit ? ` (${locEnergyUnit})` : ''}
                </th>
                <th className="px-3 py-2 text-right font-semibold text-rose-800">Nhiệt (h)</th>
                <th className="px-3 py-2 text-right font-semibold text-rose-800" title="Tổng công suất Nhiệt = Σ (kW × giờ chạy)">
                  Nhiệt tổng{nhietEnergyUnit ? ` (${nhietEnergyUnit})` : ''}
                </th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => {
                const loc = agg.loc.byMonth[i];
                const locCap = agg.loc.byMonthCapacity[i] ?? 0;
                const nhiet = agg.nhiet.byMonth[i];
                const nhietCap = agg.nhiet.byMonthCapacity[i] ?? 0;
                const hasData = loc > 0 || nhiet > 0;
                return (
                  <tr key={i} className="border-t border-slate-100 hover:bg-cyan-50/40">
                    <td className="px-3 py-2 font-semibold text-slate-800">{MONTH_LABELS[i]}</td>
                    <td className="px-3 py-2 text-right text-cyan-700 font-semibold">{loc > 0 ? fmt(loc) : '—'}</td>
                    <td className="px-3 py-2 text-right text-cyan-600">{locCap > 0 ? fmt(locCap) : '—'}</td>
                    <td className="px-3 py-2 text-right text-rose-700 font-semibold">{nhiet > 0 ? fmt(nhiet) : '—'}</td>
                    <td className="px-3 py-2 text-right text-rose-600">{nhietCap > 0 ? fmt(nhietCap) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/ky-thuat/may?year=${year}&branchId=${branchId}&month=${i + 1}`}
                        className="inline-flex items-center gap-0.5 text-cyan-700 hover:text-cyan-900 text-xs font-semibold">
                        {hasData ? 'Entries' : 'Nhập'} <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-cyan-300 bg-gradient-to-r from-cyan-100 to-teal-50 font-bold text-cyan-900">
                <td className="px-3 py-2.5">Tổng năm</td>
                <td className="px-3 py-2.5 text-right">{fmt(agg.loc.total)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(agg.loc.totalCapacity)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(agg.nhiet.total)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(agg.nhiet.totalCapacity)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* List máy đã setup */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <header className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Danh sách máy cơ sở</h3>
          <span className="text-[11px] text-slate-500">{machines.length} máy ({locMachines.length} lọc + {nhietMachines.length} nhiệt)</span>
        </header>
        {machines.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            Chưa có máy nào. TP/PP cấp bấm <strong>Setup máy</strong> để thêm.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            {([
              { t: 'loc' as MachineType,   label: 'Máy lọc',   Icon: Filter },
              { t: 'nhiet' as MachineType, label: 'Máy nhiệt', Icon: Flame },
            ]).map(({ t, label, Icon }) => {
              const list = machines.filter((m) => m.type === t);
              return (
                <div key={t} className="p-3">
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <Icon size={14} className={t === 'loc' ? 'text-cyan-600' : 'text-rose-600'} />
                    {label} ({list.length})
                  </div>
                  {list.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">Chưa có máy {label.toLowerCase()}</div>
                  ) : (
                    <ul className="space-y-1">
                      {list.map((m) => (
                        <li key={m.id} className={`px-2 py-1.5 rounded ${m.active ? 'bg-white border border-slate-200' : 'bg-slate-50 border border-dashed border-slate-300 opacity-60'} text-sm flex items-center justify-between gap-2`}>
                          <span className="font-medium text-slate-800 truncate">{m.name}</span>
                          <span className="text-xs text-slate-500 tabular-nums shrink-0">
                            {m.standardCapacity > 0 ? `${fmt(m.standardCapacity)} ${m.capacityUnit}` : '—'}
                            {!m.active && <span className="ml-1 text-rose-600">(đã tắt)</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────── MONTH VIEW (entries chi tiết) ─────────
function MonthView({
  machines, detailRuns, branchName, month, year,
}: {
  machines: MachineSetup[];
  detailRuns: RunRow[];
  branchName: string;
  month: number;
  year: number;
}) {
  // Group: by date
  const byDate = new Map<string, RunRow[]>();
  for (const r of detailRuns) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <header className="px-4 py-3 bg-gradient-to-r from-cyan-50 to-teal-50 border-b border-cyan-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-cyan-900">Giờ chạy T{month}/{year} — {branchName}</h3>
          <span className="text-[11px] text-slate-500">{detailRuns.length} entries · {dates.length} ngày · {machines.length} máy active</span>
        </header>
        {detailRuns.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            Chưa có entry. Bấm <strong>+ Nhập giờ chạy</strong> để bắt đầu.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dates.map((date) => {
              const runs = byDate.get(date)!;
              const locRuns = runs.filter((r) => r.machineType === 'loc');
              const nhietRuns = runs.filter((r) => r.machineType === 'nhiet');
              const totalLoc = locRuns.reduce((s, r) => s + r.hoursRun, 0);
              const totalNhiet = nhietRuns.reduce((s, r) => s + r.hoursRun, 0);
              const totalLocCap = locRuns.reduce((s, r) => s + r.capacity * r.hoursRun, 0);
              const totalNhietCap = nhietRuns.reduce((s, r) => s + r.capacity * r.hoursRun, 0);
              return (
                <div key={date} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="font-semibold text-slate-800 text-sm">
                      Ngày {date.slice(8)}/{date.slice(5, 7)}/{date.slice(0, 4)}
                      <span className="ml-2 text-[11px] font-normal text-slate-500">
                        {totalLoc > 0 && <>· Lọc {fmt(totalLoc)} h{totalLocCap > 0 ? ` (≈ ${fmt(totalLocCap)})` : ''}</>}
                        {totalNhiet > 0 && <> · Nhiệt {fmt(totalNhiet)} h{totalNhietCap > 0 ? ` (≈ ${fmt(totalNhietCap)} kWh)` : ''}</>}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">{runs.length} máy</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {runs.map((r) => {
                      const isLoc = r.machineType === 'loc';
                      const energy = r.capacity * r.hoursRun;
                      // Cả lọc + nhiệt đều đo kW → kWh. Backward compat m³/h cho data cũ.
                      const u = (r.capacityUnit ?? '').toLowerCase();
                      const energyUnit = u === 'm³/h' || u === 'm3/h' ? 'm³' : 'kWh';
                      return (
                        <div key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg ring-1 ${isLoc ? 'bg-cyan-50 ring-cyan-200' : 'bg-rose-50 ring-rose-200'}`}>
                          {isLoc ? <Filter size={13} className="text-cyan-700" /> : <Flame size={13} className="text-rose-700" />}
                          <span className="text-sm font-medium text-slate-800 truncate">{r.machineName}</span>
                          <span className={`ml-auto font-bold tabular-nums text-sm ${isLoc ? 'text-cyan-700' : 'text-rose-700'}`}>{fmt(r.hoursRun)} h</span>
                          {energy > 0 && (
                            <span className={`text-[10px] tabular-nums shrink-0 ${isLoc ? 'text-cyan-600' : 'text-rose-600'}`}
                              title={`Công suất chuẩn ${fmt(r.capacity)} ${r.capacityUnit} × ${fmt(r.hoursRun)} h`}>
                              ≈ {fmt(energy)}{energyUnit ? ` ${energyUnit}` : ''}
                            </span>
                          )}
                          {r.notes && <span className="text-[10px] text-slate-500 italic max-w-[100px] truncate" title={r.notes}>{r.notes}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────── SETUP MACHINE MODAL ─────────
function SetupMachineModal({
  branchId, initialMachines, onClose, onError,
}: {
  branchId: string;
  initialMachines: MachineSetup[];
  onClose: (changed: boolean) => void;
  onError: (msg: string) => void;
}) {
  const [machines, setMachines] = useState<MachineSetup[]>(initialMachines);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);

  // Add new
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<MachineType>('loc');
  const [newCap, setNewCap] = useState('');
  const [newUnit, setNewUnit] = useState('kW');
  const [newSubArea, setNewSubArea] = useState<CttSubArea | ''>('');
  const isCtt = branchId === 'CTT';

  async function handleAdd() {
    if (!newName.trim()) return;
    if (isCtt && !newSubArea) { onError('CTT bắt buộc chọn bể'); return; }
    if (isCtt && newSubArea === 'outdoor' && newType !== 'loc') {
      onError('Bể ngoài trời chỉ có máy lọc'); return;
    }
    setSaving(true);
    try {
      const cap = Number(newCap) || 0;
      const sortOrder = (machines.filter((m) => m.type === newType).at(-1)?.sortOrder ?? 0) + 1;
      const { id } = await machinesApi.create({
        branchId, name: newName.trim(), type: newType,
        standardCapacity: cap, capacityUnit: newUnit, sortOrder,
        subArea: isCtt ? (newSubArea as CttSubArea) : undefined,
      });
      setMachines((arr) => [...arr, {
        id, branchId, name: newName.trim(), type: newType,
        standardCapacity: cap, capacityUnit: newUnit, sortOrder, active: true,
        subArea: isCtt ? (newSubArea as CttSubArea) : null,
      }]);
      setNewName(''); setNewCap(''); setNewSubArea(''); setAdding(false);
      setChanged(true);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function handleUpdate(id: string, patch: Partial<MachineSetup>) {
    setSaving(true);
    try {
      await machinesApi.update(id, patch);
      setMachines((arr) => arr.map((m) => m.id === id ? { ...m, ...patch } : m));
      setChanged(true);
    } catch (e: any) {
      onError(e.message);
    } finally { setSaving(false); }
  }
  async function handleRemove(id: string) {
    if (!confirm('Xoá máy này? (giờ chạy đã ghi nhận vẫn được giữ)')) return;
    setSaving(true);
    try {
      await machinesApi.remove(id);
      setMachines((arr) => arr.filter((m) => m.id !== id));
      setChanged(true);
    } catch (e: any) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3" onClick={() => onClose(changed)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 bg-gradient-to-r from-cyan-600 to-teal-600 text-white flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2"><Settings size={18} /> Setup máy — cơ sở {branchId}</h2>
          <button onClick={() => onClose(changed)} className="text-white/80 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-3 bg-slate-50/40">
          {(['loc', 'nhiet'] as const).map((t) => {
            const list = machines.filter((m) => m.type === t).sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <div key={t} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    {t === 'loc' ? <Filter size={14} className="text-cyan-600" /> : <Flame size={14} className="text-rose-600" />}
                    {t === 'loc' ? 'Máy lọc' : 'Máy nhiệt'} ({list.length})
                  </div>
                </div>
                {list.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-400 italic">Chưa có máy {t === 'loc' ? 'lọc' : 'nhiệt'}</div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {list.map((m) => (
                        <tr key={m.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-xs text-slate-400 tabular-nums w-8">#{m.sortOrder}</td>
                          <td className="px-2 py-1.5">
                            <input value={m.name} onChange={(e) => setMachines((arr) => arr.map((x) => x.id === m.id ? { ...x, name: e.target.value } : x))}
                              onBlur={() => handleUpdate(m.id, { name: m.name })}
                              className="w-full px-2 py-1 text-sm border border-transparent hover:border-slate-300 focus:border-cyan-400 rounded outline-none bg-transparent" />
                          </td>
                          {isCtt && (
                            <td className="px-2 py-1.5 w-36">
                              <select
                                value={m.subArea ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value as CttSubArea | '';
                                  setMachines((arr) => arr.map((x) => x.id === m.id ? { ...x, subArea: v || null } : x));
                                  handleUpdate(m.id, { subArea: v || null });
                                }}
                                className="w-full px-1.5 py-1 text-xs border border-slate-200 rounded bg-white"
                              >
                                <option value="">— Bể —</option>
                                <option value="indoor">Trong nhà</option>
                                <option value="outdoor">Ngoài trời</option>
                                <option value="kid">Bể vầy</option>
                              </select>
                            </td>
                          )}
                          <td className="px-2 py-1.5 w-44">
                            <div className="flex items-center gap-1">
                              <input type="number" min={0} step="0.1" value={m.standardCapacity}
                                onChange={(e) => setMachines((arr) => arr.map((x) => x.id === m.id ? { ...x, standardCapacity: Number(e.target.value) || 0 } : x))}
                                onBlur={() => handleUpdate(m.id, { standardCapacity: m.standardCapacity })}
                                className="w-20 px-2 py-1 text-right text-sm border border-slate-200 rounded tabular-nums" />
                              <input value={m.capacityUnit} onChange={(e) => setMachines((arr) => arr.map((x) => x.id === m.id ? { ...x, capacityUnit: e.target.value } : x))}
                                onBlur={() => handleUpdate(m.id, { capacityUnit: m.capacityUnit })}
                                className="w-20 px-1 py-1 text-xs border border-slate-200 rounded" placeholder="kW" />
                            </div>
                          </td>
                          <td className="px-2 py-1.5 w-24 text-center">
                            <button onClick={() => handleUpdate(m.id, { active: !m.active })}
                              className={`text-[10px] px-2 py-0.5 rounded ${m.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                              {m.active ? 'Bật' : 'Tắt'}
                            </button>
                          </td>
                          <td className="px-2 py-1.5 w-10">
                            <button onClick={() => handleRemove(m.id)} disabled={saving}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded disabled:opacity-50"
                              title="Xoá máy">
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

          {adding ? (
            <div className="rounded-lg border-2 border-dashed border-cyan-300 bg-cyan-50/40 p-3 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-cyan-800">Thêm máy mới</div>
              <div className="grid grid-cols-2 gap-2">
                <select value={newType} onChange={(e) => { setNewType(e.target.value as MachineType); setNewUnit('kW'); }} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="loc">Máy lọc</option>
                  <option value="nhiet">Máy nhiệt</option>
                </select>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên máy (vd: Máy lọc số 1)"
                  className="px-2 py-1.5 text-sm border border-slate-300 rounded" autoFocus />
                <div className="flex items-center gap-1 col-span-2">
                  <input type="number" min={0} step="0.1" value={newCap} onChange={(e) => setNewCap(e.target.value)} placeholder="Công suất"
                    className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded text-right tabular-nums" />
                  <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="Đơn vị"
                    className="w-24 px-2 py-1.5 text-sm border border-slate-300 rounded" />
                </div>
                {isCtt && (
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Bể (bắt buộc)</label>
                    <select value={newSubArea} onChange={(e) => setNewSubArea(e.target.value as CttSubArea | '')}
                      className="w-full mt-1 px-2 py-1.5 text-sm border border-slate-300 rounded">
                      <option value="">— Chọn bể —</option>
                      <option value="indoor">Bể trong nhà</option>
                      <option value="outdoor">Bể ngoài trời (chỉ máy lọc)</option>
                      <option value="kid">Bể vầy</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => { setAdding(false); setNewName(''); setNewCap(''); setNewSubArea(''); }} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded">Huỷ</button>
                <button onClick={handleAdd} disabled={!newName.trim() || saving} className="px-3 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-700 rounded disabled:opacity-50">
                  {saving ? 'Đang lưu...' : 'Thêm'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="w-full px-3 py-2 text-sm text-cyan-700 border-2 border-dashed border-cyan-300 hover:bg-cyan-50 rounded-lg font-semibold">
              + Thêm máy mới
            </button>
          )}
        </div>
        <div className="px-5 py-2.5 border-t border-slate-200 bg-white flex items-center justify-end">
          <button onClick={() => onClose(changed)} className="px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ───────── RUN ENTRY MODAL ─────────
function RunEntryModal({
  branchId, year: defaultYear, month: defaultMonth, machines, existingByKey, onClose, onError,
}: {
  branchId: string;
  year: number;
  month: number;
  machines: MachineSetup[];
  existingByKey: Record<string, number>;
  onClose: (saved: boolean) => void;
  onError: (msg: string) => void;
}) {
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const daysInMonth = new Date(year, month, 0).getDate();
  const [day, setDay] = useState(Math.min(new Date().getDate(), daysInMonth));
  // Cap day khi đổi năm/tháng làm số ngày giảm
  useEffect(() => {
    if (day > daysInMonth) setDay(daysInMonth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);
  const date = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}`;

  // existing data: tháng default → dùng `existingByKey` từ parent.
  // tháng khác → fetch qua API + cache theo (year, month).
  const initialKey = `${defaultYear}_${defaultMonth}`;
  const [cache, setCache] = useState<Record<string, Record<string, number>>>({ [initialKey]: existingByKey });
  const currentKey = `${year}_${month}`;
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    if (cache[currentKey]) return; // đã có
    let cancelled = false;
    setLoadingExisting(true);
    machineRunsApi.list({ year, branchId, month })
      .then((runs) => {
        if (cancelled) return;
        const key: Record<string, number> = {};
        for (const r of runs) key[`${r.date}_${r.machineId}`] = r.hoursRun;
        setCache((c) => ({ ...c, [currentKey]: key }));
      })
      .catch((e: any) => { if (!cancelled) onError(e.message ?? 'Lỗi tải dữ liệu tháng cũ'); })
      .finally(() => { if (!cancelled) setLoadingExisting(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  const currentExisting = cache[currentKey] ?? {};
  const [rows, setRows] = useState<Record<string, number>>({});
  // Khi đổi day/year/month + cache đã sẵn sàng → đồng bộ rows với existing của ngày đó
  useEffect(() => {
    const newRows: Record<string, number> = {};
    for (const m of machines) newRows[m.id] = currentExisting[`${date}_${m.id}`] ?? 0;
    setRows(newRows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, currentKey, machines.length]);

  const [saving, setSaving] = useState(false);

  const locMachines = machines.filter((m) => m.type === 'loc');
  const nhietMachines = machines.filter((m) => m.type === 'nhiet');

  async function handleSave() {
    setSaving(true);
    try {
      const entries = machines.map((m) => ({
        branchId, date, machineId: m.id, machineName: m.name, machineType: m.type,
        hoursRun: Math.max(0, Math.min(24, Number(rows[m.id] ?? 0))),
      }));
      await machineRunsApi.bulkUpsert(entries);
      onClose(true);
    } catch (e: any) {
      onError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3" onClick={() => onClose(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 bg-gradient-to-r from-cyan-600 to-teal-600 text-white flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2"><Plus size={18} /> Nhập giờ chạy máy — ngày {Math.min(day, daysInMonth)}/{month}/{year}</h2>
          <button onClick={() => onClose(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-3 bg-slate-50/40">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="font-semibold text-slate-700">Ngày nhập:</span>
            <select value={day} onChange={(e) => setDay(Number(e.target.value))}
              className="px-2 py-1.5 border-2 border-cyan-200 rounded font-semibold focus:border-cyan-500 outline-none">
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Ngày {d}</option>)}
            </select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="px-2 py-1.5 border-2 border-cyan-200 rounded font-semibold focus:border-cyan-500 outline-none">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="px-2 py-1.5 border-2 border-cyan-200 rounded font-semibold focus:border-cyan-500 outline-none">
              {YEARS.map((y) => <option key={y} value={y}>Năm {y}</option>)}
            </select>
            {loadingExisting ? (
              <span className="inline-flex items-center gap-1 text-xs text-cyan-700"><Loader2 size={12} className="animate-spin" /> Đang tải dữ liệu tháng này…</span>
            ) : (
              <span className="text-xs text-slate-500">— Đổi tháng để nhập bù dữ liệu lịch sử (giờ hiện có sẽ auto-fill)</span>
            )}
          </div>

          {/* Bảng 1: Máy lọc */}
          <RunTable title="Máy lọc" icon={<Filter size={14} className="text-cyan-600" />} machines={locMachines} rows={rows} setRows={setRows} accent="cyan" />
          {/* Bảng 2: Máy nhiệt */}
          <RunTable title="Máy nhiệt" icon={<Flame size={14} className="text-rose-600" />} machines={nhietMachines} rows={rows} setRows={setRows} accent="rose" />

          {machines.length === 0 && (
            <div className="text-center py-6 text-sm text-slate-500">
              Cơ sở chưa có máy nào. <em>Bấm "Setup máy" ở header (TP/PP cấp) để thêm.</em>
            </div>
          )}
        </div>
        <div className="px-5 py-2.5 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500">
            <strong>Lưu ý:</strong> Mỗi máy 0-24h/ngày. Để 0 → entry đó bị xoá.
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onClose(false)} disabled={saving} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50">Huỷ</button>
            <button onClick={handleSave} disabled={saving || machines.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-teal-700 rounded-lg shadow-sm hover:shadow-md disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Đang lưu...' : 'Lưu giờ chạy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RunTable({
  title, icon, machines, rows, setRows, accent,
}: {
  title: string;
  icon: React.ReactNode;
  machines: MachineSetup[];
  rows: Record<string, number>;
  setRows: (fn: (r: Record<string, number>) => Record<string, number>) => void;
  accent: 'cyan' | 'rose';
}) {
  if (machines.length === 0) return null;
  const headerBg = accent === 'cyan' ? 'bg-cyan-50' : 'bg-rose-50';
  const headerText = accent === 'cyan' ? 'text-cyan-900' : 'text-rose-900';
  const total = machines.reduce((s, m) => s + (Number(rows[m.id]) || 0), 0);
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className={`${headerBg} px-3 py-2 border-b border-slate-200 flex items-center justify-between`}>
        <div className={`text-xs font-bold uppercase tracking-wider ${headerText} flex items-center gap-2`}>
          {icon} {title} ({machines.length} máy)
        </div>
        <div className="text-xs font-semibold tabular-nums text-slate-700">Tổng: {total.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} h</div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-700">
          <tr>
            <th className="px-3 py-2 text-left font-semibold w-12">#</th>
            <th className="px-3 py-2 text-left font-semibold">Máy</th>
            <th className="px-3 py-2 text-right font-semibold w-44">Công suất</th>
            <th className="px-3 py-2 text-center font-semibold w-32">Giờ chạy (h)</th>
          </tr>
        </thead>
        <tbody>
          {machines.map((m, i) => (
            <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50/40">
              <td className="px-3 py-2 text-slate-400 tabular-nums">{i + 1}</td>
              <td className="px-3 py-2 font-medium text-slate-800">{m.name}</td>
              <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{m.standardCapacity > 0 ? `${m.standardCapacity.toLocaleString('vi-VN')} ${m.capacityUnit}` : '—'}</td>
              <td className="px-1 py-1">
                <input type="number" min={0} max={24} step="0.5" inputMode="decimal"
                  value={rows[m.id] ?? 0}
                  onChange={(e) => setRows((r) => ({ ...r, [m.id]: Math.max(0, Math.min(24, Number(e.target.value) || 0)) }))}
                  className="w-full px-2 py-1 text-right text-sm border-0 tabular-nums focus:ring-2 focus:ring-cyan-400 rounded font-semibold text-cyan-700" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────── shared ─────────
function KpiCard({ icon, label, value, accent, sub }: { icon: React.ReactNode; label: string; value: string; accent: 'cyan' | 'rose'; sub?: string }) {
  const cls = accent === 'cyan' ? 'bg-cyan-50 text-cyan-800 ring-cyan-200' : 'bg-rose-50 text-rose-800 ring-rose-200';
  return (
    <div className={`rounded-xl ring-1 px-4 py-3 ${cls} flex items-center gap-3`}>
      <div className="rounded-lg bg-white/60 p-2">{icon}</div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
        <div className="text-2xl font-bold tabular-nums mt-0.5">{value}</div>
        {sub && <div className="text-[11px] opacity-70 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
