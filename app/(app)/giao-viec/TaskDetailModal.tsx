'use client';

import { useEffect, useState } from 'react';
import {
  X, CheckCircle2, XCircle, Loader2, Send, MessageSquare,
  Clock, ArrowRight, CalendarDays, AlertTriangle, Trash2,
  Paperclip, Download,
} from 'lucide-react';
import {
  tasksApi, type Task, type TaskComment, type TaskStatus, type TaskAttachment,
  PROPOSAL_TYPE_LABEL, FINANCIAL_GROUP_LABEL, roleLabelVN,
} from '@/lib/services/tasks/api-client';

interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface User { id: string; name: string; roleId: string; branchId: string | null; departmentId: string | null; }

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending_approval: 'Chá» duyá»t', pending: 'Chá» lÃ m', in_progress: 'Äang lÃ m',
  requested_revision: 'YÃªu cáº§u bá» sung',
  done: 'HoÃ n thÃ nh', rejected: 'Tá»« chá»i', cancelled: 'Huá»·',
};
const STATUS_BG: Record<TaskStatus, string> = {
  pending_approval: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending: 'bg-slate-100 text-slate-700 ring-slate-200',
  in_progress: 'bg-sky-50 text-sky-700 ring-sky-200',
  requested_revision: 'bg-orange-50 text-orange-700 ring-orange-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-50 text-slate-500 ring-slate-200',
};
const PRIORITY_LABEL: Record<string, string> = { low: 'Tháº¥p', normal: 'BÃ¬nh thÆ°á»ng', high: 'Cao', urgent: 'Kháº©n' };

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
    departments, branches, users, onClose, onChange,
  } = props;

  const [task, setTask] = useState<Task>(initialTask);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'approve' | 'reject' | 'status' | 'comment' | 'delete' | 'upload' | 'request-revision'>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [progressInput, setProgressInput] = useState(initialTask.progressPct);
  // Phase 12 â recipient actions cho Äá» xuáº¥t v2
  const [showStartForm, setShowStartForm] = useState(false);
  const [expectedCompletionDate, setExpectedCompletionDate] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionMessage, setRevisionMessage] = useState('');
  // Phase 12.5 â approver action: ghi chÃº khi Duyá»t (optional)
  const [showApprove, setShowApprove] = useState(false);
  const [approveComment, setApproveComment] = useState('');

  const isGD = GD_ROLES.has(currentUserRole);
  const isAdmin = ADMIN.has(currentUserRole);
  // Phase 12.5: currentApprover cÃ³ thá» lÃ  "user:UID" | "role:RC" | legacy "RC"
  const cur = task.currentApprover ?? null;
  const isMyTurnByUid = !!cur && cur.startsWith('user:') && cur.slice(5) === currentUserId;
  const isMyTurnByRole = !!cur && (
    (cur.startsWith('role:') && cur.slice(5) === currentUserRole) ||
    (!cur.startsWith('user:') && !cur.startsWith('role:') && cur === currentUserRole)
  );
  // Phase B.7 phase 2 (2026-06-07): bá» legacy fallback approvalRequiredFrom.
  // Backfill confirmed 0 docs pending_approval cÃ²n dÃ¹ng â currentApprover Äá»§.
  const isMyBlockApprover = isGD && isMyTurnByRole;

  const isCreator = task.createdBy === currentUserId;
  const isAssigneeUser = task.assigneeUserIds.includes(currentUserId);
  const isAssigneeDept = task.assigneeDeptId && task.assigneeDeptId === currentDepartmentId;
  const isAssigneeFacility = task.assigneeFacilityId && task.assigneeFacilityId === currentBranchId;
  // Stability 2026-06-10 v3: PROPOSAL chá» cÃ³ 1 case cáº§n update status:
  //   - creator/admin gá»­i láº¡i sau khi bá» sung (requested_revision â pending_approval)
  // â render block Äá» hiá»n nÃºt "Gá»­i láº¡i sau bá» sung".
  // CÃ¡c tráº¡ng thÃ¡i khÃ¡c cá»§a proposal: KHÃNG cÃ³ nÃºt status (chá» approval block).
  // ASSIGNMENT: giá»¯ logic cÅ© â assignee user/dept/facility tháº¥y nÃºt thá»±c hiá»n.
  const canUpdateStatus = task.kind === 'proposal'
    ? (task.status === 'requested_revision' && (isCreator || isAdmin))
    : (isAssigneeUser || !!isAssigneeDept || !!isAssigneeFacility);

  // Stability 2026-06-10 v5 (anh chá»t): Bá» override â CHá» chÃ­nh chá»§ duyá»t.
  // Chain ai ÄÆ°á»£c chá» Äá»nh thÃ¬ ngÆ°á»i ÄÃ³ duyá»t. ADMIN/CEO khÃ´ng jump vÃ o.
  const canApprove = task.status === 'pending_approval'
    && !isCreator
    && !isAssigneeUser
    && (isMyTurnByUid || isMyBlockApprover);
  const canDelete = isAdmin || isCreator;

  const assigneeLabel = task.assigneeDeptId
    ? departments.find((d) => d.id === task.assigneeDeptId)?.name ?? task.assigneeDeptId
    : task.assigneeFacilityId
      ? branches.find((b) => b.id === task.assigneeFacilityId)?.name ?? task.assigneeFacilityId
      : task.assigneeUserIds.length > 0 ? `${task.assigneeUserIds.length} cÃ¡ nhÃ¢n` : '(chÆ°a gÃ¡n)';

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
    if (!confirm('XoÃ¡ file nÃ y?')) return;
    setBusy('upload');
    try { await tasksApi.deleteAttachment(task.id, path); await refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  async function approve() {
    setBusy('approve');
    try {
      await tasksApi.approve(task.id, approveComment.trim() || undefined);
      setShowApprove(false);
      setApproveComment('');
      await refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  async function reject() {
    if (!rejectReason.trim()) { setError('Vui lÃ²ng nháº­p lÃ½ do tá»« chá»i'); return; }
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
    if (!confirm('XoÃ¡ nhiá»m vá»¥ nÃ y? KhÃ´ng thá» hoÃ n tÃ¡c.')) return;
    setBusy('delete');
    try { await tasksApi.delete(task.id); onChange(); onClose(); }
    catch (e: any) { setError(e.message); setBusy(null); }
  }

  // Phase 12 â Recipient báº¯t Äáº§u thá»±c hiá»n Äá» xuáº¥t (kÃ¨m dá»± kiáº¿n hoÃ n thÃ nh)
  async function startProposal() {
    if (!expectedCompletionDate) { setError('Pháº£i chá»n ngÃ y dá»± kiáº¿n hoÃ n thÃ nh.'); return; }
    setBusy('status');
    try {
      await tasksApi.updateStatus(task.id, { status: 'in_progress', expectedCompletionDate });
      setShowStartForm(false);
      setExpectedCompletionDate('');
      await refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  // Phase 12 â Recipient yÃªu cáº§u creator bá» sung
  async function requestRevision() {
    if (!revisionMessage.trim()) { setError('Pháº£i nháº­p ná»i dung yÃªu cáº§u bá» sung.'); return; }
    setBusy('request-revision');
    try {
      await tasksApi.requestRevision(task.id, revisionMessage.trim());
      setShowRevisionForm(false);
      setRevisionMessage('');
      await refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }


  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full sm:max-w-3xl h-full sm:h-auto sm:max-h-[92vh] sm:rounded-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ring-1 ${STATUS_BG[task.status]}`}>
                  {STATUS_LABEL[task.status]}
                </span>
                {task.crossBlock && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900">LIÃN KHá»I</span>
                )}
                {overdue && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-900">
                    <AlertTriangle size={12} /> QUÃ Háº N
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
              <Loader2 size={20} className="inline animate-spin mr-2" /> Äang táº£iâ¦
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {error && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>
              )}

              {/* ===== INFO HEADER: Má»¥c tiÃªu + ngÆ°á»i tham gia ===== */}

              {/* Goal / Má»¥c tiÃªu náº¿u cÃ³ */}
              {(task as any).goal && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-0.5">Má»¥c tiÃªu</div>
                  <p className="text-sm text-slate-800 font-medium">{(task as any).goal}</p>
                </div>
              )}

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Meta label="NgÆ°á»i táº¡o">{task.createdByName} <span className="text-slate-400">({task.createdByRole})</span></Meta>
                <Meta label="NgÆ°á»i phá»¥ trÃ¡ch">
                  {task.assigneeDeptId
                    ? (departments.find(d => d.id === task.assigneeDeptId)?.name ?? task.assigneeDeptId)
                    : task.assigneeFacilityId
                      ? (branches.find(b => b.id === task.assigneeFacilityId)?.name ?? task.assigneeFacilityId)
                      : task.assigneeUserIds.length > 0
                        ? (
                          <span className="flex flex-col gap-0.5">
                            {task.assigneeUserIds.slice(0, 4).map(uid => {
                              const u = users.find(u => u.id === uid);
                              return <span key={uid} className="inline-flex items-center gap-1"><span className="h-4 w-4 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">{(u?.name ?? uid).charAt(0)}</span>{u?.name ?? uid}</span>;
                            })}
                            {task.assigneeUserIds.length > 4 && <span className="text-slate-400">+{task.assigneeUserIds.length - 4} ngÆ°á»i khÃ¡c</span>}
                          </span>
                        )
                        : <span className="text-slate-400">(chÆ°a gÃ¡n)</span>
                  }
                </Meta>
                <Meta label="Khá»i chá»§ trÃ¬">{task.assigneeBlock}{task.crossBlock && <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">LIÃN KHá»I</span>}</Meta>
                <Meta label="Æ¯u tiÃªn"><PriorityChip p={task.priority} /></Meta>
                <Meta label="Háº¡n chÃ³t">
                  {task.dueDate ? (
                    <span className={`inline-flex items-center gap-1 ${overdue ? 'text-rose-700 font-semibold' : ''}`}>
                      <CalendarDays size={12} /> {task.dueDate}
                      {overdue && <span className="text-xs text-rose-500 font-bold">(QH)</span>}
                    </span>
                  ) : <span className="text-slate-400">â</span>}
                </Meta>
                <Meta label="Tiáº¿n Äá»">
                  <ProgressBar pct={task.progressPct} />
                </Meta>
                <Meta label="Táº¡o lÃºc">{fmtDateTime(task.createdAt)}</Meta>
                <Meta label="Cáº­p nháº­t">{fmtDateTime(task.updatedAt)}</Meta>
              </div>

              {/* ÄÆ¡n vá» phá»i há»£p */}
              {((task as any).collaboratorDeptIds?.length > 0 || (task as any).collaboratorFacilityIds?.length > 0) && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 mb-2">ÄÆ¡n vá» phá»i há»£p</div>
                  <div className="flex flex-wrap gap-1.5">
                    {((task as any).collaboratorDeptIds ?? []).map((id: string) => {
                      const d = departments.find(dep => dep.id === id);
                      return <span key={id} className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">{d?.name ?? id}</span>;
                    })}
                    {((task as any).collaboratorFacilityIds ?? []).map((id: string) => {
                      const b = branches.find(br => br.id === id);
                      return <span key={id} className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold">{b?.name ?? id}</span>;
                    })}
                  </div>
                </div>
              )}

              {/* Phase 12.5 â Luá»ng duyá»t Äá» xuáº¥t (chain) â entry: "user:UID" | "role:RC" | legacy "RC" */}
              {task.kind === 'proposal' && task.approvalChain && task.approvalChain.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-2">Luá»ng duyá»t ({task.approvalChain.length} cáº¥p)</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {task.approvalChain.map((entry, i) => {
                      // Parse entry: user:UID | role:RC | legacy RC
                      const isUserEntry = entry.startsWith('user:');
                      const isRoleEntry = entry.startsWith('role:');
                      const uid = isUserEntry ? entry.slice(5) : null;
                      const roleCode = isRoleEntry ? entry.slice(5) : (!isUserEntry ? entry : null);
                      // TÃ¬m display name: náº¿u user â tÃªn user; náº¿u role â label role
                      const user = uid ? users.find((u) => u.id === uid) : null;
                      const display = user
                        ? `${user.name} (${user.roleId})`
                        : roleCode ? roleLabelVN(roleCode) : entry;
                      // Match completed: check uid match HOáº¶C role match (legacy)
                      const done = (task.approvalsCompleted ?? []).find((s) => {
                        if (uid && s.uid === uid) return true;
                        if (roleCode && s.role === roleCode) return true;
                        return false;
                      });
                      const isCurrent = task.currentApprover === entry && !done;
                      return (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-400">{i + 1}.</span>
                          <div className={`px-2.5 py-1 rounded-md text-xs font-semibold ring-1 ${
                            done ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : isCurrent ? 'bg-amber-50 text-amber-700 ring-amber-300 animate-pulse'
                            : 'bg-slate-50 text-slate-500 ring-slate-200'
                          }`}>
                            {done ? 'â ' : isCurrent ? 'â³ ' : ''}{display}
                            {done && done.name && !user && <span className="ml-1 font-normal text-emerald-600">Â· {done.name}</span>}
                          </div>
                          {i < task.approvalChain!.length - 1 && <ArrowRight size={12} className="text-slate-400" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Phase 12 â Lá»ch sá»­ yÃªu cáº§u bá» sung (náº¿u cÃ³) */}
              {task.revisionRequests && task.revisionRequests.length > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-3 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-orange-700">YÃªu cáº§u bá» sung tá»« ngÆ°á»i nháº­n</div>
                  {task.revisionRequests.slice(-3).map((r, i) => (
                    <div key={i} className="text-sm text-slate-700 border-l-2 border-orange-300 pl-2">
                      <div className="font-medium text-orange-800">{r.name} <span className="text-xs text-slate-400 font-normal">Â· {fmtDateTime(r.requestedAt)}</span></div>
                      <div className="text-sm whitespace-pre-wrap">{r.message}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Phase 12 â Dá»± kiáº¿n hoÃ n thÃ nh (recipient set khi in_progress) */}
              {task.kind === 'proposal' && task.expectedCompletionDate && (
                <div className="rounded-lg border border-sky-200 bg-sky-50/40 px-3 py-2 text-sm flex items-center gap-2">
                  <CalendarDays size={14} className="text-sky-600" />
                  <span className="text-slate-600">Dá»± kiáº¿n hoÃ n thÃ nh:</span>
                  <span className="font-semibold text-sky-800">{task.expectedCompletionDate}</span>
                </div>
              )}

              {/* Phase 12.9 (2026-06-04): tier (peer/senior) cho doc má»i */}
              {task.kind === 'proposal' && (task as any).recipientTier && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 flex items-center gap-3 flex-wrap">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-0.5">Äá»i tÆ°á»£ng Äá» xuáº¥t</div>
                    <div className="text-sm font-semibold text-slate-800">
                      {(task as any).recipientTier === 'peer' ? 'â Ngang cáº¥p' : 'â Cáº¥p trÃªn'}
                    </div>
                  </div>
                </div>
              )}

              {/* LEGACY (Phase 12.8 doc cÅ©): scope + subtype + recipient */}
              {task.kind === 'proposal' && !((task as any).recipientTier) && (task as any).proposalScope && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 flex items-center gap-3 flex-wrap">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-0.5">Loáº¡i Äá» xuáº¥t</div>
                    <div className="text-sm font-semibold text-slate-800">
                      {(task as any).proposalScope === 'in_block' ? 'ð  Trong khá»i' : 'ð LiÃªn khá»i'}
                    </div>
                  </div>
                  {(task as any).proposalScope === 'cross_block' && (task as any).proposalSubtype && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-0.5">TÃ­nh cháº¥t</div>
                      <div className="text-sm font-medium text-slate-700">
                        {(task as any).proposalSubtype === 'regular' ? 'ThÆ°á»ng xuyÃªn' : 'PhÃ¡t sinh (qua GÄ khá»i)'}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* LEGACY (doc cÅ© trÆ°á»c 2026-06-04): ná»i dung + nhÃ³m chi + chi phÃ­ */}
              {task.kind === 'proposal' && task.proposalType && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 flex items-center gap-3 flex-wrap">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-0.5">Ná»i dung Äá» xuáº¥t</div>
                    <div className="text-sm font-semibold text-slate-800">{PROPOSAL_TYPE_LABEL[task.proposalType]}</div>
                  </div>
                  {task.proposalType === 'tai_chinh' && task.financialGroup && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-0.5">NhÃ³m chi</div>
                      <div className="text-sm font-medium text-slate-700">{FINANCIAL_GROUP_LABEL[task.financialGroup]}</div>
                    </div>
                  )}
                  {task.estimatedCost != null && task.estimatedCost > 0 && (
                    <div className="ml-auto text-right">
                      <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-0.5">Chi phÃ­ dá»± kiáº¿n</div>
                      <div className="text-sm font-bold text-amber-800 tabular-nums">{task.estimatedCost.toLocaleString('vi-VN')}â«</div>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              {task.description && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">MÃ´ táº£</div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              {/* Status update controls */}
              {canUpdateStatus && !['rejected', 'cancelled'].includes(task.status) && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Cáº­p nháº­t tráº¡ng thÃ¡i</div>
                  {task.status === 'in_progress' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-slate-600 shrink-0">Tiáº¿n Äá»:</label>
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
                      >LÆ°u %</button>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {/* Äá» xuáº¥t: báº¯t Äáº§u pháº£i nháº­p "dá»± kiáº¿n hoÃ n thÃ nh" â má» form */}
                    {task.status === 'pending' && task.kind === 'proposal' && (
                      <button disabled={!!busy} onClick={() => setShowStartForm(true)} className={btnPrimary}>
                        <Clock size={14} /> Báº¯t Äáº§u thá»±c hiá»n
                      </button>
                    )}
                    {/* Giao viá»c thÆ°á»ng: báº¯t Äáº§u trá»±c tiáº¿p */}
                    {task.status === 'pending' && task.kind !== 'proposal' && (
                      <button disabled={!!busy} onClick={() => changeStatus('in_progress', task.progressPct || 10)} className={btnPrimary}>
                        <Clock size={14} /> Báº¯t Äáº§u
                      </button>
                    )}
                    {/* Äá» xuáº¥t: recipient cÃ³ thá» yÃªu cáº§u bá» sung */}
                    {(task.status === 'pending' || task.status === 'in_progress') && task.kind === 'proposal' && !isCreator && (
                      <button disabled={!!busy} onClick={() => setShowRevisionForm(true)} className={btnSecondary}>
                        <AlertTriangle size={14} /> YÃªu cáº§u bá» sung
                      </button>
                    )}
                    {(task.status === 'pending' || task.status === 'in_progress') && (
                      <button disabled={!!busy} onClick={() => changeStatus('done')} className={btnSuccess}>
                        <CheckCircle2 size={14} /> HoÃ n thÃ nh
                      </button>
                    )}
                    {/* Äá» xuáº¥t á» requested_revision: creator bá» sung xong gá»­i láº¡i */}
                    {task.status === 'requested_revision' && task.kind === 'proposal' && (isCreator || isAdmin) && (
                      <button disabled={!!busy} onClick={() => changeStatus('pending')} className={btnPrimary}>
                        <Send size={14} /> Gá»­i láº¡i sau bá» sung
                      </button>
                    )}
                    {task.status === 'in_progress' && task.kind !== 'proposal' && (
                      <button disabled={!!busy} onClick={() => changeStatus('pending')} className={btnSecondary}>
                        Táº¡m dá»«ng
                      </button>
                    )}
                    {(task.status === 'pending' || task.status === 'in_progress') && (isCreator || isAdmin) && (
                      <button disabled={!!busy} onClick={() => changeStatus('cancelled')} className={btnDanger}>
                        Huá»·
                      </button>
                    )}
                    {task.status === 'done' && isAdmin && (
                      <button disabled={!!busy} onClick={() => changeStatus('in_progress', 50)} className={btnSecondary}>
                        Má» láº¡i
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Phase 12 â Form "Báº¯t Äáº§u thá»±c hiá»n" cho recipient (Äá» xuáº¥t) */}
              {showStartForm && (
                <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50/60 p-3 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                    <Clock size={12} /> Báº¯t Äáº§u thá»±c hiá»n Äá» xuáº¥t
                  </div>
                  <p className="text-xs text-slate-600">Vui lÃ²ng nháº­p ngÃ y dá»± kiáº¿n hoÃ n thÃ nh Äá» ngÆ°á»i gá»­i biáº¿t.</p>
                  <input
                    type="date"
                    value={expectedCompletionDate}
                    onChange={(e) => setExpectedCompletionDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="w-full text-sm border border-emerald-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-emerald-400 outline-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowStartForm(false); setExpectedCompletionDate(''); }} className={btnSecondary}>Há»§y</button>
                    <button disabled={busy === 'status' || !expectedCompletionDate} onClick={startProposal} className={btnPrimary}>
                      {busy === 'status' && <Loader2 size={14} className="animate-spin" />}
                      <Clock size={14} /> XÃ¡c nháº­n báº¯t Äáº§u
                    </button>
                  </div>
                </div>
              )}

              {/* Approval block â chÃ­nh chá»§ duyá»t (bá» override theo spec anh 2026-06-10). */}
              {canApprove && (
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50/60 p-3 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1 text-amber-800">
                    <AlertTriangle size={12} /> Äáº¿n lÆ°á»£t báº¡n duyá»t
                  </div>

                  {/* IDLE: 3 nÃºt cho proposal (Duyá»t/Bá» sung/Tá»« chá»i) hoáº·c
                      2 nÃºt cho assignment (Duyá»t/Tá»« chá»i â khÃ´ng cÃ³ Bá» sung). */}
                  {!showApprove && !showReject && !showRevisionForm && (
                    <div className={`grid gap-2 ${task.kind === 'proposal' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <button onClick={() => setShowApprove(true)} className={btnSuccess}>
                        <CheckCircle2 size={14} /> Duyá»t
                      </button>
                      {task.kind === 'proposal' && (
                        <button onClick={() => setShowRevisionForm(true)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-sm">
                          <AlertTriangle size={14} /> Bá» sung
                        </button>
                      )}
                      <button onClick={() => setShowReject(true)} className={btnDanger}>
                        <XCircle size={14} /> Tá»« chá»i
                      </button>
                    </div>
                  )}

                  {/* DUYá»T â ghi chÃº optional */}
                  {showApprove && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-emerald-800">Ghi chÃº khi duyá»t (tuá»³ chá»n)</div>
                      <textarea
                        value={approveComment}
                        onChange={(e) => setApproveComment(e.target.value)}
                        placeholder="Vd: Äá»ng Ã½ phÆ°Æ¡ng Ã¡n, lÆ°u Ã½ ... (cÃ³ thá» bá» trá»ng)"
                        rows={2}
                        maxLength={1000}
                        className="w-full text-sm border border-emerald-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-400 outline-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowApprove(false); setApproveComment(''); }} className={btnSecondary}>Huá»·</button>
                        <button disabled={busy === 'approve'} onClick={approve} className={btnSuccess}>
                          {busy === 'approve' && <Loader2 size={14} className="animate-spin" />}
                          <CheckCircle2 size={14} /> XÃ¡c nháº­n duyá»t
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Bá» SUNG â yÃªu cáº§u creator chá»nh sá»­a, gá»­i láº¡i */}
                  {showRevisionForm && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-orange-800">Ná»i dung cáº§n bá» sung (báº¯t buá»c)</div>
                      <p className="text-xs text-slate-600">Äá» xuáº¥t sáº½ chuyá»n tráº¡ng thÃ¡i "YÃªu cáº§u bá» sung". NgÆ°á»i táº¡o bá» sung rá»i gá»­i láº¡i cho báº¡n duyá»t.</p>
                      <textarea
                        value={revisionMessage}
                        onChange={(e) => setRevisionMessage(e.target.value)}
                        placeholder="NÃªu rÃµ thÃ´ng tin/chi tiáº¿t cáº§n bá» sung..."
                        rows={3}
                        maxLength={1000}
                        className="w-full text-sm border border-orange-300 rounded-lg p-2 focus:ring-2 focus:ring-orange-400 outline-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowRevisionForm(false); setRevisionMessage(''); }} className={btnSecondary}>Huá»·</button>
                        <button disabled={busy === 'request-revision' || !revisionMessage.trim()} onClick={requestRevision} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-sm disabled:opacity-50">
                          {busy === 'request-revision' && <Loader2 size={14} className="animate-spin" />}
                          <AlertTriangle size={14} /> Gá»­i yÃªu cáº§u
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tá»ª CHá»I â lÃ½ do báº¯t buá»c */}
                  {showReject && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-rose-800">LÃ½ do tá»« chá»i (báº¯t buá»c)</div>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="LÃ½ do tá»« chá»i Äá» xuáº¥t..."
                        rows={2}
                        maxLength={1000}
                        className="w-full text-sm border border-rose-300 rounded-lg p-2 focus:ring-2 focus:ring-rose-400 outline-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowReject(false); setRejectReason(''); }} className={btnSecondary}>Huá»·</button>
                        <button disabled={busy === 'reject' || !rejectReason.trim()} onClick={reject} className={btnDanger}>
                          {busy === 'reject' && <Loader2 size={14} className="animate-spin" />}
                          <XCircle size={14} /> XÃ¡c nháº­n tá»« chá»i
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Form "YÃªu cáº§u bá» sung" CHO RECIPIENT (Äá» xuáº¥t ÄÃ£ duyá»t â recipient yÃªu cáº§u creator bá» sung) */}
              {!canApprove && showRevisionForm && (
                <div className="rounded-lg border-2 border-orange-300 bg-orange-50/60 p-3 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-orange-800 flex items-center gap-1">
                    <AlertTriangle size={12} /> YÃªu cáº§u ngÆ°á»i gá»­i bá» sung
                  </div>
                  <p className="text-xs text-slate-600">Äá» xuáº¥t sáº½ chuyá»n vá» tráº¡ng thÃ¡i "YÃªu cáº§u bá» sung". NgÆ°á»i gá»­i nháº­n thÃ´ng bÃ¡o + bá» sung rá»i gá»­i láº¡i.</p>
                  <textarea
                    value={revisionMessage}
                    onChange={(e) => setRevisionMessage(e.target.value)}
                    placeholder="NÃªu rÃµ thÃ´ng tin cáº§n bá» sung..."
                    rows={3}
                    maxLength={1000}
                    className="w-full text-sm border border-orange-300 rounded-lg p-2 focus:ring-2 focus:ring-orange-400 outline-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowRevisionForm(false); setRevisionMessage(''); }} className={btnSecondary}>Há»§y</button>
                    <button disabled={busy === 'request-revision' || !revisionMessage.trim()} onClick={requestRevision} className={btnDanger}>
                      {busy === 'request-revision' && <Loader2 size={14} className="animate-spin" />}
                      <AlertTriangle size={14} /> Gá»­i yÃªu cáº§u
                    </button>
                  </div>
                </div>
              )}

              {task.status === 'rejected' && task.rejectionReason && (
                <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-800 mb-1">LÃ½ do tá»« chá»i</div>
                  <p className="text-sm text-rose-900">{task.rejectionReason}</p>
                </div>
              )}

              {/* Attachments */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <Paperclip size={12} /> File ÄÃ­nh kÃ¨m ({attachments.length})
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
                          <span className="text-xs text-slate-400 tabular-nums shrink-0">
                            {(a.size / 1024).toFixed(0)} KB
                          </span>
                          <span className="text-xs text-slate-400 truncate shrink-0 max-w-[100px]">{a.uploadedByName}</span>
                          {a.downloadUrl && (
                            <a href={a.downloadUrl} target="_blank" rel="noreferrer"
                              className="p-1 text-slate-400 hover:text-emerald-700"
                              title="Táº£i xuá»ng"
                            >
                              <Download size={12} />
                            </a>
                          )}
                          {canDel && (
                            <button
                              onClick={() => deleteAttachment(a.path)}
                              disabled={busy === 'upload'}
                              className="p-1 text-slate-400 hover:text-rose-600"
                              title="XoÃ¡"
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
                  {busy === 'upload' ? 'Äang upload...' : 'ÄÃ­nh kÃ¨m file'}
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
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <MessageSquare size={12} /> Lá»ch sá»­ & Trao Äá»i ({comments.length})
                </div>
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {comments.map((c) => (
                    <CommentRow key={c.id} c={c} />
                  ))}
                  {comments.length === 0 && (
                    <div className="text-xs text-slate-400 text-center py-3">ChÆ°a cÃ³ hoáº¡t Äá»ng</div>
                  )}
                </div>
                {/* New comment â textarea multiline Äá» ná»i dung dÃ i xuá»ng dÃ²ng + scroll trong Ã´ */}
                <div className="mt-3 flex gap-2 items-end">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
                    placeholder="Nháº­p trao Äá»iâ¦ (Enter Äá» gá»­i, Shift+Enter xuá»ng dÃ²ng)"
                    rows={2}
                    maxLength={2000}
                    className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-400 outline-none resize-y min-h-[60px] max-h-48"
                  />
                  <button
                    disabled={!newComment.trim() || busy === 'comment'}
                    onClick={postComment}
                    className="px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1 shrink-0"
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
                <Trash2 size={12} /> XoÃ¡ nhiá»m vá»¥
              </button>
            )}
          </div>
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">ÄÃ³ng</button>
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
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-0.5">{label}</div>
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
  created: { icon: 'â¨', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  approval: { icon: 'â', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  rejection: { icon: 'â', bg: 'bg-rose-50', text: 'text-rose-700' },
  status_change: { icon: 'â»', bg: 'bg-sky-50', text: 'text-sky-700' },
  comment: { icon: 'ð¬', bg: 'bg-slate-50', text: 'text-slate-700' },
};

function CommentRow({ c }: { c: TaskComment }) {
  const k = COMMENT_KIND_ICON[c.kind] ?? COMMENT_KIND_ICON.comment;
  const isEvent = c.kind !== 'comment';
  return (
    <div className={`flex items-start gap-2 p-2 rounded-lg ${isEvent ? k.bg : 'bg-white border border-slate-100'}`}>
      <span className={`text-sm shrink-0 ${k.text}`}>{k.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 text-xs">
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

// Re-export ArrowRight Äá» avoid unused lint
export type { Task };
void ArrowRight;
