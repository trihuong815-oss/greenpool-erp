'use client';

import { X, Bell, Clock } from 'lucide-react';
import {
  CoordTask,
  COORD_TYPE_LABEL,
  COORD_TYPE_COLOR,
  COORD_SCOPE_LABEL,
  COORD_STATUS_LABEL,
  COORD_STATUS_COLOR,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  BLOCK_LABEL,
  BRANCH_LABEL,
} from './types';

interface Props {
  task: CoordTask | null;
  onClose: () => void;
  onNudge?: (id: string) => void;
}

const COLLAB_STATUS_LABEL: Record<string, string> = {
  chua_tiep_nhan: 'Chưa tiếp nhận',
  dang_thuc_hien: 'Đang thực hiện',
  hoan_thanh: 'Hoàn thành',
};
const COLLAB_STATUS_COLOR: Record<string, string> = {
  chua_tiep_nhan: 'bg-slate-100 text-slate-700',
  dang_thuc_hien: 'bg-sky-100 text-sky-800',
  hoan_thanh: 'bg-emerald-100 text-emerald-800',
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // YYYY-MM-DD fallback
    const parts = iso.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return iso;
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function daysSince(iso: string): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.round((diffMs / (1000 * 60 * 60 * 24)) * 10) / 10);
}

export default function DetailDrawer({ task, onClose, onNudge }: Props) {
  if (!task) return null;

  const historyMock = [
    { time: '15/06 09:00', who: 'Người tạo', action: 'Tạo điều phối' },
    { time: '15/06 10:30', who: 'GĐ Văn phòng', action: 'Duyệt cấp 1' },
    { time: '15/06 14:00', who: 'TP Marketing', action: 'Yêu cầu bổ sung Banner' },
  ];

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/40"
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-screen w-full flex-col bg-white shadow-2xl sm:w-[640px]">
        {/* Header sticky */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium text-slate-400">#{task.code}</div>
              <h2 className="mt-0.5 text-lg font-bold text-slate-800 leading-snug">
                {task.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${COORD_TYPE_COLOR[task.type]}`}
            >
              {COORD_TYPE_LABEL[task.type]}
            </span>
            <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
              {COORD_SCOPE_LABEL[task.scope]}
            </span>
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${COORD_STATUS_COLOR[task.status]}`}
            >
              {COORD_STATUS_LABEL[task.status]}
            </span>
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${PRIORITY_COLOR[task.priority]}`}
            >
              Ưu tiên: {PRIORITY_LABEL[task.priority]}
            </span>
          </div>
        </div>

        {/* Body scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Block đang tắc */}
          <div className="mb-4 rounded-r-lg border-l-4 border-amber-500 bg-amber-50 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              <Clock className="h-3 w-3" />
              Đang tắc tại
            </div>
            <div className="mt-1 font-medium text-slate-800">
              Đang chờ: <span className="text-slate-900">{task.waitingForPerson}</span>
            </div>
            <div className="mt-0.5 text-sm text-slate-700">
              Nội dung: {task.waitingForContent}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Đã chờ: <span className="font-medium tabular-nums text-amber-700">{daysSince(task.waitingSince)}</span> ngày
            </div>
            <button
              type="button"
              onClick={() => onNudge?.(task.id)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <Bell className="h-3.5 w-3.5" />
              Nhắc phản hồi
            </button>
          </div>

          {/* Thông tin chung */}
          <div className="mb-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Thông tin chung
            </h3>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Owner</div>
                <div className="text-sm font-medium text-slate-800">{task.ownerName}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Khối chủ trì</div>
                <div className="text-sm font-medium text-slate-800">{BLOCK_LABEL[task.ownerBlock]}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Phạm vi</div>
                <div className="text-sm font-medium text-slate-800">{COORD_SCOPE_LABEL[task.scope]}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Deadline</div>
                <div className="text-sm font-medium tabular-nums text-slate-800">{formatDate(task.dueDate)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Tạo lúc</div>
                <div className="text-sm font-medium tabular-nums text-slate-800">{formatDateTime(task.createdAt)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Người tạo</div>
                <div className="text-sm font-medium text-slate-800">{task.createdByName}</div>
              </div>
              {task.branch && (
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Cơ sở</div>
                  <div className="text-sm font-medium text-slate-800">{BRANCH_LABEL[task.branch]}</div>
                </div>
              )}
            </div>
          </div>

          {/* Đơn vị phối hợp */}
          <div className="mb-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Đơn vị phối hợp ({task.collaborators.length})
            </h3>
            {task.collaborators.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                Chưa có đơn vị phối hợp.
              </div>
            ) : (
              task.collaborators.map((c) => (
                <div key={c.id} className="mb-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">{c.unitName}</span>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${COLLAB_STATUS_COLOR[c.status] ?? 'bg-slate-100 text-slate-700'}`}
                    >
                      {COLLAB_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Người phụ trách: <span className="font-medium text-slate-700">{c.ownerName}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Nội dung: <span className="text-slate-700">{c.supportContent}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Kết quả bàn giao: <span className="text-slate-700">{c.deliverable}</span>
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    Deadline: {formatDate(c.deadline)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Lịch sử xử lý */}
          <div className="mb-2">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Lịch sử xử lý
            </h3>
            <ol className="relative ml-2 border-l border-slate-200 pl-4">
              {historyMock.map((h, i) => (
                <li key={i} className="relative mb-3 last:mb-0">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                  <div className="text-[10px] tabular-nums text-slate-400">{h.time}</div>
                  <div className="text-sm font-medium text-slate-800">{h.who}</div>
                  <div className="text-xs text-slate-600">{h.action}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer sticky */}
        <div className="sticky bottom-0 z-10 flex gap-2 border-t border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Đóng
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Cập nhật trạng thái
          </button>
        </div>
      </div>
    </>
  );
}
