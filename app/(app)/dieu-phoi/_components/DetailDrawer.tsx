'use client';

import { useMemo, useState } from 'react';
import { X, Bell, Clock, CheckCircle2, XCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import {
  CoordTask,
  Collaborator,
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
  currentUserUid: string;
  currentUserRole: string;
  onClose: () => void;
  onNudge?: (id: string) => void;
  onAcceptCollab?: (taskId: string, collabId: string) => void;
  onRejectCollab?: (taskId: string, collabId: string, reason: string) => void;
  onCompleteCollab?: (taskId: string, collabId: string) => void;
}

type CollabStatus = Collaborator['status'];

const COLLAB_STATUS_LABEL: Record<CollabStatus, string> = {
  chua_tiep_nhan: 'Chưa tiếp nhận',
  da_tiep_nhan: 'Đã tiếp nhận',
  dang_thuc_hien: 'Đang thực hiện',
  hoan_thanh: 'Hoàn thành',
};

const COLLAB_STATUS_COLOR: Record<CollabStatus, string> = {
  chua_tiep_nhan: 'bg-slate-100 text-slate-700',
  da_tiep_nhan: 'bg-sky-100 text-sky-800',
  dang_thuc_hien: 'bg-violet-100 text-violet-800',
  hoan_thanh: 'bg-emerald-100 text-emerald-800',
};

// SLA — chờ tiếp nhận quá 24h (1 ngày) => cảnh báo rose
const WAIT_SLA_DAYS = 1;

// Gợi ý lý do từ chối (theo spec)
const REJECT_REASONS = [
  'Không thuộc phạm vi trách nhiệm',
  'Đang quá tải',
  'Thiếu thông tin triển khai',
];

// Role được phép cập nhật trạng thái Owner (mock — sẽ thay bằng RBAC server)
const OWNER_UPDATE_ROLES = new Set([
  'ADMIN',
  'CHU_TICH',
  'CEO',
  'GD_KD',
  'GD_VP',
  'TP_DT',
  'TP_KT',
  'TP_NS',
  'TP_KE',
  'TP_GS',
  'TP_MKT',
  'QLCS',
]);

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
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

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] || '';
  const first = parts[0] || '';
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export default function DetailDrawer({
  task,
  currentUserUid,
  currentUserRole,
  onClose,
  onNudge,
  onAcceptCollab,
  onRejectCollab,
  onCompleteCollab,
}: Props) {
  // Lý do từ chối theo từng collaborator (giữ ở local state, key = collab.id)
  const [rejectOpenFor, setRejectOpenFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const waitDays = useMemo(() => daysSince(task?.waitingSince ?? ''), [task?.waitingSince]);
  const waitOverSla = waitDays > WAIT_SLA_DAYS;

  const canUpdateOwnerState = useMemo(() => {
    if (!task) return false;
    if (currentUserUid === task.ownerUid) return true;
    return OWNER_UPDATE_ROLES.has(currentUserRole);
  }, [task, currentUserUid, currentUserRole]);

  if (!task) return null;

  // Timeline mock — sẽ thay bằng task.history khi schema V2 deploy
  const historyMock = [
    { time: formatDateTime(task.createdAt), who: task.createdByName, action: 'Tạo điều phối', dotColor: 'bg-emerald-500' },
    { time: '—', who: task.ownerName, action: 'Owner tiếp nhận', dotColor: 'bg-sky-500' },
    { time: '—', who: task.waitingForPerson || '—', action: `Đang chờ: ${task.waitingForContent || '—'}`, dotColor: 'bg-amber-500' },
  ];

  function handleReject(collabId: string) {
    const reason = rejectReason.trim();
    if (!reason) return;
    onRejectCollab?.(task!.id, collabId, reason);
    setRejectOpenFor(null);
    setRejectReason('');
  }

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
          {/* Block Owner */}
          <div className="mb-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Owner
            </h3>
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                {initials(task.ownerName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">
                  {task.ownerName}
                </div>
                <div className="text-[11px] text-slate-500">
                  {BLOCK_LABEL[task.ownerBlock]}
                  {task.ownerDeptId ? ` · ${task.ownerDeptId}` : ''}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <ShieldCheck className="h-3 w-3" /> Chịu KPI cuối cùng
              </span>
            </div>
          </div>

          {/* Block "Đang chờ" — Waiting-For Engine */}
          {task.waitingForPerson || task.waitingForContent ? (
            <div className="mb-4 rounded-r-lg border-l-4 border-amber-500 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                <Clock className="h-3 w-3" />
                Đang chờ
              </div>
              <div className="mt-1 font-bold text-slate-800">
                Đang chờ: <span className="text-slate-900">{task.waitingForPerson || '—'}</span>
              </div>
              <div className="mt-0.5 text-sm text-slate-700">
                Nội dung: {task.waitingForContent || '—'}
              </div>
              <div className="mt-1 text-xs">
                <span className="text-slate-500">Đã chờ: </span>
                <span
                  className={`font-semibold tabular-nums ${waitOverSla ? 'text-rose-600' : 'text-amber-700'}`}
                >
                  {waitDays} ngày
                </span>
                {waitOverSla && (
                  <span className="ml-1 text-[10px] font-semibold uppercase text-rose-600">
                    · Quá SLA
                  </span>
                )}
              </div>
              {onNudge && (
                <button
                  type="button"
                  onClick={() => onNudge(task.id)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <Bell className="h-3.5 w-3.5" />
                  Nhắc phản hồi
                </button>
              )}
            </div>
          ) : null}

          {/* Block Thông tin */}
          <div className="mb-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Thông tin
            </h3>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Khối</div>
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
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Trạng thái</div>
                <div className="text-sm font-medium text-slate-800">{COORD_STATUS_LABEL[task.status]}</div>
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
              task.collaborators.map((c) => {
                const isMyAssignment = !!c.responsibleUid && c.responsibleUid === currentUserUid;
                const isPending = c.status === 'chua_tiep_nhan';
                const isAcceptedOrDoing = c.status === 'da_tiep_nhan' || c.status === 'dang_thuc_hien';
                const isDone = c.status === 'hoan_thanh';

                return (
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
                      Người phụ trách: <span className="font-medium text-slate-700">{c.responsibleName || c.ownerName || '—'}</span>
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

                    {/* Hành động — chỉ hiện cho responsibleUid khớp currentUserUid */}
                    {isPending && isMyAssignment && (onAcceptCollab || onRejectCollab) && (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        {rejectOpenFor === c.id ? (
                          <div className="space-y-2">
                            <label className="block text-[11px] font-semibold text-slate-600">
                              Lý do từ chối <span className="text-rose-500">*</span>
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {REJECT_REASONS.map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => setRejectReason(r)}
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition ${
                                    rejectReason === r
                                      ? 'bg-rose-600 text-white ring-rose-600'
                                      : 'bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100'
                                  }`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                            <textarea
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Mô tả lý do từ chối…"
                              rows={2}
                              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectOpenFor(null);
                                  setRejectReason('');
                                }}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                disabled={!rejectReason.trim()}
                                onClick={() => handleReject(c.id)}
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <XCircle className="h-3.5 w-3.5" /> Gửi từ chối
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => onAcceptCollab?.(task.id, c.id)}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Tiếp nhận
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectOpenFor(c.id);
                                setRejectReason('');
                              }}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Từ chối
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {isAcceptedOrDoing && isMyAssignment && onCompleteCollab && (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          onClick={() => onCompleteCollab(task.id, c.id)}
                          className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Hoàn thành
                        </button>
                      </div>
                    )}

                    {isDone && (
                      <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Đã hoàn thành{c.completedAt ? ` · ${formatDate(c.completedAt)}` : ''}
                      </div>
                    )}
                  </div>
                );
              })
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
                  <span
                    className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${h.dotColor}`}
                  />
                  <div className="text-[10px] tabular-nums text-slate-400">{h.time}</div>
                  <div className="text-sm font-medium text-slate-800">{h.who}</div>
                  <div className="text-xs text-slate-600">{h.action}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer sticky */}
        <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white p-4">
          {task.fromProposalId && (
            <a
              href={`/de-xuat?id=${encodeURIComponent(task.fromProposalId)}`}
              className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Quay về đề xuất gốc
            </a>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Đóng
            </button>
            {canUpdateOwnerState && (
              <button
                type="button"
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Cập nhật trạng thái
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
