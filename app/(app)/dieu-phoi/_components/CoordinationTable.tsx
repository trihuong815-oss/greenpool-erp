'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  COORD_TYPE_LABEL,
  COORD_TYPE_COLOR,
  COORD_STATUS_LABEL,
  COORD_STATUS_COLOR,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  DEPT_LABEL,
  type CoordTask,
  type DeptId,
} from './types';

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

interface TabDef {
  key: TabKey;
  label: string;
  count: number;
}

const TABS: TabDef[] = [
  { key: 'all', label: 'Tất cả', count: 120 },
  { key: 'mine', label: 'Tôi phụ trách', count: 18 },
  { key: 'sent', label: 'Tôi giao', count: 32 },
  { key: 'cross', label: 'Liên khối', count: 12 },
  { key: 'waiting_resp', label: 'Chờ phản hồi', count: 5 },
  { key: 'waiting_appr', label: 'Chờ duyệt', count: 3 },
  { key: 'overdue', label: 'Quá hạn', count: 2 },
  { key: 'bottleneck', label: 'Điểm nghẽn', count: 9 },
];

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

/** Hôm nay theo timezone +07. So sánh với dueDate. */
function isPastDue(dueDate: string): boolean {
  const due = new Date(`${dueDate}T23:59:59+07:00`).getTime();
  return Date.now() > due;
}

export default function CoordinationTable({
  tasks,
  onRowClick,
  currentUserUid: _currentUserUid,
}: CoordinationTableProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('waiting_appr');

  const rows = useMemo(() => tasks.slice(0, 5), [tasks]);

  const totalCount = TABS.find((t) => t.key === 'all')?.count ?? rows.length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Tabs row */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <div className="flex items-center gap-1 px-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={
                  'px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ' +
                  (isActive
                    ? 'border-emerald-500 text-emerald-700 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-800 font-medium')
                }
              >
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5 text-center w-10">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-1"
                  aria-label="Chọn tất cả"
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium w-10">#</th>
              <th className="px-3 py-2.5 text-left font-medium">Công việc</th>
              <th className="px-3 py-2.5 text-left font-medium w-24">Loại</th>
              <th className="px-3 py-2.5 text-left font-medium w-44">Chủ trì</th>
              <th className="px-3 py-2.5 text-left font-medium w-36">Phối hợp</th>
              <th className="px-3 py-2.5 text-left font-medium w-44">Đang chờ</th>
              <th className="px-3 py-2.5 text-left font-medium">Nội dung chờ</th>
              <th className="px-3 py-2.5 text-left font-medium w-28">Deadline</th>
              <th className="px-3 py-2.5 text-left font-medium w-32">Trạng thái</th>
              <th className="px-3 py-2.5 text-left font-medium w-24">Ưu tiên</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, idx) => {
              const overdue = isPastDue(t.dueDate);
              const collabDisplay = t.collaboratorUnits
                .map((u) => DEPT_LABEL[u as DeptId] ?? u)
                .join(', ');
              return (
                <tr
                  key={t.id}
                  onClick={() => onRowClick(t)}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-3 py-3 text-center align-top" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-1"
                      aria-label={`Chọn ${t.title}`}
                    />
                  </td>
                  <td className="px-3 py-3 text-slate-400 tabular-nums align-top">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-slate-800">{t.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      #{t.code}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className={
                        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ' +
                        COORD_TYPE_COLOR[t.type]
                      }
                    >
                      {COORD_TYPE_LABEL[t.type]}
                    </span>
                  </td>
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
                  <td className="px-3 py-3 align-top">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          'inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold ' +
                          avatarColor(t.waitingForPerson)
                        }
                      >
                        {initialsOf(t.waitingForPerson)}
                      </span>
                      <span className="text-sm text-slate-700 truncate">
                        {t.waitingForPerson}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className="text-sm text-slate-600 line-clamp-1">
                      {t.waitingForContent}
                    </span>
                  </td>
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
                  <td className="px-3 py-3 align-top">
                    <span
                      className={
                        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ' +
                        PRIORITY_COLOR[t.priority]
                      }
                    >
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={11}
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
