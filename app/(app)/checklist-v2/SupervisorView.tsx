'use client';

// View dành cho cấp trên (ADMIN/CEO/GD_KD/GD_VP/TP_KT):
// - List các submission gần đây (filter theo scope ở backend)
// - Click 1 row → mở modal xem detail run + tự động mark seen

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, AlertCircle, Loader2, Eye, X, Calendar, Building2, Clock as ClockIcon, User,
} from 'lucide-react';
import {
  SHIFT_LABEL_V2, ROLE_LABEL_V2,
  type ChecklistRole, type ChecklistShift,
} from '@/lib/checklist-v2/templates';

interface Notification {
  id: string;
  runId: string;
  role: ChecklistRole;
  shift: ChecklistShift;
  branchId: string | null;
  date: string;
  ownerId: string;
  ownerName: string;
  submittedAt: string;
  seenBy?: string[];
}

interface RunItem {
  id: string;
  label: string;
  ok: boolean;
  note: string;
}

interface Run {
  id: string;
  date: string;
  shift: ChecklistShift;
  role: ChecklistRole;
  branchId: string | null;
  ownerId: string;
  ownerName: string;
  templateId: string;
  items: RunItem[];
  status: 'draft' | 'submitted';
  submittedAt: string | null;
}

interface Props {
  myUid: string;
  myRoleLabel: string;
}

const ROLE_FILTER_OPTIONS: { value: 'all' | ChecklistRole; label: string }[] = [
  { value: 'all', label: 'Tất cả vai trò' },
  { value: 'QLCS', label: 'QLCS · 5 cơ sở' },
  { value: 'PP_HT', label: 'PP_HT · Hệ thống' },
  { value: 'PP_XLN', label: 'PP_XLN · Xử lý nước' },
];

