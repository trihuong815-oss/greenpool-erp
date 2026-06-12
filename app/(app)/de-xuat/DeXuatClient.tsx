'use client';

// Phase Mock-Frame-5 (2026-06-12): trang Đề xuất tách riêng khỏi /giao-viec.
// Lọc kind='proposal' qua API + 4 tab phân loại theo tier:
//   - Tất cả
//   - Đề xuất lên trên: recipient role có tier "cao hơn" creator
//   - Ngang cấp: cùng tier
//   - Liên khối: crossBlock=true
// Reuse TaskCreateModal (force kind='proposal') + TaskDetailModal.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, Loader2, Inbox, ArrowUpFromLine, ArrowLeftRight, GitBranch, RefreshCw, ChevronRight } from 'lucide-react';
import { tasksApi, type Task, type TaskStatus, PROPOSAL_TYPE_LABEL } from '@/lib/services/tasks/api-client';
import TaskCreateModalBase from '../giao-viec/TaskCreateModal';
const TaskCreateModal = TaskCreateModalBase as any;
import TaskDetailModalBase from '../giao-viec/TaskDetailModal';
const TaskDetailModal = TaskDetailModalBase as any;

interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface User { id: string; name: string; roleId: string; branchId: string | null; departmentId: string | null; }

interface Props {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  currentBranchId: string | null;
  currentDepartmentId: string | null;
  departments: Department[];
  branches: Branch[];
  users: User[];
}

type TabKey = 'all' | 'up' | 'peer' | 'cross';

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending_approval: 'Chờ duyệt',
  pending: 'Chờ làm',
  in_progress: 'Đang làm',
  requested_revision: 'Yêu cầu bổ sung',
  done: 'Hoàn thành',
  rejected: 'Từ chối',
  cancelled: 'Huỷ',
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

/** Role tier — nhỏ = cao. Dùng phân loại "Đề xuất lên trên" vs "Ngang cấp". */
const ROLE_TIER: Record<string, number> = {
  CEO: 1, ADMIN: 1,
  GD_KD: 2, GD_VP: 2,
  TP_KE: 3, TP_KT: 3, TP_DT: 3, TP_NS: 3, TP_MKT: 3, TP_GS: 3,
  QLCS_HM: 3, QLCS_TK: 3, QLCS_CTT: 3, QLCS_24NCT: 3, QLCS_TT: 3,
  PP_HT: 4, PP_XLN: 4,
  TT_DT: 4, TT_LT: 4, TT_AS: 4, TIBAN_TT: 4,
};
function tierOf(role: string): number { return ROLE_TIER[role] ?? 5; }

export function DeXuatClient(props: Props) {
  const { currentUserId, currentUserName, currentUserRole, currentBranchId, currentDepartmentId, departments, branches, users } = props;

  const [tab, setTab] = useState<TabKey>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const searchParams = useSearchParams();
  useEffect(() => {
    const taskIdParam = searchParams.get('taskId');
    if (taskIdParam) {
      tasksApi.get(taskIdParam)
        .then((t) => { if (t.kind === 'proposal') setSelectedTask(t); })
        .catch(() => {});
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    tasksApi.list({ mode: 'all', kind: 'proposal', q: keyword || undefined, status: statusFilter === 'all' ? undefined : statusFilter })
      .then((rows) => { if (!cancelled) setTasks(rows); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Lỗi tải đề xuất'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [keyword, statusFilter, refreshKey]);

  // Lookup role của recipient (assigneeUserIds[0]) để classify tier
  function recipientRole(t: Task): string {
    const uid = t.assigneeUserIds?.[0];
    if (!uid) return '';
    return users.find((u) => u.id === uid)?.roleId ?? '';
  }

  function classify(t: Task): TabKey {
    if (t.crossBlock) return 'cross';
    const ct = tierOf(t.createdByRole);
    const rt = tierOf(recipientRole(t));
    if (rt > 0 && rt < ct) return 'up';
    return 'peer';
  }

  const filtered = useMemo(() => {
    if (tab === 'all') return tasks;
    return tasks.filter((t) => classify(t) === tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, tab, users]);

  const counts = useMemo(() => {
    const c = { all: tasks.length, up: 0, peer: 0, cross: 0 };
    for (const t of tasks) {
      const k = classify(t);
      if (k === 'up') c.up++;
      else if (k === 'peer') c.peer++;
      else if (k === 'cross') c.cross++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, users]);

  const TABS: { key: TabKey; label: string; icon: any }[] = [
    { key: 'all',   label: 'Tất cả',          icon: Inbox },
    { key: 'up',    label: 'Đề xuất lên trên', icon: ArrowUpFromLine },
    { key: 'peer',  label: 'Ngang cấp',        icon: ArrowLeftRight },
    { key: 'cross', label: 'Liên khối',        icon: GitBranch },
  ];

  function recipientLabel(t: Task): string {
    const uid = t.assigneeUserIds?.[0];
    if (uid) return users.find((u) => u.id === uid)?.name ?? '—';
    if (t.assigneeDeptId) return departments.find((d) => d.id === t.assigneeDeptId)?.name ?? t.assigneeDeptId;
    if (t.assigneeFacilityId) return branches.find((b) => b.id === t.assigneeFacilityId)?.name ?? t.assigneeFacilityId;
    return '—';
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900">Đề xuất</h2>
          <p className="text-xs text-slate-500 mt-0.5">Tổng {tasks.length} đề xuất · {counts.up} lên trên · {counts.peer} ngang cấp · {counts.cross} liên khối</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Làm mới">
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 shadow-sm"
          >
            <Plus size={15} /> Tạo đề xuất
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          const badge = counts[key];
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-600 hover:text-slate-800'
              }`}
            >
              <Icon size={14} /> {label}
              {badge > 0 && (
                <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm kiếm…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
        >
          <option value="all">Tất cả trạng thái</option>
          {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex items-center justify-center text-slate-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Đang tải…
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm text-rose-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-4xl mb-2">📭</div>
            <p className="text-sm text-slate-500">Chưa có đề xuất nào.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="px-3 py-2.5">Đề xuất</th>
                  <th className="px-3 py-2.5">Người gửi</th>
                  <th className="px-3 py-2.5">Loại</th>
                  <th className="px-3 py-2.5">Người nhận</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-3 py-2.5 text-right">Ngày tạo</th>
                  <th className="px-1 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const typeLabel = t.proposalType ? PROPOSAL_TYPE_LABEL[t.proposalType] : (t.crossBlock ? 'Liên khối' : '—');
                  const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTask(t)}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800 line-clamp-1">{t.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">#{t.id.slice(0, 8).toUpperCase()}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{t.createdByName}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{recipientLabel(t)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ring-1 ${STATUS_BG[t.status]}`}>
                          {STATUS_LABEL[t.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{dateStr}</td>
                      <td className="px-1 py-2.5">
                        <ChevronRight size={14} className="text-slate-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modals */}
      {showCreate && (
        <TaskCreateModal
          kind="proposal"
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          currentBranchId={currentBranchId}
          currentDepartmentId={currentDepartmentId}
          departments={departments}
          branches={branches}
          users={users as any}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          currentUserRole={currentUserRole}
          currentDepartmentId={currentDepartmentId}
          currentBranchId={currentBranchId}
          departments={departments}
          branches={branches}
          users={users as any}
          onClose={() => setSelectedTask(null)}
          onChange={refresh}
        />
      )}
    </div>
  );
}
