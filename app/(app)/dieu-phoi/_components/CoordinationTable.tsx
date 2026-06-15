'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Briefcase, UserCheck, Users, Activity, Clock, Calendar, CircleDot } from 'lucide-react';
import {
  COORD_STATUS_LABEL,
  COORD_STATUS_COLOR,
  DEPT_LABEL,
  type CoordTask,
  type Collaborator,
  type DeptId,
} from './types';

// ============================================================
// V4 SPEC — 12 cột, thay "Ưu tiên" → "Mức độ" (severity chip rose nếu khẩn)
// Tiến độ phối hợp: X/Y + progress bar emerald
// Đang chờ + Nội dung chờ: computeWaitingFor
// Loại chip 7 màu V4
// Filter: + select severity
// ============================================================

interface CoordinationTableProps {
  tasks: CoordTask[];
  onRowClick: (t: CoordTask) => void;
  currentUserUid: string;
}

type TabKey =
  | 'all'
  | 'mine'
  | 'sent'
  | 'cross'
  | 'waiting_resp'
  | 'waiting_appr'
  | 'overdue'
  | 'bottleneck';

const TAB_LABEL: Record<TabKey, string> = {
  all: 'Tất cả',
  mine: 'Tôi phụ trách',
  sent: 'Tôi giao',
  cross: 'Liên khối',
  waiting_resp: 'Chờ phản hồi',
  waiting_appr: 'Chờ duyệt',
  overdue: 'Quá hạn',
  bottleneck: 'Điểm nghẽn',
};

// ----- V4 helpers (inline, không phụ thuộc helper module mới) -----

/** V4: severity field optional — fallback priority high → khan_cap. */
function getSeverity(t: CoordTask): 'binh_thuong' | 'khan_cap' {
  const raw = (t as unknown as { severity?: string }).severity;
  if (raw === 'khan_cap' || raw === 'binh_thuong') return raw;
  return t.priority === 'high' ? 'khan_cap' : 'binh_thuong';
}

/** V4: Tiến độ phối hợp = số collab 'hoan_thanh' / tổng collab. */
function computeProgress(t: CoordTask): { done: number; total: number; pct: number } {
  const total = t.collaborators?.length ?? 0;
  if (total === 0) return { done: 0, total: 0, pct: 0 };
  const done = t.collaborators.filter((c: Collaborator) => c.status === 'hoan_thanh').length;
  const pct = Math.round((done / total) * 100);
  return { done, total, pct };
}

/**
 * V4: Đang chờ = lấy collab đầu tiên có status ∈ [chua_tiep_nhan, da_tiep_nhan, dang_thuc_hien].
 * Trả về { person, content }. Nếu không có → fallback waitingForPerson/Content của task.
 */
function computeWaitingFor(t: CoordTask): { person: string; content: string } {
  const active = (t.collaborators ?? []).find((c: Collaborator) =>
    c.status === 'chua_tiep_nhan' || c.status === 'da_tiep_nhan' || c.status === 'dang_thuc_hien',
  );
  if (active) {
    return {
      person: active.responsibleName || active.unitName || '—',
      content: active.supportContent || active.deliverable || '—',
    };
  }
  return {
    person: t.waitingForPerson || '—',
    content: t.waitingForContent || '—',
  };
}

function isPastDueISO(dueDate: string): boolean {
  if (!dueDate) return false;
  const due = new Date(`${dueDate}T23:59:59+07:00`).getTime();
  return Number.isFinite(due) && due < Date.now();
}

// V6.5 (2026-06-15) — FIX công thức filter tab theo audit (3 bug):
// 1. "sent" — đổi `createdByName + ownerUid!==uid` (lỏng) → `createdByUid===uid` (chuẩn)
//    Anh tạo task giao người khác = thuộc tab "Tôi giao", chứ KHÔNG phải mọi task có
//    createdByName + Owner khác mình.
// 2. "waiting_resp" — V3 `cho_phan_hoi` không tồn tại trong V4 → đổi định nghĩa
//    đúng nghĩa "chờ collab phản hồi": task có ≥1 collab status ∈
//    ['chua_tiep_nhan','gui_hoan_thanh','bi_tra_lai'] (đồng bộ KpiBar:141-145).
// 3. "waiting_appr" — V3 `cho_phe_duyet` → V4 `cho_duyet_ket_qua` (đồng bộ DetailDrawer).
function filterByTab(tasks: CoordTask[], tab: TabKey, uid: string) {
  switch (tab) {
    case 'all':          return tasks;
    case 'mine':         return tasks.filter((t) => t.ownerUid === uid);
    case 'sent':         return tasks.filter((t) => t.createdByUid === uid);
    case 'cross':        return tasks.filter((t) => t.scope === 'lien_khoi');
    case 'waiting_resp': return tasks.filter((t) =>
      t.collaborators.some((c) => {
        const s = c.status as string;
        return s === 'chua_tiep_nhan' || s === 'gui_hoan_thanh' || s === 'bi_tra_lai';
      }),
    );
    case 'waiting_appr': return tasks.filter((t) =>
      t.status === 'cho_duyet_ket_qua' || (t.status as string) === 'cho_phe_duyet', // V4 + fallback V3
    );
    case 'overdue':      return tasks.filter((t) => isPastDueISO(t.dueDate) && t.status !== 'hoan_thanh' && t.status !== 'dong_ho_so');
    case 'bottleneck':   return tasks.filter((t) => t.waitingForPerson && (Date.now() - new Date(t.waitingSince || t.createdAt).getTime()) > 24 * 3600_000);
  }
}

