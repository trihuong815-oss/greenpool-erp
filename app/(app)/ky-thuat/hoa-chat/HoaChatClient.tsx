'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Plus, ArrowLeft, FlaskConical, Droplet, Trash2, Loader2, X, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { chemicalsApi, type ChemicalType, type CttSubArea } from '@/lib/services/ky-thuat/chemicals-api-client';

export interface ChemAgg {
  branchId: string;
  branchName: string;
  clo:  { total: number; byMonth: number[]; entryCount: number };
  axit: { total: number; byMonth: number[]; entryCount: number };
}

interface DetailEntry {
  id: string;
  date: string;
  day: number;
  type: ChemicalType;
  amount: number;
  subArea: CttSubArea | null;
  batch?: string | null;
  notes?: string | null;
  addedBy?: string;
  addedByName?: string;
  addedAt?: string;
}

interface Props {
  year: number;
  branchId: string | null;
  month: number | null;
  branchName: string | null;
  agg: ChemAgg[];
  detailEntries: DetailEntry[];
  writableBranches: string[];
  currentUserId: string;
  /** KT_XLN_CTT: bể phụ trách (Thân=['indoor'], Quân=['outdoor','kid']). Empty cho user khác. */
  userSubAreas: string[];
}

const SUB_AREA_LABEL: Record<CttSubArea, string> = {
  indoor:  'Bể trong nhà',
  outdoor: 'Bể ngoài trời',
  kid:     'Bể vầy',
};

const YEARS = [2024, 2025, 2026, 2027];
const MONTH_LABELS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];

