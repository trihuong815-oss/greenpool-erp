'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  X, Loader2, Clock, CheckCircle2, AlertTriangle, CalendarDays,
  MessageSquare, Paperclip, Send, ChevronRight, Eye, Zap,
  Building2, User, Users, ArrowRight, RefreshCw, Edit3,
} from 'lucide-react';
import {
  tasksApi,
  type Task, type TaskStatus,
  type CollabUnit, type WaitingFor, type CoordType, type CoordScope,
} from '@/lib/services/tasks/api-client';
import type { UserPublic } from '@/lib/types';

interface Comment {
  id: string; content: string; authorName: string; authorRole?: string;
  createdAt: string; kind?: string; newStatus?: string;
}

interface Props {
  task: Task;
  departments: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  users: UserPublic[];
  roleCode: string; userRole: string; userId: string; userName: string;
  onClose: () => void;
  onChange: () => void;
}

const COORD_TYPE_LABEL: Record<string, string> = {
  'dieu-phoi': 'Dieu phoi', 'ho-tro': 'Ho tro', 'de-xuat': 'De xuat',
  'phe-duyet': 'Phe duyet', 'canh-bao': 'Canh bao',
  'proposal': 'De xuat', 'assignment': 'Dieu phoi',
};
const COORD_SCOPE_LABEL: Record<string, string> = {
  'noi-bo-phong': 'Noi bo phong', 'noi-bo-khoi': 'Noi bo khoi',
  'lien-khoi': 'Lien khoi', 'lien-co-so': 'Lien co so', 'du-an': 'Du an',
};
const STATUS_LABEL: Record<string, string> = {
  'khoi-tao': 'Khoi tao', 'tiep-nhan': 'Tiep nhan', 'dang-xu-ly': 'Dang xu ly',
  'dang-phoi-hop': 'Dang phoi hop', 'cho-phan-hoi': 'Cho phan hoi',
  'cho-phe-duyet': 'Cho phe duyet', 'hoan-thanh': 'Hoan thanh', 'dong-ho-so': 'Dong ho so',
  pending_approval: 'Cho duyet', pending: 'Cho lam', in_progress: 'Dang lam',
  requested_revision: 'Yeu cau bo sung', done: 'Hoan thanh',
  rejected: 'Tu choi', cancelled: 'Huy',
};
const STATUS_COLOR: Record<string, string> = {
  'khoi-tao': 'bg-slate-100 text-slate-600', 'tiep-nhan': 'bg-blue-100 text-blue-700',
  'dang-xu-ly': 'bg-sky-100 text-sky-700', 'dang-phoi-hop': 'bg-indigo-100 text-indigo-700',
  'cho-phan-hoi': 'bg-amber-100 text-amber-700', 'cho-phe-duyet': 'bg-orange-100 text-orange-700',
  'hoan-thanh': 'bg-emerald-100 text-emerald-700', 'dong-ho-so': 'bg-slate-100 text-slate-500',
  pending_approval: 'bg-orange-100 text-orange-700', pending: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-sky-100 text-sky-700', requested_revision: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-400',
};
const COLLAB_STATUS_LABEL: Record<string, string> = {
  'chua-tiep-nhan': 'Chua tiep nhan', 'dang-thuc-hien': 'Dang thuc hien',
  'hoan-thanh': 'Hoan thanh', 'tu-choi': 'Tu choi',
};
const COLLAB_STATUS_COLOR: Record<string, string> = {
  'chua-tiep-nhan': 'bg-slate-100 text-slate-500', 'dang-thuc-hien': 'bg-sky-100 text-sky-700',
  'hoan-thanh': 'bg-emerald-100 text-emerald-700', 'tu-choi': 'bg-rose-100 text-rose-700',
};
const PRIORITY_LABEL: Record<string, string> = { high: 'Cao', medium: 'Trung binh', low: 'Thap' };
const PRIORITY_COLOR: Record<string, string> = { high: 'text-rose-600 font-bold', medium: 'text-amber-600 font-semibold', low: 'text-slate-400' };

function getTaskStatus(t: Task): string { return (t as any).coordStatus || t.status; }
function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function getDaysWaiting(since: string): number {
  return Math.floor((Date.now() - new Date(since).getTime()) / 86400000);
}
function isOverdue(t: Task): boolean {
  if (!t.dueDate) return false;
  if (['done','hoan-thanh','dong-ho-so','cancelled','rejected'].includes(getTaskStatus(t))) return false;
  return new Date(t.dueDate) < new Date();
}