export function SupervisorView({ myUid, myRoleLabel }: Props) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<7 | 14 | 30>(7);
  const [filterRole, setFilterRole] = useState<'all' | ChecklistRole>('all');
  const [filterUnseen, setFilterUnseen] = useState(false);
  const [scope, setScope] = useState<ChecklistRole[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/checklist-v2/notifications?days=${days}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json();
      setItems(Array.isArray(j.notifications) ? j.notifications : []);
      setScope(Array.isArray(j.scope) ? j.scope : []);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (filterRole !== 'all' && n.role !== filterRole) return false;
      if (filterUnseen && (n.seenBy ?? []).includes(myUid)) return false;
      return true;
    });
  }, [items, filterRole, filterUnseen, myUid]);

  const stats = useMemo(() => {
    const total = items.length;
    const unseen = items.filter((n) => !(n.seenBy ?? []).includes(myUid)).length;
    const byRole: Record<string, number> = {};
    for (const n of items) byRole[n.role] = (byRole[n.role] ?? 0) + 1;
    return { total, unseen, byRole };
  }, [items, myUid]);

  function markSeenLocal(notiId: string) {
    setItems((cur) => cur.map((n) => n.id === notiId ? { ...n, seenBy: [...(n.seenBy ?? []), myUid] } : n));
  }

  async function openDetail(noti: Notification) {
    setSelectedRunId(noti.runId);
    // Optimistic mark seen
    if (!(noti.seenBy ?? []).includes(myUid)) {
      markSeenLocal(noti.id);
      fetch(`/api/checklist-v2/notifications?id=${encodeURIComponent(noti.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seen: true }),
      }).catch(() => { /* ignore */ });
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header thông tin user */}
      <div className="card flex items-center gap-3 flex-wrap">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <Eye size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800">Giám sát Checklist vận hành</div>
          <div className="text-xs text-slate-500">
            Vai trò {myRoleLabel} · scope: {scope.length > 0 ? scope.map((r) => ROLE_LABEL_V2[r]).join(' · ') : '—'}
          </div>
        </div>
      </div>

      {/* Stats + filter */}
      <div className="card space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Tổng gửi" value={stats.total} cls="bg-slate-100 text-slate-700" />
          <Stat label="Chưa xem" value={stats.unseen} cls={stats.unseen > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'} />
          <Stat label="QLCS" value={stats.byRole.QLCS ?? 0} cls="bg-emerald-50 text-emerald-800" />
          <Stat label="KT (HT+XLN)" value={(stats.byRole.PP_HT ?? 0) + (stats.byRole.PP_XLN ?? 0)} cls="bg-cyan-50 text-cyan-800" />
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Khoảng thời gian:</div>
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d as 7 | 14 | 30)}
              className={`px-3 py-1 text-xs font-semibold rounded ring-1 transition ${
                days === d ? 'bg-emerald-50 text-emerald-800 ring-emerald-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {d} ngày
            </button>
          ))}
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider ml-2">Vai trò:</div>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as any)}
            className="text-xs rounded border border-slate-200 px-2 py-1"
          >
            {ROLE_FILTER_OPTIONS.filter((opt) => opt.value === 'all' || scope.includes(opt.value as ChecklistRole)).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <label className="text-xs text-slate-700 inline-flex items-center gap-1.5 ml-2 cursor-pointer">
            <input type="checkbox" checked={filterUnseen} onChange={(e) => setFilterUnseen(e.target.checked)} />
            Chỉ chưa xem
          </label>
        </div>
      </div>

      {/* List submissions */}
      {loading ? (
        <div className="card text-center py-12 text-slate-400">
          <Loader2 size={24} className="mx-auto animate-spin mb-2" />
          Đang tải…
        </div>
      ) : error ? (
        <div className="card text-center py-12 text-rose-600">
          <AlertCircle size={24} className="mx-auto mb-2" />
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">
          {items.length === 0
            ? <>Chưa có checklist nào trong {days} ngày qua.</>
            : <>Không có submission khớp filter.</>}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((n) => {
            const seen = (n.seenBy ?? []).includes(myUid);
            return (
              <li key={n.id}>
                <button
                  onClick={() => openDetail(n)}
                  className={`w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1 transition hover:shadow-sm ${
                    seen ? 'bg-white ring-slate-200' : 'bg-white ring-amber-300 shadow-sm'
                  }`}
                >
                  <span className={`shrink-0 inline-block w-2 h-2 rounded-full ${seen ? 'bg-slate-300' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0 grid grid-cols-12 items-center gap-2">
                    <div className="col-span-12 sm:col-span-4 min-w-0">
                      <div className="font-semibold text-slate-800 truncate text-sm">{n.ownerName}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {ROLE_LABEL_V2[n.role]}
                        {n.branchId ? ` · ${n.branchId}` : ''}
                      </div>
                    </div>
                    <div className="col-span-6 sm:col-span-3 text-xs text-slate-700">
                      {SHIFT_LABEL_V2[n.shift]}
                    </div>
                    <div className="col-span-6 sm:col-span-3 text-xs text-slate-500 tabular-nums">
                      {n.date}
                    </div>
                    <div className="col-span-12 sm:col-span-2 text-xs text-slate-400 sm:text-right tabular-nums">
                      {formatRelative(n.submittedAt)}
                    </div>
                  </div>
                  <Eye size={14} className="shrink-0 text-slate-400" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Detail modal */}
      {selectedRunId && (
        <RunDetailModal
          runId={selectedRunId}
          onClose={() => setSelectedRunId(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`p-2.5 rounded-lg ${cls}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-xl font-bold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function RunDetailModal({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/checklist-v2?id=${encodeURIComponent(runId)}`, { cache: 'no-store' });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? 'Lỗi tải');
        if (!cancelled) setRun(j.run);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Lỗi tải');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [runId]);

  const okCount = run?.items.filter((it) => it.ok).length ?? 0;
  const noteCount = run?.items.filter((it) => !it.ok && it.note.trim()).length ?? 0;

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 max-w-3xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
          <div className="font-bold text-slate-800">Chi tiết checklist</div>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <Loader2 size={24} className="mx-auto animate-spin mb-2" />
              Đang tải…
            </div>
          ) : error ? (
            <div className="text-center py-12 text-rose-600">
              <AlertCircle size={24} className="mx-auto mb-2" />
              {error}
            </div>
          ) : run ? (
            <>
              {/* Meta */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-slate-50 rounded-lg">
                <MetaItem icon={User} label="Người gửi" value={run.ownerName} />
                <MetaItem icon={Building2} label="Vai trò · Cơ sở" value={`${ROLE_LABEL_V2[run.role]}${run.branchId ? ` · ${run.branchId}` : ''}`} />
                <MetaItem icon={Calendar} label="Ngày · Ca" value={`${run.date} · ${SHIFT_LABEL_V2[run.shift]}`} />
                <MetaItem icon={ClockIcon} label="Đã gửi lúc" value={run.submittedAt ? formatDateTime(run.submittedAt) : '—'} />
              </div>

              {/* Summary */}
              <div className="flex items-center gap-3 text-xs mb-3">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  <CheckCircle2 size={12} /> {okCount} đảm bảo
                </span>
                {noteCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                    <AlertCircle size={12} /> {noteCount} có ghi chú
                  </span>
                )}
                <span className="text-slate-500">Tổng {run.items.length} mục</span>
              </div>

              {/* Items */}
              <ul className="space-y-2">
                {run.items.map((it) => {
                  const isOK = it.ok;
                  const hasNote = !it.ok && it.note.trim().length > 0;
                  return (
                    <li
                      key={it.id}
                      className={`rounded-lg p-3 ring-1 ${
                        isOK ? 'bg-emerald-50/40 ring-emerald-200' : hasNote ? 'bg-amber-50/40 ring-amber-200' : 'bg-slate-50 ring-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 h-5 w-5 shrink-0 rounded flex items-center justify-center text-white font-bold text-xs ${
                          isOK ? 'bg-emerald-600' : hasNote ? 'bg-amber-500' : 'bg-slate-300'
                        }`}>
                          {isOK ? '✓' : hasNote ? '!' : '·'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{it.label}</div>
                          {hasNote && (
                            <div className="mt-1.5 text-xs text-slate-700 whitespace-pre-wrap bg-white ring-1 ring-amber-200 rounded p-2">
                              {it.note}
                            </div>
                          )}
                        </div>
                        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          isOK ? 'bg-emerald-100 text-emerald-800' :
                          hasNote ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-200 text-slate-600'
                        }`}>
                          {isOK ? 'ĐẢM BẢO' : hasNote ? 'CÓ GHI CHÚ' : 'CHƯA'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetaItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 inline-flex items-center gap-1">
        <Icon size={11} /> {label}
      </div>
      <div className="text-sm font-semibold text-slate-800 truncate" title={value}>{value}</div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ`;
  const days = Math.floor(hrs / 24);
  return `${days} ngày`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const yyyy = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${hh}:${mm} ${D}/${M}/${yyyy}`;
}
