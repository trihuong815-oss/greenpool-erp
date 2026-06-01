'use client';

// Module Kỹ thuật vận hành — Tab 4: Giao việc · Báo cáo · Đề xuất.
// 3 panel (tabs): Tasks · Reports · Proposals.
// CRUD qua API /api/ky-thuat/work. Status & approval ngay trong panel.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ListTodo, FileText, Lightbulb, Plus, X, Save, Loader2, AlertCircle, CheckCircle2,
  ChevronRight, ArrowLeft, Trash2, Check, XCircle, Calendar, UserCircle2, Banknote,
} from 'lucide-react';
import { workApi } from '@/lib/services/ky-thuat/work-api-client';

type Tab = 'tasks' | 'reports' | 'proposals';
type WorkStatus = 'open' | 'in_progress' | 'done' | 'cancelled' | 'pending_approval' | 'approved' | 'rejected';

export interface WorkRow {
  id: string;
  kind: 'task' | 'report' | 'proposal';
  branchId: string;
  title: string;
  description?: string;
  status: WorkStatus;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  // task — multi-assignee (canonical) + legacy fallback
  assigneeIds?: string[];
  assigneeNames?: string[];
  assigneeId?: string | null;     // legacy
  assigneeName?: string;          // legacy
  priority?: 'low' | 'normal' | 'high';
  specialization?: 'HT' | 'XLN' | null;
  dueDate?: string | null;
  completedAt?: string;
  // report
  reportType?: 'checklist' | 'incident';
  // proposal
  proposalType?: 'expense' | 'professional';
  expenseAmount?: number;
  approvalNotes?: string;
  decidedByName?: string;
  decidedAt?: string;
}

export interface AssigneeOption {
  uid: string;
  displayName: string;
  roleId: string;
  branchId: string | null;
  specialization: 'HT' | 'XLN' | null;
}

interface Props {
  tab: Tab;
  branchId: string | null;
  branchName: string | null;
  visibleBranchIds: string[];
  branchLabels: Record<string, string>;
  tasks: WorkRow[];
  reports: WorkRow[];
  proposals: WorkRow[];
  assignees: AssigneeOption[];
  currentUserId: string;
  myRoleCode: string;
  myRoleSpecialization: 'HT' | 'XLN' | null;
  myBranchId: string | null;
  canCreateTask: boolean;
  canCreateReport: boolean;
  canCreateProposal: boolean;
  /** Khi Firestore composite index đang build — show banner, empty data tạm */
  indexBuilding?: boolean;
}

const STATUS_LABEL: Record<WorkStatus, string> = {
  open: 'Mở', in_progress: 'Đang làm', done: 'Hoàn tất', cancelled: 'Đã huỷ',
  pending_approval: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối',
};
const STATUS_COLOR: Record<WorkStatus, string> = {
  open:             'bg-cyan-50 text-cyan-700 ring-cyan-200',
  in_progress:      'bg-amber-50 text-amber-700 ring-amber-200',
  done:             'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled:        'bg-slate-100 text-slate-500 ring-slate-200',
  pending_approval: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved:         'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected:         'bg-rose-50 text-rose-700 ring-rose-200',
};

function fmtDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtMoney(n: number): string {
  return n.toLocaleString('vi-VN') + ' đ';
}

