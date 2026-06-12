'use client';

// /de-xuat V2 — anh chốt 2026-06-12:
//   - 6 tab theo 7 trạng thái (gom 'tu_choi'+'chuyen_dieu_phoi' vào "Đã xử lý"):
//     Tất cả · Nháp · Đã gửi · Đang xem xét · Đã phê duyệt · Đã xử lý
//   - V1 vẫn reuse collection `tasks` (kind='proposal'). Adapt Task.status → ProposalStatus mới.
//   - Bỏ tier-based classification cũ.
//   - "+ Tạo đề xuất mới" mở CreateProposalModal (chuỗi approver picker theo SPEC).
//   - Click row → mở ProposalDetailDrawer.
//   - Permission: !canCreateProposal(role) → disable nút.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus,
  Search,
  Loader2,
  Inbox,
  FileEdit,
  Send,
  Clock,
  CheckCircle2,
  Archive,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { tasksApi, type Task } from '@/lib/services/tasks/api-client';
import CreateProposalModal, {
  type CreateProposalPayload,
} from './_components/CreateProposalModal';
import ProposalDetailDrawer, {
  type ProposalV2,
  type ProposalApproverV2,
  type ApproverStepStatus,
} from './_components/ProposalDetailDrawer';
import {
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_STATUS_COLOR,
  PROPOSAL_KIND_LABEL,
  type ProposalStatus,
  type ProposalKind,
} from './_components/types';
import { canCreateProposal } from '../dieu-phoi/_lib/permissions';

// ──────────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────────
interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface UserLite { id: string; name: string; roleId: string; branchId: string | null; departmentId: string | null; }

interface Props {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  currentBranchId: string | null;
  currentDepartmentId: string | null;
  departments: Department[];
  branches: Branch[];
  users: UserLite[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Tabs — 6 tabs gom theo SPEC
// ──────────────────────────────────────────────────────────────────────────────
type TabKey = 'all' | 'nhap' | 'da_gui' | 'dang_xem_xet' | 'da_phe_duyet' | 'da_xu_ly';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'all',           label: 'Tất cả',       icon: Inbox },
  { key: 'nhap',          label: 'Nháp',         icon: FileEdit },
  { key: 'da_gui',        label: 'Đã gửi',       icon: Send },
  { key: 'dang_xem_xet',  label: 'Đang xem xét', icon: Clock },
  { key: 'da_phe_duyet',  label: 'Đã phê duyệt', icon: CheckCircle2 },
  { key: 'da_xu_ly',      label: 'Đã xử lý',     icon: Archive },
];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers: Task → ProposalV2 adapter (V1 reuse collection `tasks`)
// ──────────────────────────────────────────────────────────────────────────────

/** Map Task.status → ProposalStatus mới. */
function adaptStatus(t: Task): ProposalStatus {
  const meta = (t as any).meta ?? {};
  if (t.status === 'pending_approval') return 'dang_xem_xet';
  if (t.status === 'requested_revision') return 'yeu_cau_bo_sung';
  if (t.status === 'rejected') return 'tu_choi';
  if (t.status === 'cancelled') return 'tu_choi';
  if (t.status === 'pending') return 'da_phe_duyet';
  if (t.status === 'in_progress') return 'da_phe_duyet';
  if (t.status === 'done') {
    if (meta.linkedCoordId) return 'chuyen_dieu_phoi';
    return 'da_phe_duyet';
  }
  // Fallback: chưa gửi
  return 'nhap';
}

/** Map Task.proposalType (cũ: tai_chinh|van_hanh) → ProposalKind V2 (5 loại). */
function adaptKind(t: Task): ProposalKind {
  const pt = t.proposalType;
  if (pt === 'tai_chinh') return 'tai_chinh';
  if (pt === 'van_hanh') return 'van_hanh';
  return 'khac';
}

/** Gom tabKey từ ProposalStatus. */
function statusToTab(s: ProposalStatus): TabKey {
  if (s === 'nhap') return 'nhap';
  if (s === 'da_gui') return 'da_gui';
  if (s === 'dang_xem_xet' || s === 'yeu_cau_bo_sung') return 'dang_xem_xet';
  if (s === 'da_phe_duyet') return 'da_phe_duyet';
  // tu_choi + chuyen_dieu_phoi → "Đã xử lý"
  return 'da_xu_ly';
}

