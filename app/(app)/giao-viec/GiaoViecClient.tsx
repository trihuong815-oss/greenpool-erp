'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, Search, X, ListChecks, Inbox, Send, ShieldCheck,
  Loader2, ArrowRight, CalendarDays, AlertTriangle, CheckCircle2,
  Clock, LayoutGrid, GitBranch, List as ListIcon, TrendingUp, Users2,
  type LucideIcon,
} from 'lucide-react';
import { tasksApi, type Task, type TaskListMode, type TaskStatus, type TaskKind } from '@/lib/services/tasks/api-client';
import { TaskCreateModal } from './TaskCreateModal';
import { TaskDetailModal } from './TaskDetailModal';

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

type TabKey = 'received' | 'proposal' | 'assignment' | 'approval' | 'lien-khoi';
type ViewMode = 'list' | 'kanban' | 'flow';

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
const PRIORITY_LABEL: Record<string, string> = {
  low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn',
};
const PRIORITY_HEX: Record<string, string> = {
  low: '#94a3b8', normal: '#0ea5e9', high: '#f59e0b', urgent: '#ef4444',
};

const ADMIN_ROLES = new Set(['ADMIN', 'CEO', 'GD_KD', 'GD_VP']);
const GD_ROLES = new Set(['GD_KD', 'GD_VP']);

