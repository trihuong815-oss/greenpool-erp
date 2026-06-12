'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle, Building2, CalendarDays, CheckCircle2, Clock,
  Filter, Inbox, ListChecks, Loader2, Plus, RefreshCw,
  Search, Send, ShieldCheck, Users, X, ChevronDown,
  ArrowRight, TrendingUp, Zap, Eye, BarChart3, MessageSquare,
} from 'lucide-react';
import type {
  Task, TaskStatus, Block,
  CoordType, CoordScope, CoordStatus, CollabUnit, WaitingFor,
} from '@/lib/services/tasks/api-client';
import { tasksApi } from '@/lib/services/tasks/api-client';
import type { UserPublic } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';
import TaskCreateModal from './TaskCreateModal';
import TaskDetailModal from './TaskDetailModal';

// ============= CONSTANTS =============
type TabKey = 'all' | 'mine' | 'assigned-by-me' | 'cross-block' | 'pending-response' | 'pending-approval' | 'overdue' | 'bottleneck';

const COORD_TYPE_LABEL: Record<string, string> = {
  'dieu-phoi': 'Điều phối', 'ho-tro': 'Hỗ trợ',
  'de-xuat': 'Đề xuất', 'phe-duyet': 'Phê duyệt', 'canh-bao': 'Cảnh báo',
  'proposal': 'Đề xuất', 'assignment': 'Điều phối',
};
const COORD_TYPE_COLOR: Record<string, string> = {
  'dieu-phoi': 'bg-sky-100 text-sky-700', 'ho-tro': 'bg-indigo-100 text-indigo-700',
  'de-xuat': 'bg-violet-100 text-violet-700', 'phe-duyet': 'bg-orange-100 text-orange-700',
  'canh-bao': 'bg-rose-100 text-rose-700',
  'proposal': 'bg-violet-100 text-violet-700', 'assignment': 'bg-sky-100 text-sky-700',
};

const STATUS_LABEL: Record<string, string> = {
  'khoi-tao': 'Khởi tạo', 'tiep-nhan': 'Tiếp nhận', 'dang-xu-ly': 'Đang xử lý',
  'dang-phoi-hop': 'Đang phối hợp', 'cho-phan-hoi': 'Chờ phản hồi',
  'cho-phe-duyet': 'Chờ phê duyệt', 'hoan-thanh': 'Hoàn thành', 'dong-ho-so': 'Đóng hồ sơ',
  // Legacy
  pending_approval: 'Chờ duyệt', pending: 'Chờ làm', in_progress: 'Đang làm',
  requested_revision: 'Yêu cầu bổ sung', done: 'Hoàn thành', rejected: 'Từ chối', cancelled: 'Huỷ',
};
const STATUS_COLOR: Record<string, string> = {
  'khoi-tao': 'bg-slate-100 text-slate-600 ring-slate-200',
  'tiep-nhan': 'bg-blue-100 text-blue-700 ring-blue-200',
  'dang-xu-ly': 'bg-sky-100 text-sky-700 ring-sky-200',
  'dang-phoi-hop': 'bg-indigo-100 text-indigo-700 ring-indigo-200',
  'cho-phan-hoi': 'bg-amber-100 text-amber-700 ring-amber-200',
  'cho-phe-duyet': 'bg-orange-100 text-orange-700 ring-orange-200',
  'hoan-thanh': 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  'dong-ho-so': 'bg-slate-100 text-slate-500 ring-slate-200',
  pending_approval: 'bg-orange-100 text-orange-700 ring-orange-200',
  pending: 'bg-slate-100 text-slate-600 ring-slate-200',
  in_progress: 'bg-sky-100 text-sky-700 ring-sky-200',
  requested_revision: 'bg-amber-100 text-amber-700 ring-amber-200',
  done: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-100 text-slate-400 ring-slate-200',
};
const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-rose-500', normal: 'bg-amber-400', low: 'bg-slate-300',
};
const PRIORITY_LABEL: Record<string, string> = { high: 'Cao', normal: 'Trung bình', low: 'Thấp' };
const BLOCK_LABEL: Record<string, { label: string; bg: string }> = {
  KD: { label: 'KD', bg: 'bg-emerald-100 text-emerald-700' },
  VP: { label: 'VP', bg: 'bg-indigo-100 text-indigo-700' },
  all: { label: 'Toan cum', bg: 'bg-slate-100 text-slate-600' },
};

