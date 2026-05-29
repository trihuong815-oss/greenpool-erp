'use client';

import { useEffect, useState } from 'react';
import {
  X, CheckCircle2, XCircle, Loader2, Send, MessageSquare,
  Clock, ArrowRight, CalendarDays, AlertTriangle, Trash2,
  Paperclip, Download,
} from 'lucide-react';
import {
  tasksApi, type Task, type TaskComment, type TaskStatus, type TaskAttachment,
  PROPOSAL_CATEGORY_LABEL,
} from '@/lib/services/tasks/api-client';

interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface User { id: string; name: string; roleId: string; branchId: string | null; departmentId: string | null; }

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending_approval: 'Chờ duyệt', pending: 'Chờ làm', in_progress: 'Đang làm',
  done: 'Hoàn thành', rejected: 'Từ chối', cancelled: 'Huỷ',
};
const STATUS_BG: Record<TaskStatus, string> = {
  pending_approval: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending: 'bg-slate-100 text-slate-700 ring-slate-200',
  in_progress: 'bg-sky-50 text-sky-700 ring-sky-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-50 text-slate-500 ring-slate-200',
};
const PRIORITY_LABEL: Record<string, string> = { low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn' };

const GD_ROLES = new Set(['GD_KD', 'GD_VP']);
const ADMIN = new Set(['ADMIN', 'CEO', 'GD_KD', 'GD_VP']);

export function TaskDetailModal(props: {
  task: Task;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  currentDepartmentId: string | null;
  currentBranchId: string | null;
  departments: Department[];
  branches: Branch[];
  users: User[];
  onClose: () => void;
  onChange: () => void;
}) {
  const {
    task: initialTask, currentUserId, currentUserRole,
    currentDepartmentId, currentBranchId,
    departments, branches, onClose, onChange,
  } = props;

  const [task, setTask] = useState<Task>(initialTask);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'approve' | 'reject' | 'status' | 'comment' | 'delete' | 'upload'>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [progressInput, setProgressInput] = useState(initialTask.progressPct);

  const isCEO = currentUserRole === 'CEO' || currentUserRole === 'ADMIN';
  const isGD = GD_ROLES.has(currentUserRole);
  const isAdmin = ADMIN.has(currentUserRole);
  const isAdminSystem = currentUserRole === 'ADMIN';
  const isMyBlockApprover = isGD && task.approvalRequiredFrom === currentUserRole;

  const isCreator = task.createdBy === currentUserId;
  const isAssigneeUser = task.assigneeUserIds.includes(currentUserId);
  const isAssigneeDept = task.assigneeDeptId && task.assigneeDeptId === currentDepartmentId;
  const isAssigneeFacility = task.assigneeFacilityId && task.assigneeFacilityId === currentBranchId;
  // Quy tắc: chỉ assignee (trực tiếp hoặc theo dept/facility) mới được cập nhật tiến độ.
  // Creator KHÔNG được tự đánh dấu hoàn thành (trừ khi cũng là assignee chính thức).
  // ADMIN system bypass để sửa data hỏng.
  const canUpdateStatus =
    isAdminSystem ||
    isAssigneeUser ||
    !!isAssigneeDept ||
    !!isAssigneeFacility;

  // Quy tắc: creator + assignee KHÔNG tự duyệt task của mình.
  const canApprove = task.status === 'pending_approval'
    && !isCreator
    && !isAssigneeUser
    && (isCEO || isMyBlockApprover);
  const canDelete = isAdmin || isCreator;

  const assigneeLabel = task.assigneeDeptId
    ? departments.find((d) => d.id === task.assigneeDeptId)?.name ?? task.assigneeDeptId
    : task.assigneeFacilityId
      ? branches.find((b) => b.id === task.assigneeFacilityId)?.name ?? task.assigneeFacilityId
      : task.assigneeUserIds.length > 0 ? `${task.assigneeUserIds.length} cá nhân` : '(chưa gán)';

  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!task.dueDate && task.dueDate < today && !['done', 'cancelled', 'rejected'].includes(task.status);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      tasksApi.get(task.id),
      tasksApi.listComments(task.id),
      tasksApi.listAttachments(task.id),
    ])
      .then(([t, cs, atts]) => {
        if (!cancelled) { setTask(t); setComments(cs); setAttachments(atts); setProgressInput(t.progressPct); }
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function refresh() {
    const [t, cs, atts] = await Promise.all([
      tasksApi.get(task.id),
      tasksApi.listComments(task.id),
      tasksApi.listAttachments(task.id),
    ]);
    setTask(t); setComments(cs); setAttachments(atts); setProgressInput(t.progressPct);
    onChange();
  }

  async function uploadFiles(fileList: FileList) {
    setBusy('upload'); setError(null);
    try {
      for (let i = 0; i < fileList.length; i++) {
        await tasksApi.uploadAttachment(task.id, fileList[i]);
      }
      await refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  async function deleteAttachment(path: string) {
    if (!confirm('Xoá file này?')) return;
    setBusy('upload');
    try { await tasksApi.deleteAttachment(task.id, path); await refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  async function approve() {
    setBusy('approve');
    try { await tasksApi.approve(task.id); await refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  async function reject() {
    if (!rejectReason.trim()) { setError('Vui lòng nhập lý do từ chối'); return; }
    setBusy('reject');
    try { await tasksApi.reject(task.id, rejectReason.trim()); await refresh(); setShowReject(false); setRejectReason(''); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  async function changeStatus(next: TaskStatus, withProgress?: number) {
    setBusy('status');
    try {
      await tasksApi.updateStatus(task.id, { status: next, progressPct: withProgress });
      await refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  async function postComment() {
    if (!newComment.trim()) return;
    setBusy('comment');
    try { await tasksApi.comment(task.id, newComment.trim()); setNewComment(''); await refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  async function del() {
    if (!confirm('Xoá nhiệm vụ này? Không thể hoàn tác.')) return;
    setBusy('delete');
    try { await tasksApi.delete(task.id); onChange(); onClose(); }
    catch (e: any) { setError(e.message); setBusy(null); }
  }


  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${STATUS_BG[task.status]}`}>
                  {STATUS_LABEL[task.status]}
                </span>
                {task.crossBlock && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900">LIÊN KHỐI</span>
                )}
                {overdue && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-900">
                    <AlertTriangle size={10} /> QUÁ HẠN
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold truncate">{task.title}</h2>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-center py-12 text-slate-500">
              <Loader2 size={20} className="inline animate-spin mr-2" /> Đang tải…
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {error && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>
              )}

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Meta label="Người tạo">{task.createdByName} <span className="text-slate-400">({task.createdByRole})</span></Meta>
                <Meta label="Khối nhận">{task.assigneeBlock} · {assigneeLabel}</Meta>
                <Meta label="Ưu tiên"><PriorityChip p={task.priority} /></Meta>
                <Meta label="Hạn chót">
                  {task.dueDate ? (
                    <span className={`inline-flex items-center gap-1 ${overdue ? 'text-rose-700 font-semibold' : ''}`}>
                      <CalendarDays size={12} /> {task.dueDate}
                    </span>
                  ) : <span className="text-slate-400">—</span>}
                </Meta>
                <Meta label="Tạo lúc">{fmtDateTime(task.createdAt)}</Meta>
                <Meta label="Tiến độ">
                  <ProgressBar pct={task.progressPct} />
                </Meta>
              </div>

              {/* Đề xuất: loại + chi phí dự kiến */}
              {task.kind === 'proposal' && task.proposalCategory && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 flex items-center gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-0.5">Loại đề xuất</div>
                    <div className="text-sm font-semibold text-slate-800">{PROPOSAL_CATEGORY_LABEL[task.proposalCategory]}</div>
                  </div>
                  {task.estimatedCost != null && task.estimatedCost > 0 && (
                    <div className="ml-auto text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-0.5">Chi phí dự kiến</div>
                      <div className="text-sm font-bold text-amber-800 tabular-nums">{task.estimatedCost.toLocaleString('vi-VN')}₫</div>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              {task.description && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Mô tả</div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              {/* Status update controls */}
              {canUpdateStatus && !['rejected', 'cancelled'].includes(task.status) && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Cập nhật trạng thái</div>
                  {task.status === 'in_progress' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-slate-600 shrink-0">Tiến độ:</label>
                      <input
                        type="range" min={0} max={100} step={5}
                        value={progressInput}
                        onChange={(e) => setProgressInput(Number(e.target.value))}
                        className="flex-1 accent-emerald-600"
                      />
                      <span className="text-sm font-semibold text-emerald-700 tabular-nums w-12 text-right">{progressInput}%</span>
                      <button
                        disabled={busy === 'status'}
                        onClick={() => changeStatus('in_progress', progressInput)}
                        className="px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 rounded"
                      >Lưu %</button>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {task.status === 'pending' && (
                      <button disabled={!!busy} onClick={() => changeStatus('in_progress', task.progressPct || 10)} className={btnPrimary}>
                        <Clock size={14} /> Bắt đầu
                      </button>
                    )}
                    {(task.status === 'pending' || task.status === 'in_progress') && (
                      <button disabled={!!busy} onClick={() => changeStatus('done')} className={btnSuccess}>
                        <CheckCircle2 size={14} /> Hoàn thành
                      </button>
                    )}
                    {task.status === 'in_progress' && (
                      <button disabled={!!busy} onClick={() => changeStatus('pending')} className={btnSecondary}>
                        Tạm dừng
                      </button>
                    )}
                    {(task.status === 'pending' || task.status === 'in_progress') && (isCreator || isAdmin) && (
                      <button disabled={!!busy} onClick={() => changeStatus('cancelled')} className={btnDanger}>
                        Huỷ
                      </button>
                    )}
                    {task.status === 'done' && isAdmin && (
                      <button disabled={!!busy} onClick={() => changeStatus('in_progress', 50)} className={btnSecondary}>
                        Mở lại
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Approval block */}
              {canApprove && (
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50/60 p-3 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                    <AlertTriangle size={12} /> Việc liên khối — chờ bạn duyệt
                  </div>
                  {!showReject ? (
                    <div className="flex gap-2">
                      <button disabled={busy === 'approve'} onClick={approve} className={btnSuccess}>
                        {busy === 'approve' && <Loader2 size={14} className="animate-spin" />}
                        <CheckCircle2 size={14} /> Duyệt
                      </button>
                      <button onClick={() => setShowReject(true)} className={btnDanger}>
                        <XCircle size={14} /> Từ chối
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Lý do từ chối (bắt buộc)"
                        rows={2}
                        className="w-full text-sm border border-rose-300 rounded-lg p-2 focus:ring-2 focus:ring-rose-400 outline-none"
                      />
                      <div className="flex gap-2">
                        <button disabled={busy === 'reject'} onClick={reject} className={btnDanger}>
                          {busy === 'reject' && <Loader2 size={14} className="animate-spin" />}
                          Xác nhận từ chối
                        </button>
                        <button onClick={() => { setShowReject(false); setRejectReason(''); }} className={btnSecondary}>
                          Huỷ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {task.status === 'rejected' && task.rejectionReason && (
                <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-800 mb-1">Lý do từ chối</div>
                  <p className="text-sm text-rose-900">{task.rejectionReason}</p>
                </div>
              )}

              {/* Attachments */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <Paperclip size={11} /> File đính kèm ({attachments.length})
                </div>
                {attachments.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {attachments.map((a) => {
                      const canDel = isAdmin || a.uploadedBy === currentUserId || isCreator;
                      return (
                        <li key={a.path} className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                          <Paperclip size={12} className="text-slate-400 shrink-0" />
                          <a
                            href={a.downloadUrl} target="_blank" rel="noreferrer"
                            className="flex-1 truncate text-sm text-emerald-700 hover:underline"
                          >
                            {a.fileName}
                          </a>
                          <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                            {(a.size / 1024).toFixed(0)} KB
                          </span>
                          <span className="text-[10px] text-slate-400 truncate shrink-0 max-w-[100px]">{a.uploadedByName}</span>
                          {a.downloadUrl && (
                            <a href={a.downloadUrl} target="_blank" rel="noreferrer"
                              className="p-1 text-slate-400 hover:text-emerald-700"
                              title="Tải xuống"
                            >
                              <Download size={12} />
                            </a>
                          )}
                          {canDel && (
                            <button
                              onClick={() => deleteAttachment(a.path)}
                              disabled={busy === 'upload'}
                              className="p-1 text-slate-400 hover:text-rose-600"
                              title="Xoá"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-dashed border-emerald-300 rounded-lg text-xs text-emerald-700 hover:bg-emerald-50">
                  {busy === 'upload' ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                  {busy === 'upload' ? 'Đang upload...' : 'Đính kèm file'}
                  <input
                    type="file" multiple
                    onChange={(e) => { if (e.target.files && e.target.files.length > 0) uploadFiles(e.target.files); e.target.value = ''; }}
                    className="hidden"
                    disabled={busy === 'upload'}
                  />
                </label>
              </div>

              {/* Timeline */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <MessageSquare size={11} /> Lịch sử & Trao đổi ({comments.length})
                </div>
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {comments.map((c) => (
                    <CommentRow key={c.id} c={c} />
                  ))}
                  {comments.length === 0 && (
                    <div className="text-xs text-slate-400 text-center py-3">Chưa có hoạt động</div>
                  )}
                </div>
                {/* New comment */}
                <div className="mt-3 flex gap-2">
                  <input
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
                    placeholder="Nhập trao đổi…"
                    className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-400 outline-none"
                  />
                  <button
                    disabled={!newComment.trim() || busy === 'comment'}
                    onClick={postComment}
                    className="px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {busy === 'comment' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50/40">
          <div>
            {canDelete && (
              <button
                disabled={!!busy}
                onClick={del}
                className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1"
              >
                <Trash2 size={12} /> Xoá nhiệm vụ
              </button>
            )}
          </div>
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

const btnPrimary  = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-50';
const btnSuccess  = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50';
const btnDanger   = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700 disabled:opacity-50';
const btnSecondary= 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 disabled:opacity-50';

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">{label}</div>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

function PriorityChip({ p }: { p: string }) {
  const hex = { low: '#94a3b8', normal: '#0ea5e9', high: '#f59e0b', urgent: '#ef4444' }[p] ?? '#94a3b8';
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hex }} />
      {PRIORITY_LABEL[p] ?? p}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-emerald-700 w-10 text-right">{pct}%</span>
    </div>
  );
}

const COMMENT_KIND_ICON: Record<string, { icon: string; bg: string; text: string }> = {
  created: { icon: '✨', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  approval: { icon: '✓', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  rejection: { icon: '✕', bg: 'bg-rose-50', text: 'text-rose-700' },
  status_change: { icon: '↻', bg: 'bg-sky-50', text: 'text-sky-700' },
  comment: { icon: '💬', bg: 'bg-slate-50', text: 'text-slate-700' },
};

function CommentRow({ c }: { c: TaskComment }) {
  const k = COMMENT_KIND_ICON[c.kind] ?? COMMENT_KIND_ICON.comment;
  const isEvent = c.kind !== 'comment';
  return (
    <div className={`flex items-start gap-2 p-2 rounded-lg ${isEvent ? k.bg : 'bg-white border border-slate-100'}`}>
      <span className={`text-sm shrink-0 ${k.text}`}>{k.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold text-slate-800 truncate">{c.authorName}</span>
          <span className="text-slate-400 tabular-nums shrink-0">{fmtDateTime(c.createdAt)}</span>
        </div>
        <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{c.body}</p>
      </div>
    </div>
  );
}

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mn = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mn}`;
  } catch { return iso; }
}

// Re-export ArrowRight để avoid unused lint
export type { Task };
void ArrowRight;