export function GiaoViecClient(props: Props) {
  const {
    currentUserId, currentUserName, currentUserRole,
    currentBranchId, currentDepartmentId,
    departments, branches, users,
  } = props;

  const canCreate = !/^(NV_|GV_|TT_)/.test(currentUserRole); // NV/GV/TT không tạo
  const isGD = GD_ROLES.has(currentUserRole);
  const isCEO = currentUserRole === 'CEO'; // CHỈ CEO thuần (không gồm ADMIN — anh chốt 2026-06-05)
  const isAdmin = currentUserRole === 'ADMIN';
  const showApprovalTab = isGD || isCEO || isAdmin;
  // Phase 12.9: GĐ Khối + CEO/ADMIN có "Giao việc" (giao xuống cấp dưới).
  // TP/QLCS chỉ dùng "Đề xuất". CEO/Chủ tịch không tạo Đề xuất (top); ADMIN có (dưới CEO trong CTY).
  const canCreateAssignment = isGD || isCEO || isAdmin;
  const canCreateProposal = canCreate && !isCEO; // ADMIN được tạo đề xuất
  const showAssignmentTab = isGD || isCEO || isAdmin; // ẩn tab Giao việc cho TP/QLCS
  const showLienKhoiTab = isCEO || isAdmin; // chỉ CEO/ADMIN thấy tổng quan liên khối

  const [tab, setTab] = useState<TabKey>('received');
  const tabSectionRef = useRef<HTMLElement | null>(null);

  // Khi user click vào CategoryCard hoặc TabButton — đổi tab + scroll tới list view
  function jumpToTab(t: TabKey) {
    setTab(t);
    // Defer scroll để state đã update + DOM re-render
    requestAnimationFrame(() => {
      tabSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  const [view, setView] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');

  // Deep-link: Dashboard tile click → /giao-viec?focus=<type> → tự jump tab + filter
  // Phase Stability 2026-06-09: thêm ?taskId=XXX → auto fetch + mở TaskDetailModal
  const searchParams = useSearchParams();
  useEffect(() => {
    const focus = searchParams.get('focus');
    const taskIdParam = searchParams.get('taskId');
    if (focus === 'approval' && showApprovalTab) { setTab('approval'); setStatusFilter('all'); }
    else if (focus === 'received')   { setTab('received'); setStatusFilter('all'); }
    else if (focus === 'pending')    { setTab('received'); setStatusFilter('pending'); }
    else if (focus === 'inprogress') { setTab('received'); setStatusFilter('in_progress'); }
    if (focus) {
      requestAnimationFrame(() => {
        tabSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    // Auto open modal nếu có taskId trong URL (deep-link từ noti)
    if (taskIdParam) {
      // Default tab=approval cho GĐ/CEO/ADMIN nếu chưa set
      if (showApprovalTab && !focus) setTab('approval');
      tasksApi.get(taskIdParam)
        .then((t) => setSelectedTask(t))
        .catch((e) => console.warn('[deep-link taskId] fetch fail:', e?.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvalCount, setApprovalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState<null | TaskKind>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Map tab → mode + kind filter
  const mode: TaskListMode =
    tab === 'received' ? 'assigned'
    : tab === 'approval' ? 'pending_approval'
    : 'created';   // proposal + assignment đều là tasks tôi tạo, khác nhau ở kind
  const kindFilter: TaskKind | undefined =
    tab === 'proposal' ? 'proposal' : tab === 'assignment' ? 'assignment' : undefined;

  // Load tasks for current tab
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    tasksApi.list({
      mode,
      status: statusFilter === 'all' ? undefined : statusFilter,
      kind: kindFilter,
      q: keyword || undefined,
    })
      .then((rows) => { if (!cancelled) setTasks(rows); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode, kindFilter, statusFilter, keyword, refreshKey]);

  // Load approval count (badge cho tab) — chỉ GD/CEO
  useEffect(() => {
    if (!showApprovalTab) return;
    let cancelled = false;
    tasksApi.list({ mode: 'pending_approval' })
      .then((rows) => { if (!cancelled) setApprovalCount(rows.length); })
      .catch((e) => {
        // KHÔNG silent — log để dev biết approval count đang sai. UI giữ giá trị cũ
        // thay vì reset 0 (tránh user tưởng không còn gì cần duyệt).
        console.warn('[GiaoViec] load approval count fail:', e?.message ?? e);
      });
    return () => { cancelled = true; };
  }, [showApprovalTab, refreshKey]);

  function refresh() { setRefreshKey((k) => k + 1); }

  // ===== STATS — tổng quan trên cùng =====
  // Lấy "all" tasks (theo scope, không filter status/keyword) để vẽ stats + chart
  const [statsTasks, setStatsTasks] = useState<Task[]>([]);
  useEffect(() => {
    let cancelled = false;
    tasksApi.list({ mode: 'all' })
      .then((rows) => { if (!cancelled) setStatsTasks(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);

  const stats = useMemo(() => {
    const total = statsTasks.length;
    const byStatus = {
      pending_approval: 0, pending: 0, in_progress: 0, done: 0, rejected: 0, cancelled: 0,
    } as Record<TaskStatus, number>;
    let overdue = 0;
    const today = new Date().toISOString().slice(0, 10);
    statsTasks.forEach((t) => {
      byStatus[t.status]++;
      if (t.dueDate && t.dueDate < today && !['done', 'cancelled', 'rejected'].includes(t.status)) overdue++;
    });
    const finished = byStatus.done;
    const inflight = byStatus.pending + byStatus.in_progress + byStatus.pending_approval;
    const doneRate = total > 0 ? Math.round((finished / total) * 100) : 0;
    return { total, byStatus, overdue, finished, inflight, doneRate };
  }, [statsTasks]);

  // ===== STATS theo 3 nhóm: Nhiệm vụ nhận / Đề xuất tôi tạo / Giao việc tôi giao =====
  const statsByCategory = useMemo(() => {
    const empty = () => ({
      total: 0, pending_approval: 0, pending: 0, in_progress: 0, done: 0, overdue: 0,
    });
    const out = { received: empty(), proposal: empty(), assignment: empty() };
    const today = new Date().toISOString().slice(0, 10);
    statsTasks.forEach((t) => {
      const isCreator = t.createdBy === currentUserId;
      const isReceiver =
        t.assigneeUserIds.includes(currentUserId)
        || (!!t.assigneeDeptId && t.assigneeDeptId === currentDepartmentId)
        || (!!t.assigneeFacilityId && t.assigneeFacilityId === currentBranchId);
      const incl = (bucket: ReturnType<typeof empty>) => {
        bucket.total++;
        if (t.status === 'pending_approval') bucket.pending_approval++;
        else if (t.status === 'pending') bucket.pending++;
        else if (t.status === 'in_progress') bucket.in_progress++;
        else if (t.status === 'done') bucket.done++;
        if (t.dueDate && t.dueDate < today && !['done', 'cancelled', 'rejected'].includes(t.status)) {
          bucket.overdue++;
        }
      };
      const rawKind = t.kind ?? 'assignment';
      // Chỉ count creator-side cho 2 nhóm chính. Task 'general' (legacy) sẽ chỉ
      // appear ở "Nhiệm vụ của tôi" nếu user là receiver.
      if (isCreator && (rawKind === 'proposal' || rawKind === 'assignment')) {
        incl(out[rawKind]);
      }
      if (isReceiver && !isCreator) incl(out.received);
    });
    return out;
  }, [statsTasks, currentUserId, currentDepartmentId, currentBranchId]);

  // Hiệu suất theo phòng/cơ sở — done / total
  const perDeptStats = useMemo(() => {
    const map: Record<string, { id: string; name: string; total: number; done: number; overdue: number; inProgress: number }> = {};
    statsTasks.forEach((t) => {
      const key = t.assigneeDeptId ?? (t.assigneeFacilityId ? `branch:${t.assigneeFacilityId}` : 'misc');
      const name = t.assigneeDeptId
        ? (departments.find((d) => d.id === t.assigneeDeptId)?.name ?? t.assigneeDeptId)
        : (t.assigneeFacilityId ? (branches.find((b) => b.id === t.assigneeFacilityId)?.name ?? t.assigneeFacilityId) : 'Cá nhân');
      map[key] ??= { id: key, name, total: 0, done: 0, overdue: 0, inProgress: 0 };
      map[key].total += 1;
      if (t.status === 'done') map[key].done += 1;
      if (t.status === 'in_progress') map[key].inProgress += 1;
      const today2 = new Date().toISOString().slice(0, 10);
      if (t.dueDate && t.dueDate < today2 && !['done', 'cancelled', 'rejected'].includes(t.status)) map[key].overdue += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [statsTasks, departments, branches]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ===== TỔNG QUAN: 3 nhóm phân loại theo dõi tiến độ ===== */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <CategoryCard
          title="Nhiệm vụ của tôi"
          subtitle="Việc được giao cho tôi/phòng/cơ sở của tôi"
          icon={Inbox}
          stats={statsByCategory.received}
          active={tab === 'received'}
          onClick={() => jumpToTab('received')}
        />
        {showAssignmentTab && (
          <CategoryCard
            title="Giao việc"
            subtitle="Theo dõi tiến độ thực hiện"
            icon={Send}
            stats={statsByCategory.assignment}
            active={tab === 'assignment'}
            onClick={() => jumpToTab('assignment')}
          />
        )}
        {showLienKhoiTab && (
          <CategoryCard
            title="Liên khối"
            subtitle="Tổng quan nhiệm vụ xuất/nhập giữa các khối"
            icon={Users2}
            stats={statsByCategory.assignment}
            active={tab === 'lien-khoi'}
            onClick={() => jumpToTab('lien-khoi')}
          />
        )}
      </section>

      {/* Tổng tổng quan nhanh */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Tổng nhiệm vụ" value={stats.total} icon={ListChecks} accent="emerald" />
        <KpiCard label="Đang triển khai" value={stats.inflight} icon={Clock} accent="sky" />
        <KpiCard label="Hoàn thành" value={stats.finished} icon={CheckCircle2} accent="emerald" sub={`${stats.doneRate}%`} />
        <KpiCard label="Quá hạn" value={stats.overdue} icon={AlertTriangle} accent={stats.overdue > 0 ? 'rose' : 'slate'} />
      </section>

      {/* Performance chart */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-emerald-900 mb-3 flex items-center gap-2">
            <TrendingUp size={14} /> Hiệu suất theo phòng ban / cơ sở
          </h3>
          {perDeptStats.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-8">Chưa có dữ liệu</div>
          ) : (
            <PerformanceBars rows={perDeptStats} />
          )}
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-emerald-900 mb-3">Trạng thái</h3>
          <StatusDistribution byStatus={stats.byStatus} total={stats.total} />
        </div>
      </section>

      {/* ===== TOP ĐIỂM NGHẼN ===== */}
      <TopBottleneckSection rows={perDeptStats} isAdmin={showAssignmentTab || showApprovalTab} />


      {/* ===== TABS + TOOLBAR ===== */}
      <section ref={tabSectionRef} className="rounded-xl border border-slate-200 bg-white shadow-sm scroll-mt-20">
        {/* Phase 13.16.4: tabs scroll-x mobile (4 tab tràn 360px), action button stack dưới */}
        <div className="flex items-stretch border-b border-slate-200 overflow-x-auto sm:overflow-visible">
          <TabButton active={tab === 'received'} onClick={() => jumpToTab('received')} icon={Inbox} label="Nhiệm vụ của tôi" />
          {showAssignmentTab && <TabButton active={tab === 'assignment'} onClick={() => jumpToTab('assignment')} icon={Send} label="Giao việc" />}
          {showApprovalTab && (
            <TabButton
              active={tab === 'approval'} onClick={() => jumpToTab('approval')}
              icon={ShieldCheck} label="Chờ duyệt"
              badge={approvalCount > 0 ? approvalCount : undefined}
            />
          )}
          <div className="hidden sm:block flex-1" />
          {/* View toggle */}
          <div className="hidden sm:flex items-center gap-1 p-2">
            <button
              onClick={() => setView('list')}
              className={`p-2 rounded-lg transition ${view === 'list' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Xem list"
            >
              <ListIcon size={16} />
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`p-2 rounded-lg transition ${view === 'kanban' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Xem Kanban"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView('flow')}
              className={`p-2 rounded-lg transition ${view === 'flow' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Xem luồng công việc"
            >
              <GitBranch size={16} />
            </button>
          </div>
          {canCreateAssignment && tab === 'assignment' && (
            <button
              onClick={() => setShowCreate('assignment')}
              className="hidden sm:inline-flex my-2 mr-2 items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 shadow-sm"
            >
              <Plus size={14} /> Tạo giao việc
            </button>
          )}
        </div>

        {/* Mobile-only action button row (stacked dưới tabs) */}
        {canCreateAssignment && tab === 'assignment' && (
          <div className="sm:hidden px-3 py-2 border-b border-slate-100 flex">
            {canCreateAssignment && tab === 'assignment' && (
              <button
                onClick={() => setShowCreate('assignment')}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg active:bg-emerald-700 shadow-sm"
              >
                <Plus size={14} /> Tạo giao việc
              </button>
            )}
          </div>
        )}

        {/* Filter bar — Phase 13.16.4: stack mobile, pills scroll-x */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 px-3 sm:px-4 py-3 border-b border-slate-100 bg-slate-50/40">
          <div className="flex items-center gap-1 text-xs overflow-x-auto whitespace-nowrap sm:overflow-visible -mx-3 px-3 sm:mx-0 sm:px-0">
            {(['all', 'pending_approval', 'pending', 'in_progress', 'done', 'rejected', 'cancelled'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`shrink-0 px-3 py-1 rounded-full font-medium ring-1 transition ${
                  statusFilter === s
                    ? 'bg-emerald-600 text-white ring-emerald-600'
                    : 'bg-white text-slate-600 ring-slate-200 hover:ring-emerald-300 hover:text-emerald-700'
                }`}
              >
                {s === 'all' ? 'Tất cả' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="hidden sm:block flex-1" />
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg ring-1 ring-slate-200 bg-white">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={keyword} onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm tiêu đề / mô tả…"
              className="w-full sm:w-48 text-sm bg-transparent outline-none min-w-0"
            />
            {keyword && (
              <button onClick={() => setKeyword('')} className="text-slate-400 hover:text-slate-700 shrink-0">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="text-center py-12 text-slate-500">
              <Loader2 size={20} className="inline animate-spin mr-2" /> Đang tải…
            </div>
          ) : error ? (
            <div className="text-sm text-rose-700 bg-rose-50 p-3 rounded-lg border border-rose-200">{error}</div>
          ) : tasks.length === 0 ? (
            <EmptyState tab={tab} />
          ) : view === 'kanban' ? (
            <KanbanView
              tasks={tasks}
              departments={departments}
              branches={branches}
              users={users}
              onSelect={setSelectedTask}
              currentUserId={currentUserId}
            />
          ) : view === 'flow' ? (
            <FlowView
              tasks={tasks}
              departments={departments}
              branches={branches}
              users={users}
              onSelect={setSelectedTask}
              currentUserId={currentUserId}
            />
          ) : (
            <ListView
              tasks={tasks}
              departments={departments}
              branches={branches}
              users={users}
              onSelect={setSelectedTask}
              currentUserId={currentUserId}
            />
          )}
        </div>
      </section>

      {/* Create modal */}
      {/* ===== TAB: LIÊN KHỐI ===== */}
      {tab === 'lien-khoi' && showLienKhoiTab && (
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Users2 size={18} className="text-indigo-600" />
              <h3 className="font-semibold text-slate-800 text-sm">Tổng quan liên khối</h3>
              <span className="ml-auto text-xs text-slate-400">Theo dõi nhiệm vụ giao/nhận giữa các khối</span>
            </div>
            {perDeptStats.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Chưa có dữ liệu liên khối</p>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {perDeptStats.map((d) => (
                  <div key={d.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="font-medium text-slate-700 text-sm truncate">{d.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {d.total} việc · <span className="text-sky-600">{d.inProgress} đang làm</span> · <span className="text-emerald-600">{d.done} xong</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {showCreate && (
        <TaskCreateModal
          kind={showCreate}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          currentDepartmentId={currentDepartmentId}
          currentBranchId={currentBranchId}
          departments={departments}
          branches={branches}
          users={users}
          onClose={() => setShowCreate(null)}
          onCreated={() => { setShowCreate(null); refresh(); }}
        />
      )}

      {/* Detail modal */}
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
          users={users}
          onClose={() => setSelectedTask(null)}
          onChange={refresh}
        />
      )}
    </div>
  );
}

// ============================================================================
// SUB COMPONENTS
// ============================================================================

interface CategoryStats {
  total: number;
  pending_approval: number;
  pending: number;
  in_progress: number;
  done: number;
  overdue: number;
}
function CategoryCard({ title, subtitle, icon: Icon, stats, onClick, active }: {
  title: string; subtitle: string; icon: LucideIcon; stats: CategoryStats; onClick?: () => void; active?: boolean;
}) {
  const doneRate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  const inflight = stats.pending_approval + stats.pending + stats.in_progress;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border bg-white p-4 shadow-sm transition group ${
        active
          ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-md'
          : 'border-emerald-200 hover:border-emerald-400 hover:shadow-md'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shrink-0">
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-emerald-700">{title}</h3>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">{subtitle}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold tabular-nums text-slate-900 leading-none">{stats.total}</div>
          <div className="text-[10px] text-emerald-700 font-semibold mt-1">{doneRate}% hoàn thành</div>
        </div>
      </div>

      {/* Pipeline mini-bar */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
        {stats.pending_approval > 0 && (
          <div className="bg-amber-400" style={{ width: `${(stats.pending_approval / Math.max(1, stats.total)) * 100}%` }} title={`Chờ duyệt: ${stats.pending_approval}`} />
        )}
        {stats.pending > 0 && (
          <div className="bg-slate-400" style={{ width: `${(stats.pending / Math.max(1, stats.total)) * 100}%` }} title={`Chờ làm: ${stats.pending}`} />
        )}
        {stats.in_progress > 0 && (
          <div className="bg-sky-500" style={{ width: `${(stats.in_progress / Math.max(1, stats.total)) * 100}%` }} title={`Đang làm: ${stats.in_progress}`} />
        )}
        {stats.done > 0 && (
          <div className="bg-emerald-500" style={{ width: `${(stats.done / Math.max(1, stats.total)) * 100}%` }} title={`Hoàn thành: ${stats.done}`} />
        )}
      </div>

      {/* Status breakdown */}
      <div className="mt-2.5 grid grid-cols-4 gap-1 text-[10px]">
        <StatusMini count={stats.pending_approval} label="Chờ duyệt" hex="#f59e0b" />
        <StatusMini count={stats.pending} label="Chờ làm" hex="#94a3b8" />
        <StatusMini count={stats.in_progress} label="Đang làm" hex="#0ea5e9" />
        <StatusMini count={stats.done} label="Hoàn thành" hex="#059669" />
      </div>

      {/* Overdue warning */}
      {stats.overdue > 0 && (
        <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-rose-600">
          <AlertTriangle size={10} /> {stats.overdue} việc quá hạn
        </div>
      )}
      {/* Empty state */}
      {stats.total === 0 && (
        <div className="mt-3 text-center text-[10px] text-slate-400 py-2">Chưa có dữ liệu</div>
      )}
      {/* Active hint */}
      {inflight > 0 && stats.total > 0 && (
        <div className="mt-2 text-[10px] text-slate-500">
          <span className="font-semibold text-sky-700">{inflight}</span> việc đang theo dõi → click xem chi tiết
        </div>
      )}
    </button>
  );
}

function StatusMini({ count, label, hex }: { count: number; label: string; hex: string }) {
  return (
    <div className="flex items-center gap-1 truncate" title={`${label}: ${count}`}>
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
      <span className="tabular-nums font-semibold text-slate-700">{count}</span>
      <span className="text-slate-400 truncate text-[10px]">{label}</span>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, accent, sub }: {
  label: string; value: number; icon: LucideIcon; accent: 'emerald' | 'sky' | 'rose' | 'slate'; sub?: string;
}) {
  const A = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100' },
    sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     ring: 'ring-sky-100' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-100' },
    slate:   { bg: 'bg-slate-50',   text: 'text-slate-600',   ring: 'ring-slate-100' },
  }[accent];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${A.bg} ${A.text} ${A.ring}`}>
          <Icon size={18} />
        </div>
        {sub && <span className={`text-xs font-bold ${A.text}`}>{sub}</span>}
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, badge }: {
  active: boolean; onClick: () => void; icon: LucideIcon; label: string; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition ${
        active
          ? 'border-emerald-500 text-emerald-700 bg-emerald-50/40'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon size={15} /> {label}
      {badge !== undefined && (
        <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// TOP ĐIỂM NGHẼN
// ============================================================================
function TopBottleneckSection({ rows, isAdmin }: {
  rows: { id: string; name: string; total: number; done: number; overdue: number }[];
  isAdmin: boolean;
}) {
  if (!isAdmin || rows.length === 0) return null;
  const withBottleneck = rows
    .filter((r) => r.overdue > 0 || (r.total > 0 && r.done < r.total))
    .sort((a, b) => b.overdue - a.overdue || (b.total - b.done) - (a.total - a.done))
    .slice(0, 5);
  if (withBottleneck.length === 0) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <span className="text-sm text-emerald-700 font-medium">Không có điểm nghẽn — tất cả phòng/cơ sở đang vận hành tốt ✓</span>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-orange-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-orange-500" />
        <span className="text-xs font-bold text-orange-700 uppercase tracking-wider">TOP Điểm nghẽn</span>
        <span className="ml-auto text-xs text-orange-500">{withBottleneck.length} đơn vị cần chú ý</span>
      </div>
      <div className="divide-y divide-slate-100">
        {withBottleneck.map((r, i) => {
          const pending = r.total - r.done;
          const doneRate = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
          const severity = r.overdue > 0 ? 'rose' : pending > 3 ? 'amber' : 'sky';
          const severityClass = { rose: 'text-red-700 bg-red-100', amber: 'text-amber-700 bg-amber-100', sky: 'text-sky-700 bg-sky-100' }[severity];
          const barColor = { rose: 'bg-red-400', amber: 'bg-amber-400', sky: 'bg-sky-400' }[severity];
          return (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3">
              <div className="text-xs font-bold text-slate-400 w-4 shrink-0">#{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-800 truncate">{r.name}</span>
                  <span className={'text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ' + severityClass}>
                    {r.overdue > 0 ? `${r.overdue} quá hạn` : `${pending} chờ`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={barColor + ' h-full rounded-full'} style={{ width: `${doneRate}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">{r.done}/{r.total} ({doneRate}%)</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PerformanceBars({ rows }: { rows: { id: string; name: string; total: number; done: number }[] }) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const ratePct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
        const widthPct = (r.total / max) * 100;
        return (
          <div key={r.id} className="text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-slate-700 truncate">{r.name}</span>
              <span className="tabular-nums text-slate-500">
                {r.done}/{r.total} · <span className={`font-bold ${ratePct >= 80 ? 'text-emerald-700' : ratePct >= 50 ? 'text-amber-700' : 'text-rose-700'}`}>{ratePct}%</span>
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${widthPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusDistribution({ byStatus, total }: { byStatus: Record<TaskStatus, number>; total: number; }) {
  const items: { key: TaskStatus; label: string; hex: string }[] = [
    { key: 'pending_approval', label: 'Chờ duyệt', hex: '#f59e0b' },
    { key: 'pending', label: 'Chờ làm', hex: '#94a3b8' },
    { key: 'in_progress', label: 'Đang làm', hex: '#0ea5e9' },
    { key: 'done', label: 'Hoàn thành', hex: '#059669' },
    { key: 'rejected', label: 'Từ chối', hex: '#ef4444' },
    { key: 'cancelled', label: 'Huỷ', hex: '#cbd5e1' },
  ];
  if (total === 0) return <div className="text-xs text-slate-400 text-center py-6">Chưa có dữ liệu</div>;
  return (
    <div className="space-y-2 text-xs">
      {items.map((it) => {
        const n = byStatus[it.key] ?? 0;
        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
        return (
          <div key={it.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: it.hex }} />
            <span className="text-slate-600 flex-1 truncate">{it.label}</span>
            <span className="tabular-nums font-semibold text-slate-800">{n}</span>
            <span className="tabular-nums text-slate-400 w-10 text-right">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const msg = tab === 'received' ? 'Chưa có nhiệm vụ nào được giao cho bạn'
    : tab === 'proposal' ? 'Bạn chưa tạo đề xuất nào'
    : tab === 'assignment' ? 'Bạn chưa giao việc nào'
    : 'Không có nhiệm vụ nào chờ bạn duyệt';
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
      <Inbox size={32} className="mx-auto text-slate-300 mb-3" />
      <p className="text-sm text-slate-500">{msg}</p>
    </div>
  );
}

function ListView({ tasks, departments, branches, onSelect }: {
  tasks: Task[]; departments: Department[]; branches: Branch[]; users: User[]; onSelect: (t: Task) => void; currentUserId: string;
}) {
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <TaskRow
          key={t.id} task={t}
          departments={departments} branches={branches}
          onClick={() => onSelect(t)}
        />
      ))}
    </div>
  );
}

function KanbanView({ tasks, departments, branches, onSelect }: {
  tasks: Task[]; departments: Department[]; branches: Branch[]; users: User[]; onSelect: (t: Task) => void; currentUserId: string;
}) {
  const groups = useMemo(() => {
    return {
      pending: tasks.filter((t) => t.status === 'pending' || t.status === 'pending_approval'),
      in_progress: tasks.filter((t) => t.status === 'in_progress'),
      done: tasks.filter((t) => t.status === 'done'),
    };
  }, [tasks]);
  const cols: { key: keyof typeof groups; label: string; hex: string }[] = [
    { key: 'pending', label: 'Chờ', hex: '#f59e0b' },
    { key: 'in_progress', label: 'Đang xử lý', hex: '#0ea5e9' },
    { key: 'done', label: 'Hoàn thành', hex: '#059669' },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {cols.map((c) => (
        <div key={c.key} className="rounded-lg bg-slate-50/60 border border-slate-200 p-2 min-h-[300px]">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.hex }} />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{c.label}</h4>
            <span className="ml-auto text-[10px] font-semibold text-slate-500 tabular-nums">{groups[c.key].length}</span>
          </div>
          <div className="space-y-2 mt-2">
            {groups[c.key].map((t) => (
              <TaskRow key={t.id} task={t} departments={departments} branches={branches} onClick={() => onSelect(t)} compact />
            ))}
            {groups[c.key].length === 0 && <div className="text-[11px] text-slate-400 text-center py-6">—</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// FLOW VIEW — Xem luồng công việc với nhiều thành viên
// ============================================================================

function MemberAvatar({ name, role, state, size = 'md' }: {
  name: string; role?: string; state: 'done' | 'active' | 'pending' | 'skipped';
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = name.split(' ').map(w => w.charAt(0).toUpperCase()).slice(0,2).join('');
  const sizeClass = size === 'lg' ? 'h-10 w-10 text-sm' : size === 'sm' ? 'h-6 w-6 text-[9px]' : 'h-8 w-8 text-xs';
  const stateClass = {
    done:    'bg-emerald-500 text-white ring-2 ring-emerald-200',
    active:  'bg-blue-500 text-white ring-2 ring-blue-300 shadow-md',
    pending: 'bg-slate-200 text-slate-500 ring-1 ring-slate-300',
    skipped: 'bg-rose-100 text-rose-500 ring-1 ring-rose-200',
  }[state];
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <div className={`rounded-full font-bold flex items-center justify-center shrink-0 ${sizeClass} ${stateClass}`}>
        {state === 'done' ? '✓' : state === 'skipped' ? '✕' : initials}
      </div>
      <span className="text-[9px] text-slate-600 font-medium text-center max-w-[56px] leading-tight line-clamp-1 w-full">{name.split(' ').slice(-1)[0]}</span>
      {role && <span className="text-[8px] text-slate-400 text-center truncate max-w-[56px]">{role}</span>}
    </div>
  );
}

function FlowConnector({ state }: { state: 'done' | 'active' | 'pending' }) {
  const cls = state === 'done' ? 'bg-emerald-400' : state === 'active' ? 'bg-blue-400' : 'bg-slate-200';
  return <div className={`h-0.5 flex-1 min-w-[12px] max-w-[40px] rounded-full mx-0.5 mt-4 ${cls}`} />;
}

function FlowTaskCard({ task, users, departments, branches, onSelect }: {
  task: Task;
  users: User[];
  departments: Department[];
  branches: Branch[];
  onSelect: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !!task.dueDate && task.dueDate < today && !['done', 'cancelled', 'rejected'].includes(task.status);
  const isTerminal = task.status === 'rejected' || task.status === 'cancelled';
  const isDone = task.status === 'done';
  const isPendingApproval = task.status === 'pending_approval';
  const isInProgress = task.status === 'in_progress';
  const isPending = task.status === 'pending';
  const creator = { name: task.createdByName || '—', role: task.createdByRole };
  const approvalChain: string[] = Array.isArray(task.approvalChain) ? task.approvalChain : [];
  const approvedRoles = new Set((task.approvalsCompleted || []).map((a: { role: string }) => a.role));
  const assigneeNames: string[] = [];
  if (task.assigneeDeptId) {
    const d = departments.find(d => d.id === task.assigneeDeptId);
    if (d) assigneeNames.push(d.name);
  } else if (task.assigneeFacilityId) {
    const b = branches.find(b => b.id === task.assigneeFacilityId);
    if (b) assigneeNames.push(b.name);
  } else {
    task.assigneeUserIds.slice(0, 3).forEach(uid => {
      const u = users.find(u => u.id === uid);
      if (u) assigneeNames.push(u.name);
    });
    if (task.assigneeUserIds.length > 3) assigneeNames.push('+' + (task.assigneeUserIds.length - 3));
  }
  const creatorState: 'done' | 'active' | 'pending' | 'skipped' = isTerminal ? 'skipped' : 'done';
  const ROLE_SHORT: Record<string, string> = {
    GD_KD: 'GĐ KD', GD_VP: 'GĐ VP', CEO: 'CEO', ADMIN: 'Admin', PP_KD: 'PP KD', PP_HT: 'PP HT',
  };
  const priorityBorder: Record<string, string> = {
    low: 'border-slate-200', normal: 'border-slate-200', high: 'border-amber-400', urgent: 'border-rose-400',
  };
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border-2 bg-white p-4 hover:shadow-md transition-all group ${isTerminal ? 'border-rose-200 opacity-75' : isOverdue ? 'border-rose-400' : (priorityBorder[task.priority] || 'border-slate-200')}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${STATUS_BG[task.status]}`}>{STATUS_LABEL[task.status]}</span>
            {task.crossBlock && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">LIÊN KHỐI</span>}
            {isOverdue && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded">⚠ QUÁ HẠN</span>}
          </div>
          <h4 className="mt-1 text-sm font-semibold text-slate-900 group-hover:text-emerald-700 line-clamp-1">{task.title}</h4>
        </div>
        <div className="text-right shrink-0 space-y-0.5">
          {task.dueDate && <div className={`text-[10px] font-semibold ${isOverdue ? 'text-rose-600' : 'text-slate-400'}`}>📅 {task.dueDate}</div>}
          {task.progressPct > 0 && isInProgress && <div className="text-[10px] font-bold text-sky-600">{task.progressPct}%</div>}
        </div>
      </div>
      {task.progressPct > 0 && isInProgress && (
        <div className="h-1 bg-slate-100 rounded-full mb-3 overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${task.progressPct}%` }} />
        </div>
      )}
      <div className="flex items-start gap-0 overflow-x-auto pb-1 scrollbar-none">
        <MemberAvatar name={creator.name} role={creator.role || 'Tạo'} state={creatorState} />
        <FlowConnector state={isTerminal ? 'pending' : 'done'} />
        {approvalChain.map((role, idx) => {
          const approved = approvedRoles.has(role);
          const isCurrent = task.currentApprover === role && isPendingApproval;
          const st: 'done'|'active'|'pending'|'skipped' = isTerminal ? 'skipped' : approved ? 'done' : isCurrent ? 'active' : 'pending';
          const cst: 'done'|'active'|'pending' = approved ? 'done' : isCurrent ? 'active' : 'pending';
          return (<div key={role} className="flex items-start">
            <MemberAvatar name={ROLE_SHORT[role] || role} role="Duyệt" state={st} />
            {idx < approvalChain.length - 1 && <FlowConnector state={cst} />}
          </div>);
        })}
        {approvalChain.length > 0 && (
          <FlowConnector state={isTerminal ? 'pending' : approvalChain.every(r => approvedRoles.has(r)) ? 'done' : isPendingApproval ? 'active' : 'pending'} />
        )}
        {assigneeNames.slice(0, 3).map((name, idx) => {
          const execSt: 'done'|'active'|'pending'|'skipped' = isTerminal ? 'skipped' : isDone ? 'done' : isInProgress ? 'active' : isPending ? 'pending' : 'pending';
          return (<div key={name + idx} className="flex items-start">
            <MemberAvatar name={name} role="Thực hiện" state={execSt} />
            {idx < Math.min(assigneeNames.length, 3) - 1 && <FlowConnector state={execSt === 'done' ? 'done' : 'pending'} />}
          </div>);
        })}
        <FlowConnector state={isTerminal ? 'pending' : isDone ? 'done' : 'pending'} />
        <MemberAvatar name={isDone ? (task.updatedBy || 'Xong') : 'Kết thúc'} role={isDone ? '✓ Xong' : 'Chờ'} state={isTerminal ? 'skipped' : isDone ? 'done' : 'pending'} />
      </div>
    </button>
  );
}

function FlowView({ tasks, departments, branches, users, onSelect, currentUserId }: {
  tasks: Task[];
  departments: Department[];
  branches: Branch[];
  users: User[];
  onSelect: (task: Task | null) => void;
  currentUserId: string;
}) {
  const active = tasks.filter(t => ['pending_approval', 'pending', 'in_progress'].includes(t.status));
  const done = tasks.filter(t => t.status === 'done');
  const terminal = tasks.filter(t => ['rejected', 'cancelled'].includes(t.status));
  const renderGroup = (grp: Task[], label: string, accent: string) => {
    if (grp.length === 0) return null;
    return (
      <div>
        <div className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${accent}`}>{label} ({grp.length})</div>
        <div className="space-y-3">
          {grp.map(t => (
            <FlowTaskCard key={t.id} task={t} users={users} departments={departments} branches={branches} onSelect={() => onSelect(t)} />
          ))}
        </div>
      </div>
    );
  };
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-4 text-[10px] text-slate-500 flex-wrap border-b border-slate-100 pb-3">
        <span className="font-bold text-slate-600 flex items-center gap-1">
          <GitBranch size={12} /> Luồng công việc
        </span>
        <span className="flex items-center gap-1"><span className="h-4 w-4 rounded-full bg-emerald-500 inline-flex items-center justify-center text-white text-[7px]">✓</span> Xong</span>
        <span className="flex items-center gap-1"><span className="h-4 w-4 rounded-full bg-blue-500 inline-flex items-center justify-center text-white text-[7px]">●</span> Đang xử lý</span>
        <span className="flex items-center gap-1"><span className="h-4 w-4 rounded-full bg-slate-200 inline-flex items-center justify-center text-slate-400 text-[7px]">○</span> Chờ</span>
        <span className="ml-auto text-slate-400">{tasks.length} nhiệm vụ</span>
      </div>
      {renderGroup(active, 'Đang hoạt động', 'text-blue-600')}
      {renderGroup(done, 'Đã hoàn thành', 'text-emerald-600')}
      {renderGroup(terminal, 'Đã kết thúc', 'text-rose-500')}
      {tasks.length === 0 && <div className="text-center py-12 text-slate-400 text-sm">Không có nhiệm vụ</div>}
    </div>
  );
}

function PipelineSteps({ task }: { task: Task }) {
  // Steps phụ thuộc workflow: nếu cần duyệt → 4 bước (Tạo → Duyệt → Đang làm → Hoàn thành)
  //                            nếu không → 3 bước (Tạo → Đang làm → Hoàn thành)
  // Phase B.7 phase 2: dùng currentApprover thay legacy approvalRequiredFrom.
  // approvalChain tồn tại từ Phase 12.5+ → length > 0 cũng tính cần duyệt.
  const needsApproval = !!task.currentApprover
    || (Array.isArray(task.approvalChain) && task.approvalChain.length > 0)
    || task.crossBlock;
  const steps = needsApproval
    ? [
        { key: 'created', label: 'Tạo' },
        { key: 'approval', label: 'Duyệt' },
        { key: 'in_progress', label: 'Làm' },
        { key: 'done', label: 'Xong' },
      ]
    : [
        { key: 'created', label: 'Tạo' },
        { key: 'in_progress', label: 'Làm' },
        { key: 'done', label: 'Xong' },
      ];
  // Current step index (0-based, inclusive — step đã hoàn thành)
  let current = 1; // sau khi tạo
  if (task.status === 'pending_approval') current = 1;
  else if (task.status === 'pending') current = needsApproval ? 2 : 1;
  else if (task.status === 'in_progress') current = needsApproval ? 3 : 2;
  else if (task.status === 'done') current = steps.length;
  else if (task.status === 'rejected' || task.status === 'cancelled') current = -1;

  const isTerminal = task.status === 'rejected' || task.status === 'cancelled';
  return (
    <div className="flex items-center gap-1" title={`Stage: ${task.status}`}>
      {steps.map((s, idx) => {
        const reached = !isTerminal && idx < current;
        const isCurrent = !isTerminal && idx === current - 1;
        return (
          <span
            key={s.key}
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold transition ${
              isTerminal
                ? 'bg-rose-50 text-rose-500'
                : reached
                  ? (isCurrent ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300' : 'bg-emerald-50 text-emerald-600')
                  : 'bg-slate-100 text-slate-400'
            }`}
          >
            {s.label}
          </span>
        );
      })}
      {isTerminal && (
        <span className="text-[9px] font-semibold text-rose-600 ml-1">
          {task.status === 'rejected' ? '✕ Từ chối' : '⊘ Huỷ'}
        </span>
      )}
    </div>
  );
}

function TaskRow({ task, departments, branches, onClick, compact }: {
  task: Task; departments: Department[]; branches: Branch[]; onClick: () => void; compact?: boolean;
}) {
  const assigneeLabel = task.assigneeDeptId
    ? departments.find((d) => d.id === task.assigneeDeptId)?.name ?? task.assigneeDeptId
    : task.assigneeFacilityId
      ? branches.find((b) => b.id === task.assigneeFacilityId)?.name ?? task.assigneeFacilityId
      : task.assigneeUserIds.length > 0 ? `${task.assigneeUserIds.length} cá nhân` : '(chưa gán)';
  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.dueDate && task.dueDate < today && !['done', 'cancelled', 'rejected'].includes(task.status);
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-slate-200 bg-white p-3 hover:border-emerald-300 hover:shadow-sm transition group"
    >
      <div className="flex items-start gap-2">
        <span className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: PRIORITY_HEX[task.priority] }} title={`Ưu tiên: ${PRIORITY_LABEL[task.priority]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-900 truncate group-hover:text-emerald-700">{task.title}</h4>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 shrink-0 ${STATUS_BG[task.status]}`}>
              {STATUS_LABEL[task.status]}
            </span>
          </div>
          {!compact && task.description && (
            <p className="mt-1 text-xs text-slate-500 line-clamp-1">{task.description}</p>
          )}
          {/* Pipeline stage indicator (ẩn ở chế độ compact / kanban) */}
          {!compact && (
            <div className="mt-2">
              <PipelineSteps task={task} />
            </div>
          )}
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
            <span className="inline-flex items-center gap-1 truncate">
              <span className="font-medium text-slate-700">{task.createdByName}</span>
              <ArrowRight size={10} className="text-slate-400" />
              <span className="font-medium text-emerald-700">{task.assigneeBlock} · {assigneeLabel}</span>
            </span>
            {task.crossBlock && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">LIÊN KHỐI</span>
            )}
            {task.dueDate && (
              <span className={`inline-flex items-center gap-1 tabular-nums ${overdue ? 'text-rose-600 font-semibold' : ''}`}>
                <CalendarDays size={10} /> {task.dueDate}
                {overdue && ' (quá hạn)'}
              </span>
            )}
            {task.progressPct > 0 && task.status === 'in_progress' && (
              <span className="tabular-nums font-semibold text-sky-700">{task.progressPct}%</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
