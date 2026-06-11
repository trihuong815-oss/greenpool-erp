'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, Search, X, ListChecks, Inbox, Send, ShieldCheck,
  Loader2, ArrowRight, CalendarDays, AlertTriangle, CheckCircle2,
  Clock, LayoutGrid, GitBranch, List as ListIcon, TrendingUp, Users2,
  ChevronRight, Filter, RefreshCw, Building2, User2,
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

type TabKey = 'my-tasks' | 'assigned-by-me' | 'cross-block' | 'pending-response' | 'overdue';
type ViewMode = 'table' | 'kanban';

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending_approval: 'Chá» duyá»t',
  pending: 'Chá» lÃ m',
  in_progress: 'Äang lÃ m',
  requested_revision: 'YÃªu cáº§u bá» sung',
  done: 'HoÃ n thÃ nh',
  rejected: 'Tá»« chá»i',
  cancelled: 'Huá»·',
};
const STATUS_BG: Record<TaskStatus, string> = {
  pending_approval: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending: 'bg-slate-100 text-slate-600 ring-slate-200',
  in_progress: 'bg-sky-50 text-sky-700 ring-sky-200',
  requested_revision: 'bg-orange-50 text-orange-700 ring-orange-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-50 text-slate-400 ring-slate-200',
};
const PRIORITY_LABEL: Record<string, string> = {
  low: 'Tháº¥p', normal: 'BÃ¬nh thÆ°á»ng', high: 'Cao', urgent: 'Kháº©n',
};
const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-slate-300', normal: 'bg-sky-400', high: 'bg-amber-400', urgent: 'bg-rose-500',
};
const BLOCK_LABEL: Record<string, { label: string; bg: string }> = {
  KD: { label: 'KD', bg: 'bg-blue-100 text-blue-700' },
  VP: { label: 'VP', bg: 'bg-violet-100 text-violet-700' },
  all: { label: 'ToÃ n cÃ´ng ty', bg: 'bg-slate-100 text-slate-700' },
};
const GD_ROLES = new Set(['GD_KD', 'GD_VP', 'CEO', 'ADMIN']);