/** Map approverChain string[] (Phase 12.5 lưu uid list) → ProposalApproverV2[]. */
function adaptApproverChain(t: Task, users: UserLite[]): ProposalApproverV2[] {
  const chain: string[] = Array.isArray((t as any).approvalChain) ? (t as any).approvalChain : [];
  const completed: any[] = Array.isArray(t.approvalsCompleted) ? t.approvalsCompleted : [];
  const currentApprover = t.currentApprover ?? null;

  function findUser(idOrRole: string): UserLite | undefined {
    if (idOrRole.startsWith('user:')) {
      const uid = idOrRole.slice(5);
      return users.find((u) => u.id === uid);
    }
    if (idOrRole.startsWith('role:')) {
      const roleId = idOrRole.slice(5);
      return users.find((u) => u.roleId === roleId);
    }
    // uid trần
    return users.find((u) => u.id === idOrRole) ?? users.find((u) => u.roleId === idOrRole);
  }

  return chain.map((entry, idx) => {
    const u = findUser(entry);
    const uid = u?.id ?? (entry.startsWith('user:') ? entry.slice(5) : '');
    const name = u?.name ?? (entry.startsWith('role:') ? entry.slice(5) : entry);
    const role = u?.roleId ?? (entry.startsWith('role:') ? entry.slice(5) : '');

    // Tìm completed step (theo uid hoặc role)
    const done = completed.find((c) => (c.uid && c.uid === uid) || (c.role && c.role === role));
    let stepStatus: ApproverStepStatus = 'cho_tiep';
    if (done) {
      stepStatus =
        done.decision === 'approved' ? 'da_duyet' :
        done.decision === 'rejected' ? 'tu_choi' :
        'yeu_cau_bo_sung';
    } else if (currentApprover && (currentApprover === entry || currentApprover === `user:${uid}` || currentApprover === `role:${role}`)) {
      stepStatus = 'dang_xem_xet';
    } else if (idx === 0 && !currentApprover && completed.length === 0 && t.status === 'pending_approval') {
      stepStatus = 'dang_xem_xet';
    }
    return {
      id: `step-${idx}`,
      uid,
      name,
      role,
      status: stepStatus,
      decidedAt: done?.decidedAt,
      note: done?.notes,
    };
  });
}