function fmt(v: number): string {
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

const UNIT: Record<ChemicalType, string> = { clo: 'kg', axit: 'lít' };
const TYPE_COLOR: Record<ChemicalType, { bg: string; text: string; ring: string; icon: typeof FlaskConical }> = {
  clo:  { bg: 'bg-emerald-50',  text: 'text-emerald-800',  ring: 'ring-emerald-200', icon: FlaskConical },
  axit: { bg: 'bg-amber-50',    text: 'text-amber-800',    ring: 'ring-amber-200',    icon: Droplet },
};

export function HoaChatClient(props: Props) {
  const { year, branchId, month, branchName, agg, detailEntries, writableBranches, userSubAreas } = props;
  const router = useRouter();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function showToast(t: 'success' | 'error', msg: string) {
    setToast({ type: t, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleDelete(id: string) {
    if (!confirm('Xoá entry này? (data đã lưu — không thể undo)')) return;
    setDeletingId(id);
    try {
      await chemicalsApi.remove(id);
      showToast('success', 'Đã xoá entry');
      router.refresh();
    } catch (e: any) {
      showToast('error', 'Lỗi xoá: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  }

  function changeYear(y: number) {
    const params = new URLSearchParams();
    params.set('year', String(y));
    if (branchId) params.set('branchId', branchId);
    if (month) params.set('month', String(month));
    router.push(`/ky-thuat/hoa-chat?${params.toString()}`);
  }

  const canWriteAny = writableBranches.length > 0;
  const canWriteThisBranch = branchId ? writableBranches.includes(branchId) : false;

  return (
    <div className="max-w-7xl mx-auto px-5 py-6">
      {/* Header: breadcrumb + filter year + nút nhập */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          {(branchId || month) && (
            <Link href="/ky-thuat/hoa-chat" className="text-cyan-700 hover:underline inline-flex items-center gap-1">
              <ArrowLeft size={14} /> Tổng năm 5 cơ sở
            </Link>
          )}
          {branchId && !month && <ChevronRight size={14} className="text-slate-400" />}
          {branchId && (
            <span className="font-semibold text-slate-800">
              {branchName} · 12 tháng
            </span>
          )}
          {month && (
            <>
              <ChevronRight size={14} className="text-slate-400" />
              <Link
                href={`/ky-thuat/hoa-chat?year=${year}&branchId=${branchId}`}
                className="text-cyan-700 hover:underline"
              >
                ← 12 tháng
              </Link>
              <ChevronRight size={14} className="text-slate-400" />
              <span className="font-semibold text-slate-800">{branchName} · Tháng {month}/{year}</span>
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
          {canWriteAny && (
            <button
              onClick={() => setEntryOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-teal-700 text-white font-semibold rounded-lg hover:shadow-md transition"
              title="Nhập lượng clo/axit vừa xử lý"
            >
              <Plus size={16} /> Nhập hoá chất
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mb-4 rounded-xl p-3 flex items-center gap-2 ${toast.type === 'success' ? 'border border-emerald-300 bg-emerald-50' : 'border border-rose-300 bg-rose-50'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="text-emerald-700" size={18} /> : <AlertCircle className="text-rose-700" size={18} />}
          <div className={`text-sm ${toast.type === 'success' ? 'text-emerald-900' : 'text-rose-900'}`}>{toast.msg}</div>
        </div>
      )}

      {/* VIEW: Year (5 cơ sở) */}
      {!branchId && !month && <YearView agg={agg} year={year} />}

      {/* VIEW: Branch (12 tháng) */}
      {branchId && !month && <BranchView agg={agg.find((a) => a.branchId === branchId)!} branchId={branchId} year={year} />}

      {/* VIEW: Day (entries chi tiết) */}
      {branchId && month && (
        <DayView
          entries={detailEntries}
          branchId={branchId}
          branchName={branchName!}
          month={month}
          year={year}
          onDelete={handleDelete}
          deletingId={deletingId}
          canDelete={canWriteThisBranch}
          currentUserId={props.currentUserId}
        />
      )}

      {/* Modal nhập */}
      {entryOpen && (
        <EntryModal
          year={year}
          month={month ?? new Date().getMonth() + 1}
          defaultDay={new Date().getDate()}
          defaultBranchId={branchId ?? writableBranches[0]}
          writableBranches={writableBranches}
          userSubAreas={userSubAreas}
          onClose={(saved) => {
            setEntryOpen(false);
            if (saved) {
              showToast('success', 'Đã lưu entry');
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}

// ───────── YEAR VIEW ─────────
function YearView({ agg, year }: { agg: ChemAgg[]; year: number }) {
  const totalClo = agg.reduce((s, a) => s + a.clo.total, 0);
  const totalAxit = agg.reduce((s, a) => s + a.axit.total, 0);
  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard icon={<FlaskConical size={20} />} label={`Tổng Clo ${year}`} value={`${fmt(totalClo)} kg`} accent="emerald" />
        <KpiCard icon={<Droplet size={20} />} label={`Tổng Axit ${year}`} value={`${fmt(totalAxit)} lít`} accent="amber" />
      </div>
      {/* Table 5 cơ sở */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <header className="px-4 py-3 bg-gradient-to-r from-cyan-50 to-teal-50 border-b border-cyan-100">
          <h3 className="text-sm font-bold text-cyan-900">Tổng năm {year} theo cơ sở</h3>
        </header>
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Cơ sở</th>
              <th className="px-3 py-2 text-right font-semibold text-emerald-800">Clo (kg)</th>
              <th className="px-3 py-2 text-right font-semibold text-amber-800">Axit (lít)</th>
              <th className="px-3 py-2 text-center font-semibold w-24">Số entries</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {agg.map((a) => (
              <tr key={a.branchId} className="border-t border-slate-100 hover:bg-cyan-50/40 transition">
                <td className="px-3 py-2.5 font-semibold text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex w-9 justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-700">{a.branchId}</span>
                    {a.branchName}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">{a.clo.total > 0 ? fmt(a.clo.total) : '—'}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-amber-700">{a.axit.total > 0 ? fmt(a.axit.total) : '—'}</td>
                <td className="px-3 py-2.5 text-center text-slate-500">{a.clo.entryCount + a.axit.entryCount}</td>
                <td className="px-3 py-2.5 text-right">
                  <Link href={`/ky-thuat/hoa-chat?year=${year}&branchId=${a.branchId}`}
                    className="inline-flex items-center gap-0.5 text-cyan-700 hover:text-cyan-900 text-xs font-semibold">
                    Chi tiết <ChevronRight size={12} />
                  </Link>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-cyan-300 bg-gradient-to-r from-cyan-100 to-teal-50 font-bold text-cyan-900">
              <td className="px-3 py-2.5">Tổng hệ thống</td>
              <td className="px-3 py-2.5 text-right">{fmt(totalClo)}</td>
              <td className="px-3 py-2.5 text-right">{fmt(totalAxit)}</td>
              <td className="px-3 py-2.5 text-center">{agg.reduce((s, a) => s + a.clo.entryCount + a.axit.entryCount, 0)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────── BRANCH VIEW (12 tháng) ─────────
function BranchView({ agg, branchId, year }: { agg: ChemAgg; branchId: string; year: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard icon={<FlaskConical size={20} />} label="Clo cả năm" value={`${fmt(agg.clo.total)} kg`} accent="emerald" sub={`${agg.clo.entryCount} entries`} />
        <KpiCard icon={<Droplet size={20} />} label="Axit cả năm" value={`${fmt(agg.axit.total)} lít`} accent="amber" sub={`${agg.axit.entryCount} entries`} />
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
                <th className="px-3 py-2 text-right font-semibold text-emerald-800">Clo (kg)</th>
                <th className="px-3 py-2 text-right font-semibold text-amber-800">Axit (lít)</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => {
                const clo = agg.clo.byMonth[i];
                const axit = agg.axit.byMonth[i];
                const hasData = clo > 0 || axit > 0;
                return (
                  <tr key={i} className="border-t border-slate-100 hover:bg-cyan-50/40">
                    <td className="px-3 py-2 font-semibold text-slate-800">{MONTH_LABELS[i]}</td>
                    <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{clo > 0 ? fmt(clo) : '—'}</td>
                    <td className="px-3 py-2 text-right text-amber-700 font-semibold">{axit > 0 ? fmt(axit) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {hasData && (
                        <Link href={`/ky-thuat/hoa-chat?year=${year}&branchId=${branchId}&month=${i + 1}`}
                          className="inline-flex items-center gap-0.5 text-cyan-700 hover:text-cyan-900 text-xs font-semibold">
                          Entries <ChevronRight size={12} />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-cyan-300 bg-gradient-to-r from-cyan-100 to-teal-50 font-bold text-cyan-900">
                <td className="px-3 py-2.5">Tổng năm</td>
                <td className="px-3 py-2.5 text-right">{fmt(agg.clo.total)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(agg.axit.total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────── DAY VIEW (entries chi tiết) ─────────
function DayView({
  entries, branchName, month, year, onDelete, deletingId, canDelete, currentUserId,
}: {
  entries: DetailEntry[];
  branchId: string;
  branchName: string;
  month: number;
  year: number;
  onDelete: (id: string) => void;
  deletingId: string | null;
  canDelete: boolean;
  currentUserId: string;
}) {
  // Group by date
  const byDate = new Map<string, DetailEntry[]>();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  const dates = [...byDate.keys()].sort();
  const totalClo = entries.filter((e) => e.type === 'clo').reduce((s, e) => s + e.amount, 0);
  const totalAxit = entries.filter((e) => e.type === 'axit').reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard icon={<FlaskConical size={20} />} label={`Clo T${month}`} value={`${fmt(totalClo)} kg`} accent="emerald" sub={`${entries.filter((e) => e.type === 'clo').length} entries`} />
        <KpiCard icon={<Droplet size={20} />} label={`Axit T${month}`} value={`${fmt(totalAxit)} lít`} accent="amber" sub={`${entries.filter((e) => e.type === 'axit').length} entries`} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <header className="px-4 py-3 bg-gradient-to-r from-cyan-50 to-teal-50 border-b border-cyan-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-cyan-900">Entries T{month}/{year} — {branchName}</h3>
          <span className="text-[11px] text-slate-500">{entries.length} entries · {dates.length} ngày có hoạt động</span>
        </header>
        {entries.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            Chưa có entry nào tháng này. {canDelete && <span>Bấm <strong>+ Nhập hoá chất</strong> ở trên để thêm.</span>}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dates.map((date) => {
              const dayEntries = byDate.get(date)!;
              const dayClo = dayEntries.filter((e) => e.type === 'clo').reduce((s, e) => s + e.amount, 0);
              const dayAxit = dayEntries.filter((e) => e.type === 'axit').reduce((s, e) => s + e.amount, 0);
              return (
                <div key={date} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-slate-800 text-sm">
                      Ngày {date.slice(8)}/{date.slice(5, 7)}/{date.slice(0, 4)}
                      <span className="ml-2 text-[11px] font-normal text-slate-500">
                        {dayClo > 0 && <>· Clo {fmt(dayClo)} kg</>}
                        {dayAxit > 0 && <> · Axit {fmt(dayAxit)} lít</>}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">{dayEntries.length} cấp</div>
                  </div>
                  <div className="space-y-1.5">
                    {dayEntries.map((e, i) => {
                      const c = TYPE_COLOR[e.type];
                      const Icon = c.icon;
                      const canDeleteThis = canDelete || e.id; // (admin/owner check ở backend)
                      return (
                        <div key={e.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ring-1 ${c.bg} ${c.ring}`}>
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-white shrink-0">
                            <Icon size={13} className={c.text} />
                          </span>
                          <div className="text-[11px] text-slate-500 font-semibold w-12 shrink-0">Cấp {i + 1}</div>
                          <div className="flex-1 text-sm">
                            <span className={`font-bold ${c.text}`}>{fmt(e.amount)} {UNIT[e.type]}</span>
                            <span className="text-slate-500 ml-1 uppercase text-[10px] tracking-wider">{e.type}</span>
                            {e.subArea && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ring-1 bg-cyan-50 text-cyan-800 ring-cyan-200">
                                {SUB_AREA_LABEL[e.subArea]}
                              </span>
                            )}
                            {e.notes && <span className="ml-2 text-xs text-slate-500 italic">"{e.notes}"</span>}
                          </div>
                          <div className="text-[10px] text-slate-400 shrink-0 hidden md:block">
                            {e.addedByName || '—'}
                          </div>
                          {canDeleteThis && (
                            <button
                              onClick={() => onDelete(e.id)}
                              disabled={deletingId === e.id}
                              title="Xoá entry"
                              className="ml-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded disabled:opacity-50"
                            >
                              {deletingId === e.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            </button>
                          )}
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

// ───────── ENTRY MODAL ─────────
function EntryModal({
  year: defaultYear, month: defaultMonth, defaultDay, defaultBranchId, writableBranches, userSubAreas, onClose,
}: {
  year: number;
  month: number;
  defaultDay: number;
  defaultBranchId: string;
  writableBranches: string[];
  userSubAreas: string[];
  onClose: (saved: boolean) => void;
}) {
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [day, setDay] = useState(defaultDay);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [type, setType] = useState<ChemicalType>('clo');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  // Khi branch=CTT, user có sub_areas khoá thì auto-fill option đầu; user boss (sub_areas empty) tự chọn 3 option
  const cttSubAreaOptions: CttSubArea[] = (userSubAreas.length > 0
    ? userSubAreas.filter((s): s is CttSubArea => s === 'indoor' || s === 'outdoor' || s === 'kid')
    : ['indoor', 'outdoor', 'kid']);
  const [subArea, setSubArea] = useState<CttSubArea | ''>(cttSubAreaOptions[0] ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const requiresSubArea = branchId === 'CTT';
  // Khi đổi năm/tháng → cap day nếu vượt số ngày tháng mới
  const safeDay = Math.min(day, daysInMonth);
  if (safeDay !== day) setDay(safeDay);

  async function handleSave() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setError('Số lượng phải > 0'); return; }
    if (requiresSubArea && !subArea) { setError('CTT bắt buộc chọn bể'); return; }
    setSaving(true);
    setError(null);
    try {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
      await chemicalsApi.create({
        branchId, date, type, amount: amt,
        subArea: requiresSubArea ? (subArea as CttSubArea) : undefined,
        notes: notes.trim() || undefined,
      });
      onClose(true);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3" onClick={() => onClose(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 bg-gradient-to-r from-cyan-600 to-teal-600 text-white flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2"><FlaskConical size={18} /> Nhập hoá chất</h2>
          <button onClick={() => onClose(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3 bg-slate-50/40">
          <Field label="Cơ sở">
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={input}>
              {writableBranches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>

          <Field label="Ngày nhập" hint="Có thể chọn tháng cũ để nhập bù dữ liệu lịch sử">
            <div className="grid grid-cols-3 gap-2">
              <select value={day} onChange={(e) => setDay(Number(e.target.value))} className={input} aria-label="Ngày">
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Ngày {d}</option>)}
              </select>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={input} aria-label="Tháng">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
              </select>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={input} aria-label="Năm">
                {YEARS.map((y) => <option key={y} value={y}>Năm {y}</option>)}
              </select>
            </div>
          </Field>

          {requiresSubArea && (
            <Field label="Bể xử lý (bắt buộc cho CTT)">
              <div className="flex gap-2 flex-wrap">
                {cttSubAreaOptions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubArea(s)}
                    className={`flex-1 min-w-[110px] px-3 py-2 rounded-lg font-semibold text-sm border-2 transition ${
                      subArea === s
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-800'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {SUB_AREA_LABEL[s]}
                  </button>
                ))}
              </div>
              {userSubAreas.length === 1 && (
                <p className="text-[11px] text-slate-500 mt-1">Bạn chỉ được nhập bể này (theo phân công).</p>
              )}
            </Field>
          )}

          <Field label="Loại hoá chất">
            <div className="flex gap-2">
              {(['clo', 'axit'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 px-3 py-2 rounded-lg font-semibold text-sm border-2 transition ${
                    type === t
                      ? t === 'clo' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-amber-500 bg-amber-50 text-amber-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {t === 'clo' ? '🧪 Clo (kg)' : '💧 Axit (lít)'}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Lượng (${UNIT[type]})`} hint="Mỗi cấp xử lý là 1 entry — nhập nhiều entry/ngày nếu cần">
            <input
              type="number" min={0} step="0.1" inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              autoFocus
              className={`${input} text-right tabular-nums font-semibold text-lg`}
            />
          </Field>

          <Field label="Ghi chú (optional)">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="vd. xử lý sau khi pH lệch" className={input} />
          </Field>

          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 flex items-start gap-2">
              <AlertCircle size={14} className="text-rose-600 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={() => onClose(false)} disabled={saving} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50">Huỷ</button>
            <button
              onClick={handleSave}
              disabled={saving || !amount}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-teal-700 rounded-lg shadow-sm hover:shadow-md disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Đang lưu...' : 'Lưu entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────── shared bits ─────────
const input = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function KpiCard({ icon, label, value, accent, sub }: { icon: React.ReactNode; label: string; value: string; accent: 'emerald' | 'amber'; sub?: string }) {
  const cls = accent === 'emerald' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200';
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