export default function TaskDetailModal({
  task: initialTask, departments, branches, users,
  roleCode, userRole, userId, userName, onClose, onChange,
}: Props) {
  const [task, setTask] = useState<Task>(initialTask);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progressInput, setProgressInput] = useState(initialTask.progressPct);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'detail' | 'timeline'>('detail');
  const [error, setError] = useState<string | null>(null);

  const status = getTaskStatus(task);
  const overdue = isOverdue(task);
  const coordType = (task as any).coordType || task.kind;
  const coordScope = (task as any).coordScope;
  const collabUnits: CollabUnit[] = (task as any).collabUnits || [];
  const waitingFor = (task as any).waitingFor as WaitingFor | null;
  const daysWaiting = waitingFor ? getDaysWaiting(waitingFor.since) : null;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [t, cs] = await Promise.all([
          tasksApi.get(task.id),
          tasksApi.listComments(task.id),
        ]);
        setTask(t); setComments(cs);
        setProgressInput(t.progressPct);
      } catch { /* silent */ } finally { setLoading(false); }
    })();
  }, [task.id]);

  async function refresh() {
    const [t, cs] = await Promise.all([tasksApi.get(task.id), tasksApi.listComments(task.id)]);
    setTask(t); setComments(cs); setProgressInput(t.progressPct); onChange();
  }

  async function addComment() {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try { await tasksApi.addComment(task.id, commentText.trim()); setCommentText(''); await refresh(); }
    catch { } finally { setSubmitting(false); }
  }

  async function updateProgress() {
    setBusy('progress');
    try { await tasksApi.patch(task.id, { progressPct: progressInput }); await refresh(); }
    catch { } finally { setBusy(null); }
  }

  async function changeStatus(newStatus: string) {
    setBusy('status');
    try { await tasksApi.patch(task.id, { status: newStatus as TaskStatus }); await refresh(); }
    catch (err: any) { setError(err.message); } finally { setBusy(null); }
  }

  // Determine owner name
  const ownerName = (() => {
    if (task.assigneeUserIds?.length > 0) {
      return task.assigneeUserIds.slice(0, 2).map(uid => {
        const u = users.find(u => u.id === uid || u.uid === uid);
        return u?.name || u?.displayName || uid.slice(0, 4);
      }).join(', ') + (task.assigneeUserIds.length > 2 ? ` +${task.assigneeUserIds.length - 2}` : '');
    }
    if (task.assigneeDeptId) return departments.find(d => d.id === task.assigneeDeptId)?.name || task.assigneeDeptId;
    if (task.assigneeFacilityId) return branches.find(b => b.id === task.assigneeFacilityId)?.name || task.assigneeFacilityId;
    return '—';
  })();

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}>
      <div className="bg-white shadow-2xl w-full sm:max-w-4xl h-full sm:h-auto sm:max-h-[92vh] sm:rounded-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* HEADER */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ring-1 ring-white/30 ${STATUS_COLOR[status] || 'bg-white/20 text-white'}`}>
                  {STATUS_LABEL[status] || status}
                </span>
                {(task as any).coordType && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-white/20 text-white">
                    {COORD_TYPE_LABEL[(task as any).coordType] || (task as any).coordType}
                  </span>
                )}
                {task.crossBlock && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900">LIEN KHOI</span>}
                {overdue && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-900"><AlertTriangle size={10} /> QUA HAN</span>}
                {waitingFor && (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 ${daysWaiting! >= 3 ? 'text-rose-900' : 'text-amber-900'}`}>
                    <Zap size={10} /> Cho {daysWaiting === 0 ? 'hom nay' : `${daysWaiting} ngay`}
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold">{task.title}</h2>
              {(task as any).goal && <p className="text-xs text-white/80 mt-0.5">{(task as any).goal}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={refresh} className="p-1.5 text-white/60 hover:text-white"><RefreshCw size={14} /></button>
              <button onClick={onClose} className="text-white/70 hover:text-white"><X size={20} /></button>
            </div>
          </div>
        </div>

        {/* TAB BAR */}
        <div className="flex border-b border-slate-200 px-1 bg-slate-50">
          {(['detail', 'timeline'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${activeTab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t === 'detail' ? 'Chi tiet' : 'Lich su xu ly'}
            </button>
          ))}
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" /> Dang tai...</div>
          ) : activeTab === 'detail' ? (
            <DetailTab task={task} coordType={coordType} coordScope={coordScope} collabUnits={collabUnits}
              waitingFor={waitingFor} daysWaiting={daysWaiting} ownerName={ownerName}
              departments={departments} branches={branches} users={users}
              progressInput={progressInput} setProgressInput={setProgressInput}
              updateProgress={updateProgress} changeStatus={changeStatus} busy={busy} error={error} />
          ) : (
            <TimelineTab comments={comments} commentText={commentText}
              setCommentText={setCommentText} addComment={addComment} submitting={submitting} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============= DETAIL TAB — 3-COLUMN LAYOUT =============
function DetailTab({ task, coordType, coordScope, collabUnits, waitingFor, daysWaiting, ownerName,
  departments, branches, users, progressInput, setProgressInput, updateProgress, changeStatus, busy, error }: {
  task: Task; coordType: string; coordScope: string; collabUnits: CollabUnit[];
  waitingFor: WaitingFor | null; daysWaiting: number | null; ownerName: string;
  departments: { id: string; name: string }[]; branches: { id: string; name: string }[];
  users: UserPublic[]; progressInput: number;
  setProgressInput: (v: number) => void; updateProgress: () => void;
  changeStatus: (s: string) => void; busy: string | null; error: string | null;
}) {
  const overdue = isOverdue(task);
  const status = getTaskStatus(task);

  return (
    <div className="p-5">
      {error && <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}

      {/* 3-COLUMN GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* COL 1: THONG TIN CONG VIEC */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Thong tin cong viec</h3>
            <div className="space-y-2.5">
              <MetaRow label="Chu tri" value={ownerName} />
              <MetaRow label="Loai" value={COORD_TYPE_LABEL[coordType] || coordType} />
              {coordScope && <MetaRow label="Pham vi" value={COORD_SCOPE_LABEL[coordScope] || coordScope} />}
              <MetaRow label="Khoi" value={task.assigneeBlock === 'KD' ? 'Kinh doanh' : task.assigneeBlock === 'VP' ? 'Van phong' : task.assigneeBlock} />
              <MetaRow label="Uu tien">
                <span className={PRIORITY_COLOR[task.priority]}>{PRIORITY_LABEL[task.priority] || task.priority}</span>
              </MetaRow>
              <MetaRow label="Deadline">
                <span className={overdue ? 'text-rose-600 font-semibold' : ''}>
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString('vi-VN') : '—'}
                  {overdue && ' (!)'}
                </span>
              </MetaRow>
              <MetaRow label="Tao luc" value={formatDateTime(task.createdAt)} />
              <MetaRow label="Tao boi" value={task.createdByName} />
              <MetaRow label="Cap nhat" value={formatDateTime(task.updatedAt)} />
            </div>
          </div>

          {/* TIEN DO */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Tien do</h3>
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">Hoan thanh</span>
                <span className="font-bold text-emerald-700 tabular-nums">{progressInput}%</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all rounded-full"
                  style={{ width: `${progressInput}%` }} />
              </div>
            </div>
            <input type="range" min={0} max={100} step={5} value={progressInput}
              onChange={e => setProgressInput(Number(e.target.value))}
              className="w-full accent-emerald-600" />
            {progressInput !== task.progressPct && (
              <button onClick={updateProgress} disabled={busy === 'progress'}
                className="mt-2 w-full py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition">
                {busy === 'progress' ? 'Dang luu...' : 'Luu tien do'}
              </button>
            )}
          </div>

          {/* TRANG THAI ACTION */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Doi trang thai</h3>
            <div className="space-y-1.5">
              {[
                { key: 'tiep-nhan', label: 'Tiep nhan', show: status === 'khoi-tao' },
                { key: 'dang-xu-ly', label: 'Bat dau xu ly', show: ['khoi-tao','tiep-nhan'].includes(status) },
                { key: 'dang-phoi-hop', label: 'Dang phoi hop', show: ['dang-xu-ly'].includes(status) },
                { key: 'cho-phan-hoi', label: 'Chuyen: Cho phan hoi', show: ['dang-xu-ly','dang-phoi-hop'].includes(status) },
                { key: 'cho-phe-duyet', label: 'Gui phe duyet', show: ['dang-xu-ly','dang-phoi-hop'].includes(status) },
                { key: 'hoan-thanh', label: 'Xac nhan Hoan thanh', show: !['hoan-thanh','dong-ho-so','cancelled','rejected'].includes(status) },
                { key: 'dong-ho-so', label: 'Dong ho so', show: status === 'hoan-thanh' },
              ].filter(a => a.show).map(a => (
                <button key={a.key} onClick={() => changeStatus(a.key)} disabled={busy === 'status'}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-left text-sm font-medium text-slate-700 transition disabled:opacity-50">
                  <span>{a.label}</span>
                  <ChevronRight size={14} className="text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* COL 2: DON VI PHOI HOP */}
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 mb-3">
              Don vi phoi hop ({collabUnits.length})
            </h3>
            {collabUnits.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Khong co don vi phoi hop</p>
            ) : (
              <div className="space-y-3">
                {collabUnits.map((cu, i) => (
                  <div key={i} className="bg-white rounded-lg border border-indigo-100 p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{cu.unitName}</div>
                        <div className="text-xs text-slate-500">{cu.ownerName} {cu.ownerRole ? '(' + cu.ownerRole + ')' : ''}</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${COLLAB_STATUS_COLOR[cu.status] || 'bg-slate-100 text-slate-500'}`}>
                        {COLLAB_STATUS_LABEL[cu.status] || cu.status}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex gap-1.5">
                        <span className="text-slate-400 shrink-0 w-20">Can ho tro:</span>
                        <span className="text-slate-700 font-medium">{cu.assignment || '—'}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <span className="text-slate-400 shrink-0 w-20">Ban giao:</span>
                        <span className="text-slate-700">{cu.deliverable || '—'}</span>
                      </div>
                      {cu.dueDate && (
                        <div className="flex gap-1.5">
                          <span className="text-slate-400 shrink-0 w-20">Deadline:</span>
                          <span className="text-slate-700 font-medium">{formatDate(cu.dueDate)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MO TA */}
          {task.description && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Mo ta</h3>
              <p className="text-sm text-slate-700 leading-relaxed">{task.description}</p>
            </div>
          )}
        </div>

        {/* COL 3: WAITING-FOR ENGINE + DIEM NGHEN */}
        <div className="space-y-4">

          {/* WAITING-FOR */}
          <div className={`rounded-xl border p-4 ${waitingFor ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-white'}`}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-3 flex items-center gap-1.5">
              <Zap size={13} /> Dang cho — Waiting For
            </h3>
            {waitingFor ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`text-2xl font-bold tabular-nums ${daysWaiting! >= 3 ? 'text-rose-600' : daysWaiting! >= 1 ? 'text-amber-600' : 'text-slate-600'}`}>
                    {daysWaiting === 0 ? 'Hom nay' : `${daysWaiting} ngay`}
                  </div>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <span className="text-slate-400 w-16 shrink-0">Ai:</span>
                    <span className="text-slate-800 font-semibold">{waitingFor.unitName}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-slate-400 w-16 shrink-0">Noi dung:</span>
                    <span className="text-slate-700">{waitingFor.content}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-slate-400 w-16 shrink-0">Tu:</span>
                    <span className="text-slate-500">{formatDate(waitingFor.since)}</span>
                  </div>
                </div>
                {daysWaiting! >= 3 && (
                  <div className="mt-3 px-3 py-2 rounded-lg bg-rose-100 text-rose-700 text-xs font-semibold">
                    ESCALATION: Da cho qua 3 ngay. Can nhac gap / bao Truong phong.
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-3">Khong co waiting-for nao</p>
            )}
          </div>

          {/* APPROVAL CHAIN */}
          {task.approvalChain && task.approvalChain.length > 0 && (
            <div className="rounded-xl border border-orange-100 bg-orange-50/30 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-700 mb-3">Chay duyet</h3>
              <div className="space-y-1.5">
                {task.approvalChain.map((role, i) => {
                  const done = (task.approvalsCompleted || []).some((a: any) => a.role === role);
                  const current = task.currentApprover === role;
                  return (
                    <div key={i} className={`flex items-center gap-2 text-xs ${current ? 'font-semibold text-orange-700' : done ? 'text-emerald-600' : 'text-slate-500'}`}>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold shrink-0 ${done ? 'bg-emerald-100 text-emerald-700' : current ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                        {i + 1}
                      </span>
                      <span>{(task.approvalChainLabels || {})[role] || role}</span>
                      {done && <span className="ml-auto text-emerald-500">Da duyet</span>}
                      {current && <span className="ml-auto text-orange-500 animate-pulse">Dang cho...</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============= TIMELINE TAB =============
function TimelineTab({ comments, commentText, setCommentText, addComment, submitting }: {
  comments: Comment[]; commentText: string;
  setCommentText: (v: string) => void; addComment: () => void; submitting: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-5 space-y-3">
        {comments.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Chua co lich su xu ly</p>
          </div>
        )}
        {[...comments].reverse().map(c => (
          <div key={c.id} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm">
              {(c.authorName || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-slate-700">{c.authorName}</span>
                {c.authorRole && <span className="text-xs text-slate-400">{c.authorRole}</span>}
                <span className="text-xs text-slate-400 ml-auto">{formatDateTime(c.createdAt)}</span>
              </div>
              {c.newStatus && (
                <div className="text-xs text-slate-500 mb-0.5">
                  Doi trang thai: <span className="font-semibold">{STATUS_LABEL[c.newStatus] || c.newStatus}</span>
                </div>
              )}
              <div className="text-sm text-slate-800 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">{c.content}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ADD COMMENT */}
      <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4">
        <div className="flex gap-2">
          <input
            value={commentText} onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } }}
            placeholder="Them ghi chu, cap nhat tien trinh..."
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button onClick={addComment} disabled={submitting || !commentText.trim()}
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============= HELPERS =============
function MetaRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-slate-400 shrink-0 w-20 pt-0.5">{label}</span>
      <span className="text-xs text-slate-800 font-medium flex-1">{children || value || '—'}</span>
    </div>
  );
}