function getTaskStatus(t: Task): string {
  return (t as any).coordStatus || t.status;
}
function getDaysWaiting(since: string): number {
  return Math.floor((Date.now() - new Date(since).getTime()) / 86400000);
}
function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function isOverdue(t: Task): boolean {
  if (!t.dueDate) return false;
  if (['done','hoan-thanh','cancelled','dong-ho-so','rejected'].includes(getTaskStatus(t))) return false;
  return new Date(t.dueDate) < new Date();
}

// ============= PROPS =============
interface Props {
  userId: string; userName: string; userRole: string; roleCode: string;
  departments: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  users: UserPublic[];
  isAdmin: boolean; isCEO: boolean;
  canCreateAssignment: boolean; canCreateProposal: boolean;
}

// ============= MAIN COMPONENT =============
export default function GiaoViecClient({
  userId, userName, userRole, roleCode,
  departments, branches, users,
  isAdmin, isCEO, canCreateAssignment, canCreateProposal,
}: Props) {
  const searchParams = useSearchParams();
  const tabSectionRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<TabKey>('all');
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterScope, setFilterScope] = useState<string>('all');
  const [showCreate, setShowCreate] = useState<'assignment' | 'proposal' | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const showAllTab = isAdmin || isCEO;
  const showCrossBlock = isAdmin || isCEO;

  async function loadTasks() {
    setLoading(true);
    try {
      const mode = (tab === 'mine' || tab === 'overdue') ? 'assigned' : 'created';
      const tasks = await tasksApi.list({ mode });
      setAllTasks(tasks);
    } catch { setAllTasks([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadTasks(); }, [tab]);

  function refresh() { loadTasks(); }

  function jumpToTab(t: TabKey) {
    setTab(t);
    requestAnimationFrame(() => {
      tabSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ---- FILTERED TASKS ----
  const filteredTasks = useMemo(() => {
    let tasks = allTasks;
    if (tab === 'mine') tasks = tasks.filter(t => t.assigneeUserIds?.includes(userId) || t.assigneeDeptId === roleCode || t.assigneeFacilityId);
    if (tab === 'assigned-by-me') tasks = tasks.filter(t => t.createdBy === userId);
    if (tab === 'cross-block') tasks = tasks.filter(t => t.crossBlock);
    if (tab === 'pending-response') tasks = tasks.filter(t => ['cho-phan-hoi','pending_approval','requested_revision'].includes(getTaskStatus(t)));
    if (tab === 'pending-approval') tasks = tasks.filter(t => ['cho-phe-duyet','pending_approval'].includes(getTaskStatus(t)));
    if (tab === 'overdue') tasks = tasks.filter(isOverdue);
    if (tab === 'bottleneck') {
      tasks = tasks.filter(t => (t as any).waitingFor);
      tasks = [...tasks].sort((a, b) => {
        const da = getDaysWaiting((a as any).waitingFor?.since || a.createdAt);
        const db = getDaysWaiting((b as any).waitingFor?.since || b.createdAt);
        return db - da;
      });
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      tasks = tasks.filter(t => t.title.toLowerCase().includes(kw) || (t.description||'').toLowerCase().includes(kw));
    }
    if (filterType !== 'all') tasks = tasks.filter(t => ((t as any).coordType || t.kind) === filterType);
    if (filterStatus !== 'all') tasks = tasks.filter(t => getTaskStatus(t) === filterStatus);
    if (filterScope !== 'all') {
      if (filterScope === 'lien-khoi') tasks = tasks.filter(t => t.crossBlock);
      else tasks = tasks.filter(t => ((t as any).coordScope) === filterScope);
    }
    return tasks;
  }, [allTasks, tab, keyword, filterType, filterStatus, filterScope, userId, roleCode]);

  // ---- KPI ----
  const kpi = useMemo(() => {
    const all = allTasks;
    return {
      total: all.length,
      needAction: all.filter(t => ['cho-phan-hoi','cho-phe-duyet','pending_approval','requested_revision'].includes(getTaskStatus(t))).length,
      inProgress: all.filter(t => ['dang-xu-ly','dang-phoi-hop','in_progress'].includes(getTaskStatus(t))).length,
      overdue: all.filter(isOverdue).length,
      done: all.filter(t => ['hoan-thanh','dong-ho-so','done'].includes(getTaskStatus(t))).length,
      bottleneck: all.filter(t => (t as any).waitingFor).length,
      crossBlock: all.filter(t => t.crossBlock).length,
      pendingApproval: all.filter(t => ['cho-phe-duyet','pending_approval'].includes(getTaskStatus(t))).length,
    };
  }, [allTasks, today]);

  // ---- PER-DEPT STATS ----
  const perDeptStats = useMemo(() => {
    const map: Record<string, { id: string; name: string; total: number; done: number; inProgress: number; overdue: number }> = {};
    allTasks.forEach(t => {
      const deptId = t.assigneeDeptId || t.assigneeFacilityId || t.assigneeBlock || 'unknown';
      const deptName = departments.find(d => d.id === deptId)?.name || branches.find(b => b.id === deptId)?.name || deptId;
      if (!map[deptId]) map[deptId] = { id: deptId, name: deptName, total: 0, done: 0, inProgress: 0, overdue: 0 };
      map[deptId].total++;
      if (['done','hoan-thanh'].includes(getTaskStatus(t))) map[deptId].done++;
      if (['in_progress','dang-xu-ly','dang-phoi-hop'].includes(getTaskStatus(t))) map[deptId].inProgress++;
      if (isOverdue(t)) map[deptId].overdue++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [allTasks, departments, branches]);

  // ---- WAITING-FOR TOP LIST ----
  const waitingList = useMemo(() => {
    return allTasks
      .filter(t => (t as any).waitingFor)
      .map(t => ({
        task: t,
        wf: (t as any).waitingFor as WaitingFor,
        days: getDaysWaiting(((t as any).waitingFor as WaitingFor).since),
      }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 5);
  }, [allTasks]);

  // ---- BOTTLENECK: who holds the most ----
  const bottleneckByPerson = useMemo(() => {
    const map: Record<string, { name: string; count: number }> = {};
    allTasks.filter(t => (t as any).waitingFor).forEach(t => {
      const wf = (t as any).waitingFor as WaitingFor;
      if (!map[wf.unitId]) map[wf.unitId] = { name: wf.unitName, count: 0 };
      map[wf.unitId].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [allTasks]);

  const tabDef: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'all', label: 'Tất cả', badge: allTasks.length || undefined },
    { key: 'mine', label: 'Tôi phụ trách' },
    { key: 'assigned-by-me', label: 'Tôi giao' },
    ...(showCrossBlock ? [{ key: 'cross-block' as TabKey, label: 'Liên khối', badge: kpi.crossBlock || undefined }] : []),
    { key: 'pending-response', label: 'Chờ phản hồi', badge: kpi.needAction || undefined },
    { key: 'pending-approval', label: 'Chờ duyệt', badge: kpi.pendingApproval || undefined },
    { key: 'overdue', label: 'Quá hạn', badge: kpi.overdue || undefined },
    { key: 'bottleneck', label: 'Điểm nghẽn', badge: kpi.bottleneck || undefined },
  ];

  const approvalCount = kpi.pendingApproval;

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* ===== DASHBOARD: 5 KHOI DIEU HANH ===== */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">Dieu phoi cong viec</h2>
            <p className="text-xs text-slate-500 mt-0.5">{new Date().toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' })}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition" title="Lam moi">
              <RefreshCw size={14} />
            </button>
            {(canCreateAssignment || canCreateProposal) && (
              <button
                onClick={() => setShowCreate(canCreateAssignment ? 'assignment' : 'proposal')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 shadow-sm transition"
              >
                <Plus size={14} /> Tao dieu phoi
              </button>
            )}
          </div>
        </div>

        {/* 5 KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          <KpiCard label="Can toi xu ly" value={kpi.needAction} icon={Inbox} accent={kpi.needAction > 0 ? 'rose' : 'slate'} onClick={() => jumpToTab('pending-response')} />
          <KpiCard label="Dang xu ly" value={kpi.inProgress} icon={Clock} accent="sky" onClick={() => jumpToTab('mine')} />
          <KpiCard label="Lien khoi" value={kpi.crossBlock} icon={ArrowRight} accent={kpi.crossBlock > 0 ? 'indigo' : 'slate'} onClick={() => jumpToTab('cross-block')} />
          <KpiCard label="Qua han" value={kpi.overdue} icon={AlertTriangle} accent={kpi.overdue > 0 ? 'rose' : 'slate'} onClick={() => jumpToTab('overdue')} />
          <KpiCard label="Hoan thanh" value={kpi.done} icon={CheckCircle2} accent="emerald" />
        </div>

        {/* KHOI 1–3: Can xu ly / Tinh hinh / Diem nghen */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

          {/* KHOI 1: CAN TOI XU LY */}
          <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
            <h3 className="text-sm font-bold text-rose-800 mb-3 flex items-center gap-2">
              <Inbox size={14} className="text-rose-500" /> Can toi xu ly
            </h3>
            {kpi.needAction === 0 ? (
              <p className="text-xs text-emerald-600 text-center py-4 font-medium">Khong co viec can xu ly</p>
            ) : (
              <div className="space-y-2">
                {[
                  { label: 'Chờ duyệt', count: kpi.pendingApproval, color: 'text-orange-600', tab: 'pending-approval' as TabKey },
                  { label: 'Chờ phản hồi', count: kpi.needAction - kpi.pendingApproval, color: 'text-amber-600', tab: 'pending-response' as TabKey },
                  { label: 'Quá hạn', count: kpi.overdue, color: 'text-rose-600', tab: 'overdue' as TabKey },
                  { label: 'Liên khối', count: kpi.crossBlock, color: 'text-indigo-600', tab: 'cross-block' as TabKey },
                ].filter(r => r.count > 0).map(r => (
                  <button key={r.label} onClick={() => jumpToTab(r.tab)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-slate-100 hover:border-rose-200 hover:bg-rose-50 transition text-left">
                    <span className="text-xs font-medium text-slate-700">{r.label}</span>
                    <span className={`text-sm font-bold tabular-nums ${r.color}`}>{r.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* KHOI 2: TINH HINH DIEU PHOI */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <BarChart3 size={14} className="text-sky-600" /> Tinh hinh dieu phoi
            </h3>
            <div className="space-y-2">
              {perDeptStats.slice(0, 5).map(d => {
                const pct = d.total > 0 ? Math.round(d.done / d.total * 100) : 0;
                return (
                  <div key={d.id}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-medium text-slate-700 truncate max-w-[120px]">{d.name}</span>
                      <span className="text-slate-500 tabular-nums">{d.done}/{d.total}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {perDeptStats.length === 0 && <p className="text-xs text-slate-400 text-center py-3">Chua co du lieu</p>}
            </div>
          </div>

          {/* KHOI 3: DIEM NGHEN */}
          <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
            <h3 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
              <Zap size={14} className="text-amber-500" /> Diem nghen — Dang giu viec
            </h3>
            {bottleneckByPerson.length === 0 ? (
              <p className="text-xs text-emerald-600 text-center py-4 font-medium">Khong co diem nghen</p>
            ) : (
              <div className="space-y-2">
                {bottleneckByPerson.map((b, i) => (
                  <div key={b.name} className="flex items-center gap-2 text-xs">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-xs shrink-0">{i+1}</span>
                    <span className="font-medium text-slate-700 flex-1 truncate">{b.name}</span>
                    <span className="text-rose-600 font-semibold tabular-nums">{b.count} viec</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* KHOI 4-5: LIEN KHOI + TOP VIEC CAN QUAN TAM */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* KHOI 4: LIEN KHOI KD <-> VP */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
            <h3 className="text-sm font-bold text-indigo-800 mb-3 flex items-center gap-2">
              <ArrowRight size={14} className="text-indigo-500" /> Lien khoi KD {String.fromCharCode(8596)} VP
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Tong viec', val: kpi.crossBlock, color: 'text-indigo-700' },
                { label: 'Đang xử lý', val: allTasks.filter(t => t.crossBlock && ['dang-xu-ly','dang-phoi-hop','in_progress'].includes(getTaskStatus(t))).length, color: 'text-sky-700' },
                { label: 'Chờ phản hồi', val: allTasks.filter(t => t.crossBlock && ['cho-phan-hoi','pending_approval','requested_revision'].includes(getTaskStatus(t))).length, color: 'text-amber-700' },
                { label: 'Quá hạn', val: allTasks.filter(t => t.crossBlock && isOverdue(t)).length, color: 'text-rose-700' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-lg border border-indigo-100 px-3 py-2 text-center">
                  <div className={`text-xl font-bold tabular-nums ${item.color}`}>{item.val}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* KHOI 5: TOP VIEC CAN QUAN TAM — WAITING-FOR ENGINE */}
          <div className="rounded-xl border border-rose-100 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Eye size={14} className="text-rose-500" /> Top viec can quan tam
              <span className="ml-auto text-xs text-slate-400 font-normal">Da cho / Noi dung</span>
            </h3>
            {waitingList.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Khong co viec dang cho</p>
            ) : (
              <div className="space-y-2">
                {waitingList.map(({ task: t, wf, days }) => (
                  <button key={t.id} onClick={() => setSelectedTask(t)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-100 hover:border-rose-200 hover:bg-rose-50/50 transition">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-800 truncate">{t.title}</div>
                      <div className="text-xs text-slate-500 truncate">{wf.unitName} — {wf.content}</div>
                    </div>
                    <span className={`text-xs font-bold tabular-nums shrink-0 ${days >= 3 ? 'text-rose-600' : days >= 1 ? 'text-amber-600' : 'text-slate-500'}`}>
                      {days === 0 ? 'Hom nay' : `${days} ngay`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== TABS + DANH SACH ===== */}
      <section ref={tabSectionRef} className="rounded-xl border border-slate-200 bg-white shadow-sm scroll-mt-20">

        {/* TAB HEADER */}
        <div className="flex items-center border-b border-slate-200 px-1 overflow-x-auto">
          {tabDef.map(t => (
            <button
              key={t.key}
              onClick={() => jumpToTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition ${
                tab === t.key
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {t.label}
              {t.badge ? (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* FILTER BAR */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
          {/* Search */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 flex-1 min-w-[160px] max-w-xs">
            <Search size={12} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Tim kiem cong viec..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="bg-transparent outline-none flex-1 placeholder:text-slate-400 text-sm"
            />
            {keyword && <button onClick={() => setKeyword('')} className="text-slate-400 hover:text-slate-700"><X size={12} /></button>}
          </div>

          {/* Filter: Loai */}
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 outline-none cursor-pointer">
            <option value="all">Tat ca loai</option>
            <option value="dieu-phoi">Dieu phoi</option>
            <option value="ho-tro">Ho tro</option>
            <option value="de-xuat">De xuat</option>
            <option value="phe-duyet">Phe duyet</option>
            <option value="canh-bao">Canh bao</option>
          </select>

          {/* Filter: Trang thai */}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 outline-none cursor-pointer">
            <option value="all">Tat ca trang thai</option>
            <option value="khoi-tao">Khoi tao</option>
            <option value="tiep-nhan">Tiep nhan</option>
            <option value="dang-xu-ly">Dang xu ly</option>
            <option value="dang-phoi-hop">Dang phoi hop</option>
            <option value="cho-phan-hoi">Cho phan hoi</option>
            <option value="cho-phe-duyet">Cho phe duyet</option>
            <option value="hoan-thanh">Hoan thanh</option>
          </select>

          {/* Filter: Pham vi */}
          <select value={filterScope} onChange={e => setFilterScope(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 outline-none cursor-pointer">
            <option value="all">Tat ca pham vi</option>
            <option value="noi-bo-phong">Noi bo phong</option>
            <option value="noi-bo-khoi">Noi bo khoi</option>
            <option value="lien-khoi">Lien khoi</option>
            <option value="lien-co-so">Lien co so</option>
            <option value="du-an">Du an</option>
          </select>

          <div className="flex-1" />
          <span className="text-xs text-slate-400">{filteredTasks.length} ket qua</span>
        </div>

        {/* TABLE */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Dang tai...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <ListChecks size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Khong co cong viec nao</p>
          </div>
        ) : (
          <CoordTable
            tasks={filteredTasks}
            departments={departments}
            branches={branches}
            users={users}
            onSelect={setSelectedTask}
            today={today}
          />
        )}
      </section>

      {/* MODALS */}
      {showCreate && (
        <TaskCreateModal
          kind={showCreate}
          departments={departments}
          branches={branches}
          users={users}
          roleCode={roleCode}
          userRole={userRole}
          userId={userId}
          userName={userName}
          onClose={() => setShowCreate(null)}
          onChange={() => { setShowCreate(null); loadTasks(); }}
        />
      )}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          departments={departments}
          branches={branches}
          users={users}
          roleCode={roleCode}
          userRole={userRole}
          userId={userId}
          userName={userName}
          onClose={() => setSelectedTask(null)}
          onChange={() => { setSelectedTask(null); loadTasks(); }}
        />
      )}
    </div>
  );
}

// ============= SUB-COMPONENTS =============

// CoordTable — bang hien dai 8 cot
function CoordTable({ tasks, departments, branches, users, onSelect, today }: {
  tasks: Task[]; departments: { id: string; name: string }[]; branches: { id: string; name: string }[];
  users: UserPublic[]; onSelect: (t: Task) => void; today: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            {['#', 'Cong viec', 'Loai', 'Chu tri', 'Phoi hop', 'Dang cho', 'Deadline', 'Trang thai', 'UU tien'].map(h => (
              <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2.5 px-3 whitespace-nowrap first:pl-4 last:pr-4">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map((t, idx) => {
            const status = getTaskStatus(t);
            const overdue = isOverdue(t);
            const coordType = (t as any).coordType || t.kind;
            const deptName = t.assigneeDeptId
              ? departments.find(d => d.id === t.assigneeDeptId)?.name ?? t.assigneeDeptId
              : t.assigneeFacilityId
                ? branches.find(b => b.id === t.assigneeFacilityId)?.name ?? t.assigneeFacilityId
                : '—';
            const block = BLOCK_LABEL[t.assigneeBlock] || BLOCK_LABEL['all'];
            const collabUnits: CollabUnit[] = (t as any).collabUnits || [];
            const wf = (t as any).waitingFor as WaitingFor | undefined;
            const days = wf ? getDaysWaiting(wf.since) : null;

            return (
              <tr key={t.id} onClick={() => onSelect(t)}
                className="hover:bg-emerald-50/40 cursor-pointer transition group">
                {/* # */}
                <td className="py-3 px-3 pl-4 text-xs text-slate-400 tabular-nums">{idx+1}</td>

                {/* Cong viec */}
                <td className="py-3 px-3 min-w-[220px] max-w-[300px]">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_DOT[t.priority] ?? 'bg-slate-300'}`}
                      title={`Uu tien: ${PRIORITY_LABEL[t.priority] ?? t.priority}`} />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate group-hover:text-emerald-700 leading-tight">{t.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">#{t.id.slice(-6).toUpperCase()} · {t.createdByName}</div>
                    </div>
                  </div>
                </td>

                {/* Loai */}
                <td className="py-3 px-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${COORD_TYPE_COLOR[coordType] || 'bg-slate-100 text-slate-600'}`}>
                    {COORD_TYPE_LABEL[coordType] || coordType}
                  </span>
                </td>

                {/* Chu tri */}
                <td className="py-3 px-3">
                  <div>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${block.bg}`}>{block.label}</span>
                    <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[100px]">{deptName}</div>
                  </div>
                </td>

                {/* Phoi hop */}
                <td className="py-3 px-3 min-w-[100px] max-w-[160px]">
                  {collabUnits.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {collabUnits.slice(0, 2).map((cu, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium truncate max-w-[70px]" title={cu.unitName}>{cu.unitName}</span>
                      ))}
                      {collabUnits.length > 2 && <span className="text-xs text-slate-400">+{collabUnits.length - 2}</span>}
                    </div>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>

                {/* Dang cho — WAITING-FOR ENGINE */}
                <td className="py-3 px-3 min-w-[140px]">
                  {wf ? (
                    <div>
                      <div className="text-xs font-semibold text-slate-700 truncate max-w-[130px]">{wf.unitName}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[130px]">{wf.content}</div>
                      <div className={`text-xs font-bold tabular-nums ${days! >= 3 ? 'text-rose-600' : days! >= 1 ? 'text-amber-600' : 'text-slate-500'}`}>
                        {days === 0 ? 'Hom nay' : `${days} ngay`}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>

                {/* Deadline */}
                <td className="py-3 px-3 whitespace-nowrap">
                  {t.dueDate ? (
                    <span className={`text-xs font-medium ${overdue ? 'text-rose-600 font-bold' : t.dueDate === today ? 'text-amber-600 font-bold' : 'text-slate-600'}`}>
                      {formatDate(t.dueDate)}
                      {overdue && <span className="ml-1 text-rose-500">(!)</span>}
                    </span>
                  ) : <span className="text-slate-300 text-xs">—</span>}
                </td>

                {/* Trang thai */}
                <td className="py-3 px-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ${STATUS_COLOR[status] || 'bg-slate-100 text-slate-500 ring-slate-200'}`}>
                    {STATUS_LABEL[status] || status}
                  </span>
                </td>

                {/* Uu tien */}
                <td className="py-3 px-3 pr-4">
                  <span className={`text-xs font-semibold ${t.priority === 'high' ? 'text-rose-600' : t.priority === 'normal' ? 'text-amber-600' : 'text-slate-400'}`}>
                    {PRIORITY_LABEL[t.priority] || t.priority}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// KpiCard
function KpiCard({ label, value, icon: Icon, accent, onClick, sub }: {
  label: string; value: number; icon: LucideIcon; accent: string; onClick?: () => void; sub?: string;
}) {
  const a: Record<string, { bg: string; text: string; iconBg: string; hover: string }> = {
    sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',    iconBg: 'bg-sky-100',    hover: 'hover:border-sky-200 hover:bg-sky-50' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',  iconBg: 'bg-amber-100',  hover: 'hover:border-amber-200' },
    orange:  { bg: 'bg-orange-50',  text: 'text-orange-700', iconBg: 'bg-orange-100', hover: 'hover:border-orange-200' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-600',   iconBg: 'bg-rose-100',   hover: 'hover:border-rose-200 hover:bg-rose-50' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700',iconBg: 'bg-emerald-100',hover: 'hover:border-emerald-200' },
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700', iconBg: 'bg-indigo-100', hover: 'hover:border-indigo-200' },
    slate:   { bg: 'bg-white',      text: 'text-slate-700',  iconBg: 'bg-slate-100',  hover: '' },
  };
  const s = a[accent] || a.slate;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick}
      className={`rounded-xl border border-slate-200 p-3.5 ${s.bg} ${onClick ? 'cursor-pointer transition ' + s.hover : ''} text-left w-full`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${s.iconBg}`}>
          <Icon size={14} className={s.text} />
        </div>
        <span className="text-xs font-semibold text-slate-500 truncate">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${s.text}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </Tag>
  );
}