/** Khởi tạo từ tên ngắn cho avatar pastel. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Màu nền tròn avatar dựa trên tên (deterministic). */
function avatarColor(name: string): string {
  const palette = [
    'bg-emerald-100 text-emerald-700',
    'bg-sky-100 text-sky-700',
    'bg-violet-100 text-violet-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-teal-100 text-teal-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

/** YYYY-MM-DD → DD/MM/YYYY. */
function formatDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function isPastDue(dueDate: string): boolean {
  const due = new Date(`${dueDate}T23:59:59+07:00`).getTime();
  return Date.now() > due;
}

type SeverityFilter = 'all' | 'binh_thuong' | 'khan_cap';

export default function CoordinationTable({
  tasks,
  onRowClick,
  currentUserUid: _currentUserUid,
}: CoordinationTableProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  // Compute count cho từng tab từ tasks thật
  const tabKeys: TabKey[] = ['all', 'mine', 'sent', 'cross', 'waiting_resp', 'waiting_appr', 'overdue', 'bottleneck'];
  const counts = useMemo(() => {
    const out = {} as Record<TabKey, number>;
    for (const k of tabKeys) out[k] = filterByTab(tasks, k, _currentUserUid).length;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, _currentUserUid]);

  const filteredTasks = useMemo(() => {
    const byTab = filterByTab(tasks, activeTab, _currentUserUid);
    if (severityFilter === 'all') return byTab;
    return byTab.filter((t) => getSeverity(t) === severityFilter);
  }, [tasks, activeTab, _currentUserUid, severityFilter]);

  // V6.5 (2026-06-15) anh chốt SORT MẶC ĐỊNH:
  //   • Task hoàn thành toàn bộ (hoan_thanh / dong_ho_so) → XUỐNG CUỐI
  //   • Còn lại sort theo "thời gian còn lại" ASC (ít trước, ưu tiên xử lý gấp)
  //   • Task không có dueDate → cuối nhóm chưa hoàn thành (vì không gấp)
  //   • Cùng dueDate → createdAt ASC (task cũ trước)
  const sortedTasks = useMemo(() => {
    const isTerminal = (s: string) => s === 'hoan_thanh' || s === 'dong_ho_so';
    const dueMs = (d: string | undefined) => {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return Number.POSITIVE_INFINITY;
      return new Date(`${d}T23:59:59+07:00`).getTime();
    };
    return [...filteredTasks].sort((a, b) => {
      const aT = isTerminal(a.status);
      const bT = isTerminal(b.status);
      if (aT !== bT) return aT ? 1 : -1; // hoàn thành xuống cuối
      const diff = dueMs(a.dueDate) - dueMs(b.dueDate);
      if (diff !== 0) return diff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [filteredTasks]);

  const rows = sortedTasks.slice(0, 10);
  const totalCount = counts.all;

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white shadow-md ring-1 ring-slate-50 overflow-hidden">
      {/* Tabs row */}
      <div className="border-b border-slate-200 overflow-x-auto bg-gradient-to-b from-slate-50/60 to-white">
        <div className="flex items-center gap-1 px-2">
          {tabKeys.map((key) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={
                  'px-3.5 py-2.5 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors ' +
                  (isActive
                    ? 'border-emerald-500 text-emerald-700 font-bold'
                    : 'border-transparent text-slate-600 hover:text-slate-800 font-medium')
                }
              >
                {TAB_LABEL[key]} <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold tabular-nums">{counts[key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter row — V4: select Mức độ */}
      <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/40">
        <label className="text-xs text-slate-500 font-medium">Mức độ:</label>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
          className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="all">Tất cả</option>
          <option value="binh_thuong">Bình thường</option>
          <option value="khan_cap">Khẩn cấp</option>
        </select>
      </div>

      {/* Table — V6.5 (2026-06-15) anh chốt:
          • Bỏ cột checkbox + STT (#) — không có chức năng bulk action, gây nhiễu.
          • Header STICKY khi scroll (z-20 + shadow).
          • Mỗi cột có icon màu riêng → phân biệt nhanh, không cần background đậm. */}
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
            {/* V6.5 (2026-06-15) anh chốt: tăng diện tích cột "Công việc" để title dài
                hiện đủ. Nén nhẹ Chủ trì + Đang chờ (44→36) + Deadline (28→24) bù lại. */}
            <tr className="bg-gradient-to-b from-slate-50 to-white border-b-2 border-slate-200 text-[10px] uppercase tracking-wider text-slate-600">
              <th className="px-3 py-3 text-left font-semibold min-w-[280px]">
                <span className="inline-flex items-center gap-1.5"><Briefcase size={12} className="text-emerald-600" /> Công việc</span>
              </th>
              <th className="px-3 py-3 text-left font-semibold w-36">
                <span className="inline-flex items-center gap-1.5"><UserCheck size={12} className="text-sky-600" /> Chủ trì</span>
              </th>
              <th className="px-3 py-3 text-left font-semibold w-32">
                <span className="inline-flex items-center gap-1.5"><Users size={12} className="text-violet-600" /> Phối hợp</span>
              </th>
              <th className="px-3 py-3 text-left font-semibold w-36">
                <span className="inline-flex items-center gap-1.5"><Activity size={12} className="text-emerald-600" /> Tiến độ</span>
              </th>
              <th className="px-3 py-3 text-left font-semibold w-36">
                <span className="inline-flex items-center gap-1.5"><Clock size={12} className="text-amber-600" /> Đang chờ</span>
              </th>
              <th className="px-3 py-3 text-left font-semibold w-24">
                <span className="inline-flex items-center gap-1.5"><Calendar size={12} className="text-rose-600" /> Deadline</span>
              </th>
              <th className="px-3 py-3 text-left font-semibold w-28">
                <span className="inline-flex items-center gap-1.5"><CircleDot size={12} className="text-slate-500" /> Trạng thái</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const overdue = isPastDue(t.dueDate);
              const collabDisplay = t.collaboratorUnits
                .map((u) => DEPT_LABEL[u as DeptId] ?? u)
                .join(', ');
              const progress = computeProgress(t);
              const waiting = computeWaitingFor(t);
              return (
                <tr
                  key={t.id}
                  onClick={() => onRowClick(t)}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  {/* V6.5 (2026-06-15) anh chốt: bỏ cột checkbox + STT (#) — gây nhiễu, không có bulk action. */}
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-slate-800">{t.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      #{t.code}
                    </div>
                  </td>
                  {/* V6.4: Loại ẨN — xem ở Drawer khi click row */}
                  <td className="px-3 py-3 align-top">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          'inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold ' +
                          avatarColor(t.ownerName)
                        }
                      >
                        {initialsOf(t.ownerName)}
                      </span>
                      <span className="text-sm text-slate-700 truncate">
                        {t.ownerName}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className="text-sm text-slate-600">{collabDisplay}</span>
                  </td>
                  {/* V4: Tiến độ phối hợp X/Y + bar emerald + pct */}
                  <td className="px-3 py-3 align-top">
                    {progress.total === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-700 tabular-nums">
                            {progress.done}/{progress.total}
                          </span>
                          <span className="text-[10px] text-slate-500 tabular-nums">
                            {progress.pct}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${progress.pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                  {/* V4: Đang chờ — computeWaitingFor.person */}
                  <td className="px-3 py-3 align-top">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          'inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold ' +
                          avatarColor(waiting.person)
                        }
                      >
                        {initialsOf(waiting.person)}
                      </span>
                      <span className="text-sm text-slate-700 truncate">
                        {waiting.person}
                      </span>
                    </div>
                  </td>
                  {/* V6.4: Nội dung chờ ẨN — xem ở Drawer khi click row */}
                  <td
                    className={
                      'px-3 py-3 align-top text-sm tabular-nums ' +
                      (overdue ? 'text-rose-600 font-semibold' : 'text-slate-700')
                    }
                  >
                    {formatDate(t.dueDate)}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className={
                        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ' +
                        COORD_STATUS_COLOR[t.status]
                      }
                    >
                      {COORD_STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  {/* V6.4: Mức độ ẨN — xem ở Drawer khi click row */}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-sm text-slate-400"
                >
                  Chưa có công việc điều phối nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
        <div className="text-xs text-slate-500">
          Hiển thị {rows.length === 0 ? 0 : 1} - {rows.length} trong{' '}
          <span className="tabular-nums">{totalCount}</span> công việc
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="w-8 h-8 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100"
            aria-label="Trang trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {[1, 2, 3].map((p) => (
            <button
              key={p}
              type="button"
              className={
                'w-8 h-8 inline-flex items-center justify-center rounded text-sm tabular-nums ' +
                (p === 1
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-600 hover:bg-slate-100')
              }
            >
              {p}
            </button>
          ))}
          <span className="px-1 text-slate-400 text-sm">…</span>
          <button
            type="button"
            className="w-8 h-8 inline-flex items-center justify-center rounded text-sm text-slate-600 hover:bg-slate-100 tabular-nums"
          >
            24
          </button>
          <button
            type="button"
            className="w-8 h-8 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100"
            aria-label="Trang sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div>
          <select
            className="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            defaultValue="10"
          >
            <option value="10">10 / trang</option>
            <option value="20">20 / trang</option>
            <option value="50">50 / trang</option>
          </select>
        </div>
      </div>
    </div>
  );
}