export function GiaoViecClient(props: Props) {
  const {
    tab, branchId, branchName, visibleBranchIds, branchLabels,
    tasks, reports, proposals, assignees,
    currentUserId, myRoleCode, myRoleSpecialization, myBranchId,
    canCreateTask, canCreateReport, canCreateProposal,
    indexBuilding,
  } = props;
  const router = useRouter();

  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [modal, setModal] = useState<null | 'task' | 'report' | 'proposal'>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function showToast(t: 'success' | 'error', msg: string) {
    setToast({ type: t, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function changeBranch(b: string | null) {
    const params = new URLSearchParams();
    if (b) params.set('branchId', b);
    params.set('tab', tab);
    router.push(`/ky-thuat/giao-viec${params.toString() ? '?' + params.toString() : ''}`);
  }
  function changeTab(t: Tab) {
    const params = new URLSearchParams();
    params.set('tab', t);
    if (branchId) params.set('branchId', branchId);
    router.push(`/ky-thuat/giao-viec?${params.toString()}`);
  }

  // Counters từ 3 list — luôn fresh sau router.refresh
  const counters = useMemo(() => ({
    tasks: tasks.length,
    tasksOpen: tasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
    reports: reports.length,
    proposals: proposals.length,
    proposalsPending: proposals.filter((p) => p.status === 'pending_approval').length,
  }), [tasks, reports, proposals]);

  const currentList = tab === 'tasks' ? tasks : tab === 'reports' ? reports : proposals;

  async function handleTaskStatusChange(row: WorkRow, status: WorkStatus) {
    setBusyId(row.id);
    try {
      await workApi.updateTaskStatus(row.id, status);
      showToast('success', 'Đã đổi trạng thái');
      router.refresh();
    } catch (e: any) {
      showToast('error', e.message);
    } finally { setBusyId(null); }
  }
  async function handleApprove(row: WorkRow, approve: boolean) {
    const notes = approve ? '' : (window.prompt('Lý do từ chối (tuỳ chọn):') ?? '');
    setBusyId(row.id);
    try {
      if (approve) await workApi.approveProposal(row.id, notes);
      else await workApi.rejectProposal(row.id, notes);
      showToast('success', approve ? 'Đã duyệt' : 'Đã từ chối');
      router.refresh();
    } catch (e: any) {
      showToast('error', e.message);
    } finally { setBusyId(null); }
  }
  async function handleDelete(row: WorkRow) {
    if (!confirm(`Xoá "${row.title}"?`)) return;
    setBusyId(row.id);
    try {
      await workApi.remove(row.id);
      showToast('success', 'Đã xoá');
      router.refresh();
    } catch (e: any) {
      showToast('error', e.message);
    } finally { setBusyId(null); }
  }

  return (
    <div className="max-w-7xl mx-auto px-5 py-6">
      {indexBuilding && (
        <div className="mb-4 rounded-lg ring-1 ring-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2 text-amber-900">
          <Loader2 size={16} className="mt-0.5 animate-spin shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">Firestore đang build index</span> — thao tác đầu tiên với module này thường mất 1-3 phút.
            Vui lòng reload sau 1 phút. Trong thời gian chờ, dữ liệu hiển thị tạm thời rỗng.
          </div>
        </div>
      )}

      {/* Branch filter — chỉ show nếu user thấy >1 branch */}
      {visibleBranchIds.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap text-sm">
          <span className="text-slate-500">Cơ sở:</span>
          <button
            onClick={() => changeBranch(null)}
            className={`px-3 py-1.5 rounded-md font-medium ring-1 ${
              !branchId ? 'bg-cyan-600 text-white ring-cyan-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            Toàn bộ
          </button>
          {visibleBranchIds.map((b) => (
            <button
              key={b}
              onClick={() => changeBranch(b)}
              className={`px-3 py-1.5 rounded-md font-medium ring-1 ${
                branchId === b ? 'bg-cyan-600 text-white ring-cyan-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {branchLabels[b] ?? b}
            </button>
          ))}
        </div>
      )}

      {/* Tab selector */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <TabButton active={tab === 'tasks'} onClick={() => changeTab('tasks')} Icon={ListTodo}
          label="Giao việc" count={counters.tasks} badge={counters.tasksOpen} badgeColor="bg-amber-500" />
        <TabButton active={tab === 'reports'} onClick={() => changeTab('reports')} Icon={FileText}
          label="Báo cáo" count={counters.reports} />
        <TabButton active={tab === 'proposals'} onClick={() => changeTab('proposals')} Icon={Lightbulb}
          label="Đề xuất" count={counters.proposals} badge={counters.proposalsPending} badgeColor="bg-rose-500" />

        <div className="flex-1" />

        {tab === 'tasks' && canCreateTask && (
          <button onClick={() => setModal('task')} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold shadow-sm">
            <Plus size={15} /> Giao việc mới
          </button>
        )}
        {tab === 'reports' && canCreateReport && (
          <button onClick={() => setModal('report')} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold shadow-sm">
            <Plus size={15} /> Gửi báo cáo
          </button>
        )}
        {tab === 'proposals' && canCreateProposal && (
          <button onClick={() => setModal('proposal')} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold shadow-sm">
            <Plus size={15} /> Gửi đề xuất
          </button>
        )}
      </div>

      {/* List */}
      <div className="bg-white rounded-lg ring-1 ring-slate-200 shadow-sm overflow-hidden">
        {currentList.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            {tab === 'tasks' && 'Chưa có giao việc nào.'}
            {tab === 'reports' && 'Chưa có báo cáo nào.'}
            {tab === 'proposals' && 'Chưa có đề xuất nào.'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {currentList.map((row) => (
              <WorkRowItem
                key={row.id}
                row={row}
                branchLabels={branchLabels}
                currentUserId={currentUserId}
                myRoleCode={myRoleCode}
                myRoleSpecialization={myRoleSpecialization}
                myBranchId={myBranchId}
                busyId={busyId}
                onTaskStatusChange={handleTaskStatusChange}
                onApprove={handleApprove}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Modals */}
      {modal === 'task' && (
        <TaskModal
          onClose={() => setModal(null)}
          assignees={assignees}
          visibleBranchIds={visibleBranchIds}
          branchLabels={branchLabels}
          defaultBranchId={branchId ?? myBranchId ?? visibleBranchIds[0] ?? null}
          onSaved={() => { setModal(null); router.refresh(); showToast('success', 'Đã giao việc'); }}
          onError={(m) => showToast('error', m)}
        />
      )}
      {modal === 'report' && (
        <ReportModal
          onClose={() => setModal(null)}
          defaultBranchId={branchId ?? myBranchId ?? visibleBranchIds[0] ?? null}
          visibleBranchIds={visibleBranchIds}
          branchLabels={branchLabels}
          onSaved={() => { setModal(null); router.refresh(); showToast('success', 'Đã gửi báo cáo'); }}
          onError={(m) => showToast('error', m)}
        />
      )}
      {modal === 'proposal' && (
        <ProposalModal
          onClose={() => setModal(null)}
          defaultBranchId={branchId ?? myBranchId ?? visibleBranchIds[0] ?? null}
          visibleBranchIds={visibleBranchIds}
          branchLabels={branchLabels}
          onSaved={() => { setModal(null); router.refresh(); showToast('success', 'Đã gửi đề xuất'); }}
          onError={(m) => showToast('error', m)}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg ring-1 inline-flex items-center gap-2 text-sm ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-rose-50 text-rose-800 ring-rose-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─────────── TabButton ───────────
function TabButton(props: {
  active: boolean; onClick: () => void;
  Icon: typeof ListTodo; label: string; count: number;
  badge?: number; badgeColor?: string;
}) {
  const { active, onClick, Icon, label, count, badge, badgeColor } = props;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold ring-1 transition ${
        active ? 'bg-cyan-50 text-cyan-700 ring-cyan-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      <Icon size={15} />
      <span>{label}</span>
      <span className="text-xs text-slate-400">({count})</span>
      {badge !== undefined && badge > 0 && (
        <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold text-white rounded-full px-1 ${badgeColor ?? 'bg-rose-500'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ─────────── Row ───────────
function WorkRowItem(props: {
  row: WorkRow;
  branchLabels: Record<string, string>;
  currentUserId: string;
  myRoleCode: string;
  myRoleSpecialization: 'HT' | 'XLN' | null;
  myBranchId: string | null;
  busyId: string | null;
  onTaskStatusChange: (row: WorkRow, status: WorkStatus) => void;
  onApprove: (row: WorkRow, approve: boolean) => void;
  onDelete: (row: WorkRow) => void;
}) {
  const { row, branchLabels, currentUserId, myRoleCode, myRoleSpecialization, myBranchId, busyId,
    onTaskStatusChange, onApprove, onDelete } = props;
  const busy = busyId === row.id;

  const isAdmin = myRoleCode === 'ADMIN' || myRoleCode === 'CEO' || myRoleCode === 'GD_KD' || myRoleCode === 'GD_VP' || myRoleCode === 'TP_KT';
  const isAdminSystem = myRoleCode === 'ADMIN';
  const isCreator = row.createdBy === currentUserId;
  // Multi-assignee: dùng assigneeIds nếu có, fallback assigneeId (legacy).
  const assigneeIds: string[] = Array.isArray(row.assigneeIds) ? row.assigneeIds
    : (row.assigneeId ? [row.assigneeId] : []);
  const assigneeNames: string[] = Array.isArray(row.assigneeNames) && row.assigneeNames.length > 0 ? row.assigneeNames
    : (row.assigneeName ? [row.assigneeName] : []);
  const isAssignee = assigneeIds.includes(currentUserId);

  // Quyền duyệt proposal: TP_KT/admin any; QLCS branch mình cho expense; PP đúng specialization cho professional
  const canApproveThis = (() => {
    if (row.kind !== 'proposal' || row.status !== 'pending_approval') return false;
    if (isAdmin) return true;
    if (row.proposalType === 'expense') {
      return /^QLCS_/.test(myRoleCode) && myBranchId === row.branchId;
    }
    if (row.proposalType === 'professional') {
      if (row.specialization === 'HT' && myRoleCode === 'PP_HT') return true;
      if (row.specialization === 'XLN' && myRoleCode === 'PP_XLN') return true;
    }
    return false;
  })();

  // Quyền (anh chốt 2026-06-01):
  //  - "Bắt đầu" + "Hoàn thành" → CHỈ assignee (người được giao). ADMIN system bypass cho data lỗi.
  //  - "Huỷ" → creator (rút lệnh) hoặc assignee (từ chối) hoặc ADMIN.
  //  - TP_KT/PP (người giao việc) KHÔNG ấn được Bắt đầu/Hoàn thành.
  const canStartOrComplete = row.kind === 'task' && (isAssignee || isAdminSystem);
  const canCancel = row.kind === 'task' && (isAssignee || isCreator || isAdminSystem);
  const canDelete = isCreator || isAdmin;

  return (
    <li className="p-4 hover:bg-slate-50/50 transition">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${STATUS_COLOR[row.status]}`}>
              {STATUS_LABEL[row.status]}
            </span>
            <span className="text-xs text-slate-500 ring-1 ring-slate-200 bg-slate-50 px-2 py-0.5 rounded-full">
              {branchLabels[row.branchId] ?? row.branchId}
            </span>
            {row.kind === 'task' && row.specialization && (
              <span className="text-xs text-cyan-700 ring-1 ring-cyan-200 bg-cyan-50 px-2 py-0.5 rounded-full">
                {row.specialization === 'HT' ? 'Hệ thống' : 'Xử lý nước'}
              </span>
            )}
            {row.kind === 'task' && row.priority === 'high' && (
              <span className="text-xs text-rose-700 ring-1 ring-rose-200 bg-rose-50 px-2 py-0.5 rounded-full">Ưu tiên cao</span>
            )}
            {row.kind === 'proposal' && row.proposalType && (
              <span className="text-xs text-violet-700 ring-1 ring-violet-200 bg-violet-50 px-2 py-0.5 rounded-full">
                {row.proposalType === 'expense' ? 'Duyệt chi' : 'Chuyên môn'}
              </span>
            )}
            {row.kind === 'report' && row.reportType && (
              <span className="text-xs text-slate-600 ring-1 ring-slate-200 bg-slate-50 px-2 py-0.5 rounded-full">
                {row.reportType === 'incident' ? 'Sự cố' : 'Checklist'}
              </span>
            )}
          </div>

          <div className="font-semibold text-slate-800">{row.title}</div>
          {row.description && (
            <div className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{row.description}</div>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
            <span className="inline-flex items-center gap-1"><UserCircle2 size={13} /> {row.createdByName} ({row.createdByRole})</span>
            <span className="inline-flex items-center gap-1"><Calendar size={13} /> {fmtDateTime(row.createdAt)}</span>
            {row.kind === 'task' && assigneeNames.length > 0 && (
              <span className="inline-flex items-center gap-1 text-cyan-700">→ {assigneeNames.join(', ')}</span>
            )}
            {row.kind === 'task' && row.dueDate && (
              <span className="text-amber-700">Hạn: {row.dueDate}</span>
            )}
            {row.kind === 'proposal' && row.proposalType === 'expense' && (row.expenseAmount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-violet-700"><Banknote size={13} /> {fmtMoney(row.expenseAmount!)}</span>
            )}
          </div>

          {/* Approval result */}
          {row.kind === 'proposal' && (row.status === 'approved' || row.status === 'rejected') && (
            <div className="mt-2 text-xs text-slate-600 bg-slate-50 ring-1 ring-slate-100 rounded p-2">
              <div>
                <span className="font-semibold">{row.status === 'approved' ? 'Duyệt' : 'Từ chối'}:</span> {row.decidedByName} · {fmtDateTime(row.decidedAt)}
              </div>
              {row.approvalNotes && <div className="mt-0.5 italic">"{row.approvalNotes}"</div>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 items-end">
          {row.kind === 'task' && row.status !== 'done' && row.status !== 'cancelled' && (
            <div className="flex gap-1.5">
              {canStartOrComplete && row.status === 'open' && (
                <button disabled={busy} onClick={() => onTaskStatusChange(row, 'in_progress')}
                  className="px-2.5 py-1 text-xs rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50">
                  Bắt đầu
                </button>
              )}
              {canStartOrComplete && (row.status === 'open' || row.status === 'in_progress') && (
                <button disabled={busy} onClick={() => onTaskStatusChange(row, 'done')}
                  className="px-2.5 py-1 text-xs rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50">
                  Hoàn tất
                </button>
              )}
              {canCancel && (
                <button disabled={busy} onClick={() => onTaskStatusChange(row, 'cancelled')}
                  className="px-2.5 py-1 text-xs rounded-md bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200 disabled:opacity-50">
                  Huỷ
                </button>
              )}
            </div>
          )}
          {canApproveThis && (
            <div className="flex gap-1.5">
              <button disabled={busy} onClick={() => onApprove(row, true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <Check size={13} /> Duyệt
              </button>
              <button disabled={busy} onClick={() => onApprove(row, false)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 disabled:opacity-50">
                <XCircle size={13} /> Từ chối
              </button>
            </div>
          )}
          {canDelete && (
            <button disabled={busy} onClick={() => onDelete(row)}
              className="text-xs text-rose-600 hover:text-rose-700 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-50 disabled:opacity-50">
              <Trash2 size={13} /> Xoá
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ─────────── TaskModal ───────────
function TaskModal(props: {
  onClose: () => void;
  assignees: AssigneeOption[];
  visibleBranchIds: string[];
  branchLabels: Record<string, string>;
  defaultBranchId: string | null;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const { onClose, assignees, visibleBranchIds, branchLabels, defaultBranchId, onSaved, onError } = props;
  const [branchId, setBranchId] = useState(defaultBranchId ?? visibleBranchIds[0] ?? 'HM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Multi-assignee (anh chốt 2026-06-01): có thể giao cho nhiều người (vd PP + KTV).
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [specialization, setSpecialization] = useState<'HT' | 'XLN' | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  // KTV/PP filter theo branch + specialization
  const filteredAssignees = useMemo(() => assignees.filter((a) => {
    if (a.branchId !== branchId) return false;
    if (specialization && a.specialization !== specialization) return false;
    return true;
  }), [assignees, branchId, specialization]);

  function toggleAssignee(uid: string) {
    setAssigneeIds((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);
  }

  async function save() {
    if (!title.trim()) { onError('Nhập tiêu đề'); return; }
    if (assigneeIds.length === 0) { onError('Phải chọn ít nhất 1 người được giao'); return; }
    setSaving(true);
    try {
      const chosen = filteredAssignees.filter((x) => assigneeIds.includes(x.uid));
      await workApi.createTask({
        branchId, title: title.trim(), description: description.trim() || undefined,
        assigneeIds: chosen.map((a) => a.uid),
        assigneeNames: chosen.map((a) => a.displayName),
        priority, specialization: specialization || null,
        dueDate: dueDate || null,
      });
      onSaved();
    } catch (e: any) {
      onError(e.message); setSaving(false);
    }
  }

  return (
    <ModalShell title="Giao việc mới" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Cơ sở">
          <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setAssigneeIds([]); }} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
            {visibleBranchIds.map((b) => <option key={b} value={b}>{branchLabels[b] ?? b}</option>)}
          </select>
        </Field>
        <Field label="Tiêu đề công việc *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" placeholder="VD: Kiểm tra bơm chính bể 50m" />
        </Field>
        <Field label="Mô tả">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" placeholder="Chi tiết, lưu ý..." />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Chuyên môn">
            <select value={specialization} onChange={(e) => { setSpecialization(e.target.value as any); setAssigneeIds([]); }}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
              <option value="">— Cả 2 —</option>
              <option value="HT">Hệ thống</option>
              <option value="XLN">Xử lý nước</option>
            </select>
          </Field>
          <Field label="Ưu tiên">
            <select value={priority} onChange={(e) => setPriority(e.target.value as any)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
              <option value="low">Thấp</option>
              <option value="normal">Bình thường</option>
              <option value="high">Cao</option>
            </select>
          </Field>
        </div>
        <Field label="Giao cho (chọn ≥1 người)">
          {filteredAssignees.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">Không có người phù hợp ở cơ sở này.</p>
          ) : (
            <div className="border border-slate-300 rounded-md max-h-48 overflow-auto divide-y divide-slate-100">
              {filteredAssignees.map((a) => {
                const checked = assigneeIds.includes(a.uid);
                return (
                  <label key={a.uid} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 ${checked ? 'bg-cyan-50' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleAssignee(a.uid)} className="rounded" />
                    <span className="flex-1">
                      <span className="font-medium text-slate-800">{a.displayName}</span>
                      <span className="text-xs text-slate-500 ml-2">{a.specialization ?? '—'} · {a.roleId}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {assigneeIds.length > 0 && (
            <p className="text-xs text-cyan-700 mt-1">Đã chọn {assigneeIds.length} người</p>
          )}
        </Field>
        <Field label="Hạn hoàn thành">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={save} saving={saving} />
    </ModalShell>
  );
}

// ─────────── ReportModal ───────────
function ReportModal(props: {
  onClose: () => void;
  defaultBranchId: string | null;
  visibleBranchIds: string[];
  branchLabels: Record<string, string>;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const { onClose, defaultBranchId, visibleBranchIds, branchLabels, onSaved, onError } = props;
  const [branchId, setBranchId] = useState(defaultBranchId ?? visibleBranchIds[0] ?? 'HM');
  const [reportType, setReportType] = useState<'checklist' | 'incident'>('checklist');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) { onError('Nhập tiêu đề'); return; }
    setSaving(true);
    try {
      await workApi.createReport({
        branchId, title: title.trim(), description: description.trim() || undefined,
        reportType,
      });
      onSaved();
    } catch (e: any) {
      onError(e.message); setSaving(false);
    }
  }

  return (
    <ModalShell title="Gửi báo cáo" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Cơ sở">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
            {visibleBranchIds.map((b) => <option key={b} value={b}>{branchLabels[b] ?? b}</option>)}
          </select>
        </Field>
        <Field label="Loại báo cáo">
          <select value={reportType} onChange={(e) => setReportType(e.target.value as any)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
            <option value="checklist">Checklist công việc</option>
            <option value="incident">Sự cố vận hành</option>
          </select>
        </Field>
        <Field label="Tiêu đề *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" placeholder="VD: Báo cáo ca sáng 27/05" />
        </Field>
        <Field label="Nội dung">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={6}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" placeholder="Mô tả chi tiết..." />
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={save} saving={saving} />
    </ModalShell>
  );
}

// ─────────── ProposalModal ───────────
function ProposalModal(props: {
  onClose: () => void;
  defaultBranchId: string | null;
  visibleBranchIds: string[];
  branchLabels: Record<string, string>;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const { onClose, defaultBranchId, visibleBranchIds, branchLabels, onSaved, onError } = props;
  const [branchId, setBranchId] = useState(defaultBranchId ?? visibleBranchIds[0] ?? 'HM');
  const [proposalType, setProposalType] = useState<'expense' | 'professional'>('expense');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) { onError('Nhập tiêu đề'); return; }
    setSaving(true);
    try {
      await workApi.createProposal({
        branchId, title: title.trim(), description: description.trim() || undefined,
        proposalType, expenseAmount: proposalType === 'expense' ? (Number(expenseAmount) || 0) : 0,
      });
      onSaved();
    } catch (e: any) {
      onError(e.message); setSaving(false);
    }
  }

  return (
    <ModalShell title="Gửi đề xuất" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Cơ sở">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
            {visibleBranchIds.map((b) => <option key={b} value={b}>{branchLabels[b] ?? b}</option>)}
          </select>
        </Field>
        <Field label="Loại đề xuất">
          <select value={proposalType} onChange={(e) => setProposalType(e.target.value as any)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
            <option value="expense">Duyệt chi (QLCS duyệt)</option>
            <option value="professional">Chuyên môn (PP/TP duyệt)</option>
          </select>
        </Field>
        <Field label="Tiêu đề *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" placeholder="VD: Xin duyệt mua hoá chất tháng 6" />
        </Field>
        <Field label="Nội dung">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={5}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" placeholder="Lý do, chi tiết..." />
        </Field>
        {proposalType === 'expense' && (
          <Field label="Số tiền dự kiến (VNĐ)">
            <input type="number" min="0" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" placeholder="VD: 5000000" />
          </Field>
        )}
      </div>
      <ModalFooter onClose={onClose} onSave={save} saving={saving} />
    </ModalShell>
  );
}

// ─────────── Common Modal pieces ───────────
function ModalShell(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-800">{props.title}</h3>
          <button onClick={props.onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{props.children}</div>
      </div>
    </div>
  );
}
function ModalFooter(props: { onClose: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-slate-100">
      <button onClick={props.onClose} disabled={props.saving} className="px-4 py-2 text-sm rounded-md ring-1 ring-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        Huỷ
      </button>
      <button onClick={props.onSave} disabled={props.saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-cyan-600 hover:bg-cyan-700 text-white font-semibold disabled:opacity-50">
        {props.saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        Lưu
      </button>
    </div>
  );
}
function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1">{props.label}</span>
      {props.children}
    </label>
  );
}