function adaptTaskToProposal(t: Task, users: UserLite[]): ProposalV2 {
  const yyyy = (t.createdAt ?? '').slice(0, 4) || new Date().getFullYear().toString();
  const code = `DX-${yyyy}-${t.id.slice(0, 4).toUpperCase()}`;
  const meta = (t as any).meta ?? {};
  return {
    id: t.id,
    code,
    title: t.title,
    description: t.description ?? '',
    kind: adaptKind(t),
    status: adaptStatus(t),
    estimatedCost: t.estimatedCost ?? null,
    deadline: t.dueDate ?? undefined,
    creatorUid: t.createdBy,
    creatorName: t.createdByName ?? '',
    creatorRole: t.createdByRole ?? '',
    createdAt: t.createdAt,
    approverChain: adaptApproverChain(t, users),
    attachments: [],
    linkedCoordTaskId: meta.linkedCoordId ?? undefined,
    linkedCoordTaskCode: meta.linkedCoordCode ?? undefined,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
export function DeXuatClient(props: Props) {
  const { currentUserId, currentUserName, currentUserRole, users } = props;

  const canCreate = canCreateProposal(currentUserRole);

  const [tab, setTab] = useState<TabKey>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<ProposalV2 | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const searchParams = useSearchParams();
  useEffect(() => {
    const taskIdParam = searchParams.get('taskId') ?? searchParams.get('id');
    if (taskIdParam) {
      tasksApi.get(taskIdParam)
        .then((t) => { if (t.kind === 'proposal') setSelectedProposal(adaptTaskToProposal(t, users)); })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    tasksApi.list({ mode: 'all', kind: 'proposal', q: keyword || undefined })
      .then((rows) => { if (!cancelled) setTasks(rows); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Lỗi tải đề xuất'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [keyword, refreshKey]);

  // Adapt + filter
  const proposals: ProposalV2[] = useMemo(
    () => tasks.map((t) => adaptTaskToProposal(t, users)),
    [tasks, users],
  );

  const filtered = useMemo(() => {
    if (tab === 'all') return proposals;
    return proposals.filter((p) => statusToTab(p.status) === tab);
  }, [proposals, tab]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      all: proposals.length,
      nhap: 0,
      da_gui: 0,
      dang_xem_xet: 0,
      da_phe_duyet: 0,
      da_xu_ly: 0,
    };
    for (const p of proposals) {
      const k = statusToTab(p.status);
      c[k] += 1;
    }
    return c;
  }, [proposals]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleCreateProposal(payload: CreateProposalPayload) {
    try {
      // V1: map approverChain → approverUserIds (uid only); fallback name nếu thiếu uid.
      const approverUserIds = payload.approverChain
        .map((a) => a.uid)
        .filter((x): x is string => !!x);

      const body: any = {
        kind: 'proposal',
        title: payload.title,
        description: payload.description,
        priority: 'normal',
        dueDate: payload.deadline || null,
        // Server force assigneeBlock + assigneeUserIds=[creator] cho kind='proposal'.
        assigneeBlock: 'KD',
        assigneeUserIds: [currentUserId],
        // Đề xuất V2 cũ: tai_chinh hoặc van_hanh. V1 mapping mới 5 loại → fallback van_hanh nếu khac/co_so/nhan_su.
        proposalType: payload.kind === 'tai_chinh' ? 'tai_chinh' : 'van_hanh',
        financialGroup: payload.kind === 'tai_chinh' ? 'chi_khac' : null,
        estimatedCost: payload.estimatedCost,
        approverUserIds,
      };
      await tasksApi.create(body);
      setShowCreate(false);
      refresh();
    } catch (e: any) {
      alert(`Tạo đề xuất thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }

  async function handleApprove(proposalId: string, note?: string) {
    try {
      await (tasksApi as any).approve?.(proposalId, { notes: note });
      setSelectedProposal(null);
      refresh();
    } catch (e: any) {
      // Fallback raw fetch nếu API chưa expose method
      try {
        await fetch(`/api/tasks/${proposalId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: note }),
        });
        setSelectedProposal(null);
        refresh();
      } catch {
        alert(`Phê duyệt thất bại: ${e?.message ?? 'lỗi không xác định'}`);
      }
    }
  }

  async function handleReject(proposalId: string, reason: string) {
    try {
      await fetch(`/api/tasks/${proposalId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      setSelectedProposal(null);
      refresh();
    } catch (e: any) {
      alert(`Từ chối thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }

  async function handleRequestRevision(proposalId: string, reason: string) {
    try {
      await fetch(`/api/tasks/${proposalId}/request-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reason }),
      });
      setSelectedProposal(null);
      refresh();
    } catch (e: any) {
      alert(`Yêu cầu bổ sung thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }

  function handleConvertToCoord(proposalId: string) {
    // V1: redirect sang /dieu-phoi kèm query để auto-fill (V2 sẽ persist linkedCoordId).
    if (typeof window !== 'undefined') {
      window.location.href = `/dieu-phoi?fromProposal=${encodeURIComponent(proposalId)}`;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900">Đề xuất</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tổng {proposals.length} đề xuất · {counts.dang_xem_xet} đang xem xét ·{' '}
            {counts.da_phe_duyet} đã phê duyệt · {counts.da_xu_ly} đã xử lý
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            title="Làm mới"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => canCreate && setShowCreate(true)}
            disabled={!canCreate}
            title={canCreate ? 'Tạo đề xuất mới' : 'Bạn không có quyền tạo đề xuất'}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm ${
              canCreate
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Plus size={15} /> Tạo đề xuất mới
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
                <span
                  className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
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
            placeholder="Tìm kiếm tiêu đề / mã đề xuất…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
          />
        </div>
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
            <p className="text-sm text-slate-500">Chưa có đề xuất nào.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="px-3 py-2.5">Mã</th>
                  <th className="px-3 py-2.5">Tiêu đề</th>
                  <th className="px-3 py-2.5">Loại</th>
                  <th className="px-3 py-2.5">Người tạo</th>
                  <th className="px-3 py-2.5">Cấp duyệt hiện tại</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-3 py-2.5 text-right">Ngày tạo</th>
                  <th className="px-1 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const dateStr = p.createdAt
                    ? new Date(p.createdAt).toLocaleDateString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : '—';
                  const activeStep = p.approverChain.find((s) => s.status === 'dang_xem_xet');
                  const currentApproverLabel = activeStep
                    ? activeStep.name
                    : p.approverChain.length === 0
                      ? '—'
                      : 'Đã hoàn tất chuỗi';
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedProposal(p)}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-3 py-2.5 text-[11px] font-bold text-slate-600 tabular-nums whitespace-nowrap">
                        {p.code}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800 line-clamp-1">{p.title}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                          {PROPOSAL_KIND_LABEL[p.kind]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{p.creatorName}</td>
                      <td className="px-3 py-2.5 text-slate-700">{currentApproverLabel}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${PROPOSAL_STATUS_COLOR[p.status]}`}
                        >
                          {PROPOSAL_STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums whitespace-nowrap">
                        {dateStr}
                      </td>
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
        <CreateProposalModal
          open
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateProposal}
          users={users.map((u) => ({ id: u.id, name: u.name, roleId: u.roleId }))}
        />
      )}
      {selectedProposal && (
        <ProposalDetailDrawer
          proposal={selectedProposal}
          currentUserUid={currentUserId}
          currentUserRole={currentUserRole}
          onClose={() => setSelectedProposal(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onRequestRevision={handleRequestRevision}
          onConvertToCoord={handleConvertToCoord}
        />
      )}

      {/* hidden — currentUserName chỉ dùng để giữ tương thích Props */}
      <span className="hidden">{currentUserName}</span>
    </div>
  );
}