function formatDate(d: string | null | undefined) {
  if (!d) return 'â';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function GiaoViecClient(props: Props) {
  const {
    currentUserId, currentUserName, currentUserRole,
    currentBranchId, currentDepartmentId,
    departments, branches, users,
  } = props;

  const isGD = GD_ROLES.has(currentUserRole);
  const isCEO = currentUserRole === 'CEO';
  const isAdmin = currentUserRole === 'ADMIN';
  const showApprovalTab = isGD || isCEO || isAdmin;
  const canCreateAssignment = isGD || isCEO || isAdmin;
  const canCreateProposal = !isCEO;
  const showLienKhoiTab = isCEO || isAdmin;
  const showAssignmentTab = isGD || isCEO || isAdmin;

  const [tab, setTab] = useState<TabKey>('my-tasks');
  const tabSectionRef = useRef<HTMLElement | null>(null);
  const searchParams = useSearchParams();

  function jumpToTab(t: TabKey) {
    setTab(t);
    requestAnimationFrame(() => {
      tabSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const [view, setView] = useState<ViewMode>('table');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvalCount, setApprovalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState<null | TaskKind>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  function refresh() { setRefreshKey((k) => k + 1); }

  // Map tab â API mode
  const mode: TaskListMode =
    tab === 'my-tasks' ? 'assigned'
    : tab === 'assigned-by-me' ? 'created'
    : tab === 'cross-block' ? 'created'
    : tab === 'pending-response' ? 'created'
    : tab === 'overdue' ? 'assigned'
    : 'assigned';

  useEffect(() => {
    const focus = searchParams.get('focus');
    const taskIdParam = searchParams.get('taskId');
    if (focus === 'approval' && showApprovalTab) { setTab('my-tasks'); setStatusFilter('pending_approval'); }
    else if (focus === 'received')   { setTab('my-tasks'); setStatusFilter('all'); }
    else if (focus === 'pending')    { setTab('my-tasks'); setStatusFilter('pending'); }
    else if (focus === 'inprogress') { setTab('my-tasks'); setStatusFilter('in_progress'); }
    else if (focus === 'overdue')    { setTab('overdue'); setStatusFilter('all'); }
    if (focus) {
      requestAnimationFrame(() => {
        tabSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    if (taskIdParam) {
      tasksApi.get(taskIdParam)
        .then((t) => setSelectedTask(t))
        .catch((e) => console.warn('[deep-link taskId] fetch fail:', e?.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const extraStatus = tab === 'overdue' ? undefined : (statusFilter === 'all' ? undefined : statusFilter);
    const extraCross = tab === 'cross-block' ? true : undefined;
    tasksApi.list({
      mode,
      status: extraStatus,
      q: keyword || undefined,
    })
      .then((rows) => {
        if (cancelled) return;
        let filtered = rows;
        if (tab === 'overdue') {
          const today = new Date().toISOString().slice(0, 10);
          filtered = rows.filter(t => t.dueDate && t.dueDate < today && !['done','cancelled','rejected'].includes(t.status));
        } else if (tab === 'cross-block') {
          filtered = rows.filter(t => t.crossBlock);
        } else if (tab === 'pending-response') {
          filtered = rows.filter(t => t.status === 'pending_approval' || t.status === 'requested_revision');
        } else if (tab === 'assigned-by-me') {
          filtered = rows.filter(t => t.createdBy === currentUserId);
        }
        setTasks(filtered);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode, tab, statusFilter, keyword, refreshKey, currentUserId]);

  useEffect(() => {
    if (!showApprovalTab) return;
    let cancelled = false;
    tasksApi.list({ mode: 'pending_approval' })
      .then((rows) => { if (!cancelled) setApprovalCount(rows.length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showApprovalTab, refreshKey]);

  // All tasks for stats (used in header KPI cards)
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  useEffect(() => {
    let cancelled = false;
    tasksApi.list({ mode: 'assigned' })
      .then((rows) => { if (!cancelled) setAllTasks(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);

  const today = new Date().toISOString().slice(0, 10);
  const kpi = useMemo(() => {
    const inProgress = allTasks.filter(t => t.status === 'in_progress').length;
    const pendingApproval = allTasks.filter(t => t.status === 'pending_approval').length;
    const pendingDone = allTasks.filter(t => t.status === 'pending').length;
    const overdue = allTasks.filter(t => t.dueDate && t.dueDate < today && !['done','cancelled','rejected'].includes(t.status)).length;
    const done = allTasks.filter(t => t.status === 'done').length;
    return { inProgress, pendingApproval, pendingDone, overdue, done };
  }, [allTasks, today]);

  // Per-dept stats for "CÃ´ng viá»c theo khá»i"
  const perDeptStats = useMemo(() => {
    const map: Record<string, { id: string; name: string; total: number; done: number; inProgress: number; overdue: number }> = {};
    allTasks.forEach((t) => {
      const key = t.assigneeDeptId ?? (t.assigneeFacilityId ? `branch:${t.assigneeFacilityId}` : 'misc');
      const name = t.assigneeDeptId
        ? (departments.find((d) => d.id === t.assigneeDeptId)?.name ?? t.assigneeDeptId)
        : (t.assigneeFacilityId ? (branches.find((b) => b.id === t.assigneeFacilityId)?.name ?? t.assigneeFacilityId) : 'CÃ¡ nhÃ¢n');
      map[key] ??= { id: key, name, total: 0, done: 0, inProgress: 0, overdue: 0 };
      map[key].total += 1;
      if (t.status === 'done') map[key].done += 1;
      if (t.status === 'in_progress') map[key].inProgress += 1;
      if (t.dueDate && t.dueDate < today && !['done','cancelled','rejected'].includes(t.status)) map[key].overdue += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [allTasks, departments, branches, today]);

  const todayLabel = new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' });

  const tabDef: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'my-tasks', label: 'TÃ´i phá»¥ trÃ¡ch' },
    { key: 'assigned-by-me', label: 'TÃ´i giao' },
    ...(showLienKhoiTab ? [{ key: 'cross-block' as TabKey, label: 'LiÃªn khá»i' }] : []),
    { key: 'pending-response', label: 'Chá» pháº£n há»i', badge: approvalCount || undefined },
    { key: 'overdue', label: 'QuÃ¡ háº¡n', badge: kpi.overdue || undefined },
  ];
  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* ===== HEADER: Tá»ng quan hÃ´m nay ===== */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Tá»ng quan hÃ´m nay</h2>
            <p className="text-xs text-slate-500 mt-0.5">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {(canCreateAssignment || canCreateProposal) && (
              <button
                onClick={() => setShowCreate(canCreateAssignment ? 'assignment' : 'proposal')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 shadow-sm transition"
              >
                <Plus size={15} /> Táº¡o Äiá»u phá»i
              </button>
            )}
            <button onClick={refresh} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition" title="LÃ m má»i">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* KPI cards â 5 Ã´ theo mockup */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Äang xá»­ lÃ½" value={kpi.inProgress} icon={Clock} accent="sky" sub={kpi.inProgress > 0 ? `+${Math.round(kpi.inProgress/Math.max(allTasks.length,1)*100)}% tá»ng` : undefined} />
          <KpiCard label="Chá» pháº£n há»i" value={kpi.pendingApproval} icon={ShieldCheck} accent={kpi.pendingApproval > 0 ? 'amber' : 'slate'} />
          <KpiCard label="Chá» duyá»t" value={kpi.pendingDone} icon={AlertTriangle} accent={kpi.pendingDone > 0 ? 'orange' : 'slate'} />
          <KpiCard label="QuÃ¡ háº¡n" value={kpi.overdue} icon={AlertTriangle} accent={kpi.overdue > 0 ? 'rose' : 'slate'} />
          <KpiCard label="HoÃ n thÃ nh" value={kpi.done} icon={CheckCircle2} accent="emerald" sub={allTasks.length > 0 ? `+${Math.round(kpi.done/allTasks.length*100)}% tá»ng` : undefined} />
        </div>
      </section>

      {/* ===== HÃNG 2: CÃ´ng viá»c theo khá»i + Táº¯c ngháº½n + QuÃ¡ háº¡n ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* CÃ´ng viá»c theo khá»i */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Building2 size={14} className="text-emerald-600" /> CÃ´ng viá»c theo khá»i
          </h3>
          {perDeptStats.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-6">ChÆ°a cÃ³ dá»¯ liá»u</div>
          ) : (
            <div className="space-y-2">
              {perDeptStats.slice(0, 5).map((d) => {
                const pct = d.total > 0 ? Math.round(d.done / d.total * 100) : 0;
                return (
                  <div key={d.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700 truncate max-w-[120px]">{d.name}</span>
                      <span className="text-slate-500 tabular-nums">{d.total} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className="bg-emerald-500 h-full" style={{ width: `${pct}%` }} title={`HoÃ n thÃ nh: ${d.done}`} />
                      <div className="bg-sky-400 h-full" style={{ width: `${d.total > 0 ? d.inProgress/d.total*100 : 0}%` }} title={`Äang lÃ m: ${d.inProgress}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Táº¯c ngháº½n hiá»n táº¡i */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500" /> Táº¯c ngháº½n hiá»n táº¡i
          </h3>
          {perDeptStats.filter(d => d.overdue > 0).length === 0 ? (
            <div className="text-xs text-emerald-600 text-center py-6 font-medium">â KhÃ´ng cÃ³ táº¯c ngháº½n</div>
          ) : (
            <div className="space-y-2">
              {perDeptStats.filter(d => d.overdue > 0).slice(0, 5).map((d, i) => (
                <div key={d.id} className="flex items-center gap-2 text-xs">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-[10px] shrink-0">{i + 1}</span>
                  <span className="font-medium text-slate-700 flex-1 truncate">{d.name}</span>
                  <span className="text-rose-600 font-semibold tabular-nums">{d.overdue} viá»c</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CÃ´ng viá»c quÃ¡ háº¡n */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Clock size={14} className="text-rose-500" /> CÃ´ng viá»c quÃ¡ háº¡n
          </h3>
          {allTasks.filter(t => t.dueDate && t.dueDate < today && !['done','cancelled','rejected'].includes(t.status)).length === 0 ? (
            <div className="text-xs text-emerald-600 text-center py-6 font-medium">â KhÃ´ng cÃ³ viá»c quÃ¡ háº¡n</div>
          ) : (
            <div className="space-y-2">
              {allTasks.filter(t => t.dueDate && t.dueDate < today && !['done','cancelled','rejected'].includes(t.status)).slice(0, 4).map(t => (
                <button key={t.id} onClick={() => setSelectedTask(t)} className="w-full text-left rounded-lg border border-rose-100 bg-rose-50/50 p-2 hover:bg-rose-50 transition">
                  <div className="text-xs font-semibold text-slate-800 truncate">{t.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-rose-600 font-medium">
                    <CalendarDays size={9} /> {formatDate(t.dueDate)}
                    <span className="text-slate-400 font-normal">Â· {t.createdByName}</span>
                  </div>
                </button>
              ))}
              {allTasks.filter(t => t.dueDate && t.dueDate < today && !['done','cancelled','rejected'].includes(t.status)).length > 4 && (
                <button onClick={() => jumpToTab('overdue')} className="text-xs text-emerald-700 font-semibold hover:underline">
                  Xem táº¥t cáº£ â
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== DANH SÃCH ÄIá»U PHá»I ===== */}
      <section ref={tabSectionRef} className="rounded-xl border border-slate-200 bg-white shadow-sm scroll-mt-20">
        {/* Tab header */}
        <div className="flex items-center border-b border-slate-200 px-1 overflow-x-auto">
          {tabDef.map((t) => (
            <button
              key={t.key}
              onClick={() => jumpToTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition ${
                tab === t.key
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {t.label}
              {t.badge ? (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
          <div className="flex-1" />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
          {/* Search */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 flex-1 min-w-[160px] max-w-xs">
            <Search size={12} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="TÃ¬m kiáº¿m cÃ´ng viá»c..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="bg-transparent outline-none flex-1 placeholder:text-slate-400"
            />
            {keyword && (
              <button onClick={() => setKeyword('')} className="text-slate-400 hover:text-slate-700">
                <X size={11} />
              </button>
            )}
          </div>

          {/* Status pills */}
          {tab !== 'overdue' && (
            <div className="flex items-center gap-1 overflow-x-auto">
              {(['all', 'pending_approval', 'pending', 'in_progress', 'done'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 transition ${
                    statusFilter === s
                      ? 'bg-emerald-600 text-white ring-emerald-600'
                      : 'bg-white text-slate-600 ring-slate-200 hover:ring-emerald-300 hover:text-emerald-700'
                  }`}
                >
                  {s === 'all' ? 'Táº¥t cáº£' : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setView('table')} className={`p-1.5 rounded-lg transition ${view === 'table' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400 hover:bg-slate-100'}`} title="Báº£ng">
              <ListIcon size={14} />
            </button>
            <button onClick={() => setView('kanban')} className={`p-1.5 rounded-lg transition ${view === 'kanban' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400 hover:bg-slate-100'}`} title="Kanban">
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="text-center py-12 text-slate-500">
              <Loader2 size={20} className="inline animate-spin mr-2" /> Äang táº£iâ¦
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
          ) : (
            <TableView
              tasks={tasks}
              departments={departments}
              branches={branches}
              users={users}
              onSelect={setSelectedTask}
            />
          )}
        </div>

        {/* Pagination hint */}
        {tasks.length >= 20 && (
          <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>Hiá»n thá» 1â{tasks.length} trong {tasks.length} cÃ´ng viá»c</span>
          </div>
        )}
      </section>
      {/* LiÃªn khá»i section */}
      {tab === 'cross-block' && showLienKhoiTab && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users2 size={18} className="text-indigo-600" />
            <h3 className="font-semibold text-slate-800 text-sm">Tá»ng quan liÃªn khá»i</h3>
            <span className="ml-auto text-xs text-slate-400">Theo dÃµi nhiá»m vá»¥ giao/nháº­n giá»¯a cÃ¡c khá»i</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Tá»ng liÃªn khá»i', value: allTasks.filter(t => t.crossBlock).length, color: 'text-slate-800' },
              { label: 'Äang xá»­ lÃ½', value: allTasks.filter(t => t.crossBlock && t.status === 'in_progress').length, color: 'text-sky-700' },
              { label: 'Chá» pháº£n há»i', value: allTasks.filter(t => t.crossBlock && t.status === 'pending_approval').length, color: 'text-amber-700' },
              { label: 'QuÃ¡ háº¡n', value: allTasks.filter(t => t.crossBlock && t.dueDate && t.dueDate < today && !['done','cancelled','rejected'].includes(t.status)).length, color: 'text-rose-700' },
            ].map(c => (
              <div key={c.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                <div className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.value}</div>
                <div className="text-[11px] text-slate-500 mt-1">{c.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Create modal */}
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
// TABLE VIEW â chÃ­nh theo mockup
// ============================================================================
function TableView({ tasks, departments, branches, users, onSelect }: {
  tasks: Task[];
  departments: Department[];
  branches: Branch[];
  users: User[];
  onSelect: (t: Task) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200">
            {['#', 'CÃ´ng viá»c', 'Loáº¡i', 'Khá»i chá»§ trÃ¬', 'Phá»i há»£p', 'Tráº¡ng thÃ¡i', 'Tiáº¿n Äá»', 'Äang chá»', 'Deadline'].map(h => (
              <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map((t, idx) => {
            const overdue = t.dueDate && t.dueDate < today && !['done','cancelled','rejected'].includes(t.status);
            const deptName = t.assigneeDeptId
              ? departments.find(d => d.id === t.assigneeDeptId)?.name ?? t.assigneeDeptId
              : t.assigneeFacilityId
                ? branches.find(b => b.id === t.assigneeFacilityId)?.name ?? t.assigneeFacilityId
                : 'â';
            const block = BLOCK_LABEL[t.assigneeBlock] ?? { label: t.assigneeBlock, bg: 'bg-slate-100 text-slate-700' };
            const pct = Math.max(0, Math.min(100, t.progressPct ?? 0));


            // Phá»i há»£p: Æ°u tiÃªn collaboratorDeptIds/FacilityIds, fallback vá» assigneeUserIds
            const collabDepts = ((t as any).collaboratorDeptIds ?? []).map((id: string) => departments.find(d => d.id === id)?.name ?? id);
            const collabFacilities = ((t as any).collaboratorFacilityIds ?? []).map((id: string) => branches.find(b => b.id === id)?.name ?? id);
            const allCollabNames = [...collabDepts, ...collabFacilities];
            const collabUsers = allCollabNames.length === 0
              ? (t.assigneeUserIds ?? []).slice(0, 3).map(uid => {
                  const u = users.find(u => u.id === uid);
                  return u ? u.name.split(' ').pop() ?? u.name : uid.slice(0, 4);
                })
              : [];


            const waitingOn =
              t.status === 'pending_approval' ? (t.currentApprover ?? 'NgÆ°á»i duyá»t')
              : t.status === 'requested_revision' ? t.createdByName
              : 'â';

            return (
              <tr
                key={t.id}
                onClick={() => onSelect(t)}
                className="hover:bg-emerald-50/40 cursor-pointer transition group"
              >
                <td className="py-2.5 pr-3 text-slate-400 tabular-nums">{idx + 1}</td>
                <td className="py-2.5 pr-3 min-w-[200px] max-w-[280px]">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_DOT[t.priority] ?? 'bg-slate-300'}`} title={`Æ¯u tiÃªn: ${PRIORITY_LABEL[t.priority] ?? t.priority}`} />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate group-hover:text-emerald-700 leading-tight">{t.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">#{t.id.slice(-6).toUpperCase()} Â· {t.createdByName}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 pr-3">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    t.kind === 'proposal' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'
                  }`}>
                    {t.kind === 'proposal' ? 'Äá» xuáº¥t' : 'Äiá»u phá»i'}
                  </span>
                </td>
                <td className="py-2.5 pr-3">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${block.bg}`}>
                    {block.label}
                  </span>
                </td>
                <td className="py-2.5 pr-3 min-w-[100px] max-w-[160px]">
                  {allCollabNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {allCollabNames.slice(0, 2).map((n, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold truncate max-w-[70px]" title={n}>{n}</span>
                      ))}
                      {allCollabNames.length > 2 && <span className="text-[10px] text-slate-400">+{allCollabNames.length - 2}</span>}
                    </div>
                  ) : collabUsers.length > 0 ? (
                    <div className="flex -space-x-1">
                      {collabUsers.map((n, i) => (
                        <div key={i} className="h-5 w-5 rounded-full bg-emerald-100 border border-white flex items-center justify-center text-[9px] font-bold text-emerald-700" title={n}>
                          {n.charAt(0)}
                        </div>
                      ))}
                      {(t.assigneeUserIds?.length ?? 0) > 3 && (
                        <div className="h-5 w-5 rounded-full bg-slate-200 border border-white flex items-center justify-center text-[9px] font-bold text-slate-600">
                          +{(t.assigneeUserIds?.length ?? 0) - 3}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400">â</span>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${STATUS_BG[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </td>
                <td className="py-2.5 pr-3 min-w-[80px]">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[48px]">
                      <div
                        className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-sky-400' : 'bg-slate-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-[10px] text-slate-600 font-medium">{pct}%</span>
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-slate-600 truncate max-w-[120px]">{waitingOn}</td>
                <td className="py-2.5 text-right">
                  {t.dueDate ? (
                    <span className={`tabular-nums font-medium ${overdue ? 'text-rose-600 font-semibold' : 'text-slate-600'}`}>
                      {formatDate(t.dueDate)}
                      {overdue && <span className="ml-1 text-[9px] text-rose-500 font-bold">QH</span>}
                    </span>
                  ) : (
                    <span className="text-slate-400">â</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
// ============================================================================
// KPI CARD
// ============================================================================
function KpiCard({ label, value, icon: Icon, accent, sub }: {
  label: string; value: number; icon: LucideIcon; accent: string; sub?: string;
}) {
  const accentMap: Record<string, { bg: string; text: string; iconBg: string }> = {
    sky:    { bg: 'bg-sky-50',     text: 'text-sky-700',    iconBg: 'bg-sky-100' },
    amber:  { bg: 'bg-amber-50',   text: 'text-amber-700',  iconBg: 'bg-amber-100' },
    orange: { bg: 'bg-orange-50',  text: 'text-orange-700', iconBg: 'bg-orange-100' },
    rose:   { bg: 'bg-rose-50',    text: 'text-rose-700',   iconBg: 'bg-rose-100' },
    emerald:{ bg: 'bg-emerald-50', text: 'text-emerald-700',iconBg: 'bg-emerald-100' },
    slate:  { bg: 'bg-slate-50',   text: 'text-slate-600',  iconBg: 'bg-slate-100' },
  };
  const a = accentMap[accent] ?? accentMap.slate;
  return (
    <div className={`rounded-xl border border-slate-200 p-3.5 ${a.bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${a.iconBg}`}>
          <Icon size={13} className={a.text} />
        </div>
        <span className="text-[11px] font-semibold text-slate-500 truncate">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${a.text}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================
function EmptyState({ tab }: { tab: TabKey }) {
  const msg =
    tab === 'my-tasks' ? 'ChÆ°a cÃ³ nhiá»m vá»¥ nÃ o ÄÆ°á»£c giao cho báº¡n'
    : tab === 'assigned-by-me' ? 'Báº¡n chÆ°a giao viá»c nÃ o'
    : tab === 'cross-block' ? 'KhÃ´ng cÃ³ viá»c liÃªn khá»i'
    : tab === 'pending-response' ? 'KhÃ´ng cÃ³ viá»c chá» pháº£n há»i'
    : 'KhÃ´ng cÃ³ viá»c quÃ¡ háº¡n';
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
      <Inbox size={32} className="mx-auto text-slate-300 mb-3" />
      <p className="text-sm text-slate-500">{msg}</p>
    </div>
  );
}

// ============================================================================
// KANBAN VIEW (giá»¯ nguyÃªn tá»« phiÃªn báº£n cÅ©)
// ============================================================================
const KANBAN_COLS: { key: TaskStatus; label: string; bg: string; dot: string }[] = [
  { key: 'pending_approval', label: 'Chá» duyá»t',   bg: 'bg-amber-50',   dot: 'bg-amber-400' },
  { key: 'pending',          label: 'Chá» lÃ m',     bg: 'bg-slate-50',   dot: 'bg-slate-400' },
  { key: 'in_progress',      label: 'Äang lÃ m',    bg: 'bg-sky-50',     dot: 'bg-sky-500' },
  { key: 'done',             label: 'HoÃ n thÃ nh',  bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
];

function KanbanView({ tasks, departments, branches, users, onSelect, currentUserId }: {
  tasks: Task[]; departments: Department[]; branches: Branch[]; users: User[]; onSelect: (t: Task | null) => void; currentUserId: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {KANBAN_COLS.map((col) => {
        const colTasks = tasks.filter(t => t.status === col.key);
        return (
          <div key={col.key} className={`flex-shrink-0 w-60 rounded-xl ${col.bg} p-3`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`h-2 w-2 rounded-full ${col.dot}`} />
              <h4 className="font-semibold text-slate-700 text-xs">{col.label}</h4>
              <span className="ml-auto text-xs text-slate-500 font-medium">{colTasks.length}</span>
            </div>
            <div className="space-y-2">
              {colTasks.map((t) => {
                const overdue = t.dueDate && t.dueDate < today && !['done','cancelled','rejected'].includes(t.status);
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelect(t)}
                    className="w-full text-left rounded-lg border border-white bg-white p-2.5 shadow-sm hover:shadow-md transition"
                  >
                    <div className="flex items-start gap-1.5 mb-1.5">
                      <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_DOT[t.priority] ?? 'bg-slate-300'}`} />
                      <h5 className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug">{t.title}</h5>
                    </div>
                    {t.dueDate && (
                      <div className={`flex items-center gap-1 text-[10px] ${overdue ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                        <CalendarDays size={9} /> {formatDate(t.dueDate)}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 truncate flex-1">{t.createdByName}</span>
                      {t.progressPct > 0 && (
                        <span className="text-[10px] font-semibold text-sky-700">{t.progressPct}%</span>
                      )}
                    </div>
                  </button>
                );
              })}
              {colTasks.length === 0 && (
                <div className="text-[11px] text-slate-400 text-center py-4">KhÃ´ng cÃ³</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}