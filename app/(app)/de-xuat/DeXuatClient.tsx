'use client';

// /de-xuat V6 — INTEGRATION CLIENT — anh chốt 2026-06-12.
//
// Nguyên tắc V6:
//   "Tạo đề xuất dưới 1 phút" · "Tối đa 5 trường nhập liệu" ·
//   "Không có dữ liệu dư thừa" ·
//   "Cho phép mở rộng workflow trong tương lai mà không sửa code" ·
//   "UI đồng bộ module Điều phối hiện tại".
//
// Trang là composite:
//   DexuatDashboard V6 (7 KPI + 1 Donut)
//   + DexuatTable V6 (7 tabs + 8 cột + dropdown 4 action)
//   + CreateProposalModal V6 (5 trường nhập)
//   + ProposalDetailDrawer V6 (5 section + 4 nút duyệt).
//
// 7 trạng thái V6 (storage value vẫn 'chuyen_dieu_phoi' để tương thích data
// cũ; label V6 hiển thị "Đã tạo điều phối"):
//   nhap → da_gui → dang_xem_xet → yeu_cau_bo_sung → da_phe_duyet / tu_choi →
//   chuyen_dieu_phoi → dong_ho_so.
//
// Reuse collection `tasks` (kind='proposal'). Adapter map Task → ProposalV6
// (alias = ProposalV5 trong types V6) cho cả table + drawer + dashboard.
//
// 6 handler V6:
//   handleCreate (V6 payload — 5 trường) / handleApprove / handleReject /
//   handleRequestRevision / handleApproveAndCreateCoord / handleCloseDossier.
// "Đóng hồ sơ" V1 alert + console.log (V7 sẽ wire endpoint backend).
// Convert: tạo task `kind='assignment'` mới với meta.fromProposalId + .fromProposalCode
// rồi router.push('/dieu-phoi'). KHÔNG map Owner/KPI/Deadline (xác định tại Điều phối).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { tasksApi, type Task } from '@/lib/services/tasks/api-client';
import { isTP, isQLCS } from '@/lib/auth/roles';
import CompactDashboard from './_components/CompactDashboard';
import MobileProposalView from './_components/Mobile/MobileProposalView';
import DexuatDashboard, {
  type ProposalV6 as DashboardProposalV6,
} from './_components/DexuatDashboard';
import DexuatTable, { type ActionKey } from './_components/DexuatTable';
import CreateProposalModal, {
  type CreateProposalPayloadV6,
} from './_components/CreateProposalModal';
import ProposalDetailDrawer, {
  type ProposalV2,
  type ProposalApproverV2,
  type ApproverStepStatus,
} from './_components/ProposalDetailDrawer';
import type {
  ProposalKind,
  ProposalStatus,
  ProposalV6,
  ApproverStep,
} from './_components/types';
import { ROLE_BLOCK } from '@/lib/permissions';
import { canCreateProposal } from '../dieu-phoi/_lib/permissions';

// ──────────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────────
interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface UserLite {
  id: string; name: string; roleId: string;
  branchId: string | null; departmentId: string | null;
}

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
// Helpers — block từ role
// ──────────────────────────────────────────────────────────────────────────────
function resolveBlockOfRole(role: string): 'KD' | 'VP' {
  const b = ROLE_BLOCK[role];
  if (b === 'VP') return 'VP';
  // 'all' (ADMIN/CEO/CHU_TICH) hoặc undefined → mặc định KD
  return 'KD';
}

// ──────────────────────────────────────────────────────────────────────────────
// Adapter — Task → ProposalV6
// ──────────────────────────────────────────────────────────────────────────────

/** Map Task.status → 8 trạng thái V6 (giữ storage 'chuyen_dieu_phoi'). */
function mapStatusV6(t: Task): ProposalStatus {
  const meta = ((t as any).meta ?? {}) as Record<string, unknown>;
  if (meta.closed === true) return 'dong_ho_so';
  if (meta.linkedCoordId) return 'chuyen_dieu_phoi';
  switch (t.status) {
    case 'pending_approval': {
      const completed = Array.isArray(t.approvalsCompleted) ? t.approvalsCompleted : [];
      if (completed.length > 0) return 'dang_xem_xet';
      return 'da_gui';
    }
    case 'requested_revision': return 'yeu_cau_bo_sung';
    case 'rejected':
    case 'cancelled': return 'tu_choi';
    case 'pending':
    case 'in_progress':
    case 'done':
      return 'da_phe_duyet';
    default: return 'nhap';
  }
}

/** V6.4 (2026-06-13): map kind → 3 ProposalKind chính thức (van_hanh/du_an/cai_tien).
 *  3 kind cũ (dau_tu/chien_luoc/khan_cap) đã xoá khỏi form — fallback về du_an/van_hanh. */
function mapKindV6(t: Task): ProposalKind {
  const meta = ((t as any).meta ?? {}) as Record<string, unknown>;
  const raw = meta.proposalKindV6 ?? meta.proposalKindV5 ?? meta.proposalKindV3;
  if (typeof raw === 'string') {
    switch (raw) {
      case 'van_hanh':
      case 'du_an':
      case 'cai_tien':
        return raw;
      // Legacy V6 cũ → map sang V6.4
      case 'dau_tu':     return 'du_an';     // Đầu tư → Dự án
      case 'chien_luoc': return 'du_an';     // Chiến lược → Dự án
      case 'khan_cap':   return 'van_hanh';  // Khẩn cấp → Vận hành
      // V3 alias → V6
      case 'nhan_su':    return 'van_hanh';
      case 'mkt_kd':     return 'cai_tien';
      case 'tai_chinh':  return 'du_an';
    }
  }
  // Fallback theo proposalType V2
  if (t.proposalType === 'tai_chinh') return 'du_an';
  return 'van_hanh';
}

/** Build approverChain V6 (uid + roleCode + decision history). */
function buildApproverChainV6(t: Task, users: UserLite[]): {
  chain: ApproverStep[];
  idx: number;
} {
  const chainRaw: string[] = Array.isArray((t as any).approvalChain) ? (t as any).approvalChain : [];
  const completed = Array.isArray(t.approvalsCompleted) ? t.approvalsCompleted : [];
  const currentApprover = t.currentApprover ?? null;

  function findUser(token: string): UserLite | undefined {
    if (token.startsWith('user:')) {
      const uid = token.slice(5);
      return users.find((u) => u.id === uid);
    }
    if (token.startsWith('role:')) {
      const roleId = token.slice(5);
      return users.find((u) => u.roleId === roleId);
    }
    return users.find((u) => u.id === token) ?? users.find((u) => u.roleId === token);
  }

  let activeIdx = -1;
  const chain: ApproverStep[] = chainRaw.map((entry, idx) => {
    const u = findUser(entry);
    const uid = u?.id ?? (entry.startsWith('user:') ? entry.slice(5) : undefined);
    const roleCode = u?.roleId ?? (entry.startsWith('role:') ? entry.slice(5) : undefined);
    const name = u?.name ?? (entry.startsWith('role:') ? entry.slice(5) : entry);

    const done = completed.find((c: any) =>
      (c.uid && c.uid === uid) || (c.role && c.role === roleCode),
    );

    let decision: ApproverStep['decision'];
    if (done) {
      decision = done.decision === 'approved' ? 'approved'
        : done.decision === 'rejected' ? 'rejected'
        : 'requested_revision';
    }

    const isCurrent = !done && currentApprover && (
      currentApprover === entry ||
      currentApprover === `user:${uid ?? ''}` ||
      currentApprover === `role:${roleCode ?? ''}`
    );
    if (isCurrent && activeIdx === -1) activeIdx = idx;

    return {
      uid,
      roleCode,
      name,
      decidedAt: done?.decidedAt,
      decision,
      notes: done?.notes,
    };
  });

  if (activeIdx === -1) {
    if (t.status === 'pending_approval' || t.status === 'requested_revision') {
      activeIdx = completed.length;
    } else {
      activeIdx = chain.length;
    }
  }
  return { chain, idx: activeIdx };
}

/** Adapter chính — Task → ProposalV6. */
function adaptTaskToProposalV6(t: Task, users: UserLite[]): ProposalV6 {
  const yyyy = (t.createdAt ?? '').slice(0, 4) || new Date().getFullYear().toString();
  const code = `DX-${yyyy}-${t.id.slice(0, 4).toUpperCase()}`;
  const meta = ((t as any).meta ?? {}) as Record<string, any>;
  const { chain, idx } = buildApproverChainV6(t, users);

  const creatorBlock: 'KD' | 'VP' = t.createdByBlock === 'VP' ? 'VP' : 'KD';

  // V6 reason: ưu tiên meta.reason mới; fallback V5 problemStatement; cuối là description
  const reason =
    (typeof meta.reason === 'string' && meta.reason) ||
    (typeof meta.problemStatement === 'string' && meta.problemStatement) ||
    (typeof t.description === 'string' && t.description) ||
    undefined;

  return {
    // Standard
    id: t.id,
    code,
    status: mapStatusV6(t),
    creatorUid: t.createdBy,
    creatorName: t.createdByName ?? '',
    creatorRole: t.createdByRole ?? '',
    creatorBlock,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt ?? t.createdAt,

    // 5 trường nhập V6
    title: t.title,
    kind: mapKindV6(t),
    reason,
    estimatedCost: t.estimatedCost ?? undefined,
    attachments: [],

    // V6.5 (2026-06-14): đọc 4 field redesign — ưu tiên ROOT (server persist) → fallback meta.
    nature: ((t as any).nature === 'support' || (t as any).nature === 'governance')
      ? (t as any).nature
      : (meta.nature === 'support' || meta.nature === 'governance' ? meta.nature : undefined),
    recipientUnitUid: typeof (t as any).recipientUid === 'string' ? (t as any).recipientUid
      : (typeof meta.recipientUnitUid === 'string' ? meta.recipientUnitUid : undefined),
    recipientUnitName: typeof (t as any).recipientUnitName === 'string' ? (t as any).recipientUnitName
      : (typeof meta.recipientUnitName === 'string' ? meta.recipientUnitName : undefined),
    recipientLeaderUid: typeof (t as any).recipientLeaderUid === 'string' ? (t as any).recipientLeaderUid
      : (typeof meta.recipientLeaderUid === 'string' ? meta.recipientLeaderUid : undefined),
    recipientLeaderName: typeof (t as any).recipientLeaderName === 'string' ? (t as any).recipientLeaderName
      : (typeof meta.recipientLeaderName === 'string' ? meta.recipientLeaderName : undefined),
    hasFinancial: (t as any).hasFinancial === true || meta.hasFinancial === true,

    // Approver
    approverChain: chain,
    approverIdx: idx,

    // Linked coord
    linkedCoordTaskId: typeof meta.linkedCoordId === 'string' ? meta.linkedCoordId : undefined,
    linkedCoordTaskCode: typeof meta.linkedCoordCode === 'string' ? meta.linkedCoordCode : undefined,

    // V6+ Đơn vị liên quan + auto scope (đọc từ meta.relatedUnits nếu có)
    relatedUnits: Array.isArray(meta.relatedUnits) ? meta.relatedUnits : undefined,
    unitsScope: meta.unitsScope === 'lien_khoi' || meta.unitsScope === 'trong_khoi'
      ? meta.unitsScope
      : (Array.isArray(meta.relatedUnits) && meta.relatedUnits.length > 0
        ? (new Set([creatorBlock, ...meta.relatedUnits.map((u: any) => u.block)]).size > 1
            ? 'lien_khoi' : 'trong_khoi')
        : undefined),

    // ═══ LEGACY V5 FIELDS — giữ shape để sibling chưa migrate không vỡ ═══
    priority: 'binh_thuong',
    source: 'phat_sinh',
    scopeTargets: [],
    relatedBlocks: [creatorBlock],
    relatedDepts: [],
    relatedFacilities: [],
    isCrossBlock: false,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Adapter — ProposalV6 → Dashboard shape
// ──────────────────────────────────────────────────────────────────────────────
function adaptProposalToDashboard(p: ProposalV6): DashboardProposalV6 {
  const chainTokens: string[] = p.approverChain.map((s) => {
    if (s.uid) return `user:${s.uid}`;
    if (s.roleCode) return `role:${s.roleCode}`;
    return s.name;
  });
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    kind: p.kind,
    status: p.status,
    creatorUid: p.creatorUid,
    creatorName: p.creatorName,
    approverChain: chainTokens,
    approverIdx: p.approverIdx,
    estimatedCost: p.estimatedCost,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt ?? p.createdAt,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Adapter — ProposalV6 → ProposalV2 (drawer prop)
// ──────────────────────────────────────────────────────────────────────────────
function approverStepStatus(p: ProposalV6, idx: number): ApproverStepStatus {
  const s = p.approverChain[idx];
  if (!s) return 'cho_tiep';
  if (s.decision === 'approved') return 'da_duyet';
  if (s.decision === 'rejected') return 'tu_choi';
  if (s.decision === 'requested_revision') return 'yeu_cau_bo_sung';
  if (
    idx === p.approverIdx &&
    (p.status === 'da_gui' || p.status === 'dang_xem_xet' || p.status === 'yeu_cau_bo_sung')
  ) {
    return 'dang_xem_xet';
  }
  return 'cho_tiep';
}

function adaptProposalToDrawer(p: ProposalV6): ProposalV2 {
  const approverChainV2: ProposalApproverV2[] = p.approverChain.map((s, idx) => ({
    id: `step-${idx}`,
    uid: s.uid ?? '',
    name: s.name,
    role: s.roleCode ?? '',
    status: approverStepStatus(p, idx),
    decidedAt: s.decidedAt,
    note: s.notes,
    reason: s.reason,
  }));

  return {
    id: p.id,
    code: p.code,
    title: p.title,
    description: p.reason ?? '',
    kind: p.kind,
    status: p.status,
    estimatedCost: p.estimatedCost ?? null,
    creatorUid: p.creatorUid,
    creatorName: p.creatorName,
    creatorRole: p.creatorRole,
    createdAt: p.createdAt,
    approverChain: approverChainV2,
    attachments: [],
    linkedCoordTaskId: p.linkedCoordTaskId,
    linkedCoordTaskCode: p.linkedCoordTaskCode,
    // V6 reason
    reason: p.reason,
    // V6.5 (2026-06-14): pass nature/leader/financial cho drawer hiển thị section "Cấu hình quản trị"
    nature: p.nature,
    recipientUnitName: p.recipientUnitName,
    recipientLeaderName: p.recipientLeaderName,
    hasFinancial: p.hasFinancial,
  } as ProposalV2;
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
export function DeXuatClient(props: Props) {
  const { currentUserId, currentUserName, currentUserRole, users } = props;
  const router = useRouter();
  const searchParams = useSearchParams();

  const canCreate = canCreateProposal(currentUserRole);
  const currentUserBlock = useMemo(() => resolveBlockOfRole(currentUserRole), [currentUserRole]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  /** V6.2: proposal đang sửa (null = chế độ tạo mới). */
  const [editingProposal, setEditingProposal] = useState<ProposalV6 | null>(null);
  const [selected, setSelected] = useState<ProposalV6 | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // ── Load list ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    tasksApi.list({ mode: 'all', kind: 'proposal' })
      .then((rows) => { if (!cancelled) setTasks(rows); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Lỗi tải đề xuất'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // ── Deep-link ?proposalId / ?taskId / ?id → mở drawer ─────────────────────
  // V6.4 (2026-06-13): thêm `?proposalId` (deeplink chuẩn từ notification noti).
  useEffect(() => {
    const taskIdParam = searchParams.get('proposalId') ?? searchParams.get('taskId') ?? searchParams.get('id');
    if (!taskIdParam) return;
    tasksApi.get(taskIdParam)
      .then((t) => { if (t.kind === 'proposal') setSelected(adaptTaskToProposalV6(t, users)); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Adapt list ────────────────────────────────────────────────────────────
  const proposals: ProposalV6[] = useMemo(
    () => tasks.map((t) => adaptTaskToProposalV6(t, users)),
    [tasks, users],
  );

  const dashboardProposals: DashboardProposalV6[] = useMemo(
    () => proposals.map(adaptProposalToDashboard),
    [proposals],
  );

  // ── Handlers V6 ───────────────────────────────────────────────────────────

  /** V6: tạo đề xuất từ payload 5-trường-nhập của CreateProposalModal V6. */
  const handleCreate = useCallback(async (payload: CreateProposalPayloadV6) => {
    try {
      // Map ngược sang TaskCreate V2:
      //   title    → title
      //   kind     → meta.proposalKindV6 (+ proposalType nếu dau_tu)
      //   reason   → description (server cần)
      //   estimatedCost → estimatedCost (chỉ khi dau_tu)
      // approverUserIds V6 chưa resolve → để rỗng (V7 sẽ wire bước-by-role).
      const approverUserIds: string[] = [];

      const isInvestment = payload.kind === 'du_an';
      const proposalTypeV2 = isInvestment ? 'tai_chinh' : 'van_hanh';
      const financialGroup = isInvestment ? 'chi_khac' : null;

      const body: any = {
        kind: 'proposal',
        title: payload.title,
        description: payload.reason ?? '',
        priority: 'normal',
        dueDate: null,
        assigneeBlock: currentUserBlock,
        assigneeUserIds: [currentUserId],
        proposalType: proposalTypeV2,
        financialGroup,
        estimatedCost: isInvestment ? (payload.estimatedCost ?? null) : null,
        approverUserIds,
        expectedDeliverable: null,
        // V6.5 (2026-06-13) anh redesign: nature + recipient unit/leader.
        // recipientUid (legacy server contract) tạm map = recipientUnitUid để
        // server build chain. P1.3 sẽ refactor server logic theo nature thật sự.
        recipientUid: payload.recipientUnitUid,
        meta: {
          proposalKindV6: payload.kind,
          reason: payload.reason,
          resolvedApproverChain: payload.resolvedApproverChain,
          draftStatus: payload.status, // 'nhap' | 'da_gui'
          // V6.5 fields
          nature: payload.nature,
          recipientUnitUid: payload.recipientUnitUid ?? null,
          recipientUnitName: payload.recipientUnitName ?? null,
          recipientLeaderUid: payload.recipientLeaderUid ?? null,
          recipientLeaderName: payload.recipientLeaderName ?? null,
          hasFinancial: payload.hasFinancial ?? false,
          // V5 reverse-compat
          proposalKindV5: payload.kind,
          problemStatement: payload.reason,
        },
      };
      await tasksApi.create(body);
      setShowCreate(false);
      refresh();
    } catch (e: any) {
      alert(`Tạo đề xuất thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [currentUserId, currentUserBlock, refresh]);

  /** V6.2: mở modal sửa với pre-fill từ proposal hiện tại. */
  const handleEdit = useCallback((id: string) => {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    setSelected(null);
    setEditingProposal(p);
    setShowCreate(true);
  }, [proposals]);

  /** V6.2: PATCH đề xuất sau khi sửa. */
  const handleUpdate = useCallback(
    async (proposalId: string, payload: CreateProposalPayloadV6) => {
      try {
        const isInvestment = payload.kind === 'du_an';
        await tasksApi.update(proposalId, {
          title: payload.title,
          description: payload.reason ?? '',
          // estimatedCost / proposalType chỉ map nếu API hỗ trợ — V1 lưu qua meta
          meta: {
            proposalKindV6: payload.kind,
            reason: payload.reason,
            resolvedApproverChain: payload.resolvedApproverChain,
            nature: payload.nature,
            recipientUnitUid: payload.recipientUnitUid ?? null,
            recipientUnitName: payload.recipientUnitName ?? null,
            recipientLeaderUid: payload.recipientLeaderUid ?? null,
            recipientLeaderName: payload.recipientLeaderName ?? null,
            hasFinancial: payload.hasFinancial ?? false,
            estimatedCost: payload.hasFinancial ? (payload.estimatedCost ?? null) : (isInvestment ? (payload.estimatedCost ?? null) : null),
          },
        });
        setShowCreate(false);
        setEditingProposal(null);
        refresh();
      } catch (e: any) {
        alert(`Lưu thay đổi thất bại: ${e?.message ?? 'lỗi không xác định'}`);
      }
    },
    [refresh],
  );

  const handleApprove = useCallback(async (id: string, note?: string) => {
    try {
      // eslint-disable-next-line no-console
      console.log('[de-xuat V6] approve', { id, note });
      await tasksApi.approve(id, note);
      setSelected(null);
      refresh();
    } catch (e: any) {
      alert(`Phê duyệt thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [refresh]);

  const handleRequestRevision = useCallback(async (id: string, reason: string) => {
    try {
      // eslint-disable-next-line no-console
      console.log('[de-xuat V6] request_revision', { id, reason });
      await tasksApi.requestRevision(id, reason);
      setSelected(null);
      refresh();
    } catch (e: any) {
      alert(`Yêu cầu bổ sung thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [refresh]);

  const handleReject = useCallback(async (id: string, reason: string) => {
    try {
      // eslint-disable-next-line no-console
      console.log('[de-xuat V6] reject', { id, reason });
      await tasksApi.reject(id, reason);
      setSelected(null);
      refresh();
    } catch (e: any) {
      alert(`Từ chối thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [refresh]);

  /** V6.4 (2026-06-12): creator gửi lại đề xuất bị reject — server reset chain duyệt. */
  const handleResubmit = useCallback(async (id: string, note?: string) => {
    try {
      await tasksApi.resubmit(id, note);
      setSelected(null);
      refresh();
    } catch (e: any) {
      alert(`Gửi lại thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [refresh]);

  /** V6: đóng hồ sơ. V7 sẽ wire endpoint backend dedicated. */
  const handleCloseDossier = useCallback(async (id: string) => {
    // eslint-disable-next-line no-console
    console.log('[de-xuat V6] close_dossier', { id });
    alert(
      'Đóng hồ sơ — V7 sẽ wire endpoint backend.\n' +
      'Đề xuất đã được đánh dấu để theo dõi.',
    );
    setSelected(null);
  }, []);

  /** V6: Duyệt & Tạo điều phối — gộp 2 action.
   *  Nếu đề xuất còn đang chờ duyệt → approve trước, sau đó tạo task coord. */
  const handleApproveAndCreateCoord = useCallback(async (id: string) => {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    // V6.5 (2026-06-13): chống tạo trùng — nếu đã có linkedCoordTaskId thì cảnh báo.
    if (p.linkedCoordTaskId) {
      alert(`Đề xuất ${p.code} đã được tạo điều phối: ${p.linkedCoordTaskCode ?? p.linkedCoordTaskId}.\nMở module Điều phối để xem.`);
      router.push(`/dieu-phoi?taskId=${encodeURIComponent(p.linkedCoordTaskId)}`);
      return;
    }
    if (!confirm(
      `Phê duyệt và tạo điều phối từ đề xuất "${p.title}"?\n\n` +
      'Hệ thống sẽ chuyển trạng thái sang "Đã tạo điều phối" và mở /dieu-phoi.',
    )) return;
    try {
      // 1. Approve trước nếu còn đang chờ
      if (
        p.status === 'da_gui' ||
        p.status === 'dang_xem_xet' ||
        p.status === 'yeu_cau_bo_sung'
      ) {
        // eslint-disable-next-line no-console
        console.log('[de-xuat V6] approve before create_coord', { id });
        await tasksApi.approve(id);
      }
      // 2. Tạo task coord assignment với meta tham chiếu
      //    SPEC: CHỈ map 4 field — title / reason→description / file / mã tham chiếu.
      //    KHÔNG map Owner/KPI/Deadline (xác định tại Điều phối).
      // V6+: gợi ý collaborators từ relatedUnits đề xuất (TP_*/QLCS_*/GD_KD/GD_VP)
      const relatedUnits = Array.isArray((p as any).relatedUnits) ? (p as any).relatedUnits : [];
      const collaboratorDeptIds: string[] = [];
      const collaboratorFacilityIds: string[] = [];
      const collaboratorRoles: Record<string, string> = {};
      for (const u of relatedUnits) {
        // TP_* → dept · QLCS_<BR> → facility · GD_KD/GD_VP → role tag
        if (u.id.startsWith('TP_')) {
          const deptCode = u.id.slice(3); // 'MKT', 'DT', 'KT', 'NS', 'KE', 'GS'
          collaboratorDeptIds.push(deptCode);
          collaboratorRoles[`dept:${deptCode}`] = `Phối hợp triển khai từ đề xuất ${p.code}`;
        } else if (u.id.startsWith('QLCS_')) {
          const branch = u.id.slice(5); // 'HM', 'TK', 'CTT', '24NCT', 'TT'
          collaboratorFacilityIds.push(branch);
          collaboratorRoles[`facility:${branch}`] = `Phối hợp triển khai từ đề xuất ${p.code}`;
        }
        // GD_KD / GD_VP — không map thành collaborator (Owner sẽ xác định khi tạo điều phối)
      }
      const body: any = {
        kind: 'assignment',
        title: p.title,
        description: [
          p.reason ?? '',
          `Sinh từ đề xuất ${p.code}`,
          // V6.5 (2026-06-13): include giá trị nếu có
          typeof p.estimatedCost === 'number' && p.estimatedCost > 0
            ? `Giá trị dự kiến: ${p.estimatedCost.toLocaleString('vi-VN')} đ`
            : '',
        ].filter(Boolean).join('\n\n'),
        priority: 'normal',
        dueDate: null,
        assigneeBlock: p.creatorBlock,
        assigneeUserIds: [],
        goal: null,
        expectedDeliverable: null,
        // V6+ gợi ý đơn vị phối hợp (người tạo điều phối có thể chỉnh)
        collaboratorDeptIds,
        collaboratorFacilityIds,
        collaboratorRoles,
        // V6.5: estimatedCost từ proposal map sang task (anh chốt: tự động lấy giá trị)
        estimatedCost: typeof p.estimatedCost === 'number' ? p.estimatedCost : null,
        meta: {
          fromProposalId: p.id,
          fromProposalCode: p.code,
          fromProposalCost: p.estimatedCost ?? null,
          relatedUnits, // pass nguyên để adapter coord dùng nếu cần
        },
      };
      const created = await tasksApi.create(body);
      // V6.4 reverse link → P3.4 (2026-06-13): thêm linkedCoordCode để adapter hiển thị code đẹp.
      try {
        await tasksApi.update(p.id, {
          meta: {
            linkedCoordId: created.id,
            linkedCoordCode: (created as any).code ?? null,
            linkedCoordAt: new Date().toISOString(),
          },
        } as any);
      } catch (revErr: any) {
        // eslint-disable-next-line no-console
        console.warn('[de-xuat] reverse link failed:', revErr?.message);
      }
      alert(`Đã tạo điều phối từ đề xuất ${p.code}. Đang chuyển sang module Điều phối...`);
      router.push('/dieu-phoi');
    } catch (e: any) {
      alert(`Duyệt & Tạo điều phối thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [proposals, router]);

  // ── Action dispatcher từ DexuatTable ──────────────────────────────────────
  const handleTableAction = useCallback((action: ActionKey, id: string) => {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    switch (action) {
      case 'view':
        setSelected(p);
        break;
      case 'approve':
        if (confirm(`Phê duyệt đề xuất "${p.title}"?`)) handleApprove(id);
        break;
      case 'request_revision': {
        const reason = prompt('Nhập nội dung yêu cầu bổ sung:');
        if (reason && reason.trim()) handleRequestRevision(id, reason.trim());
        break;
      }
      case 'reject': {
        const reason = prompt('Nhập lý do từ chối:');
        if (reason && reason.trim()) handleReject(id, reason.trim());
        break;
      }
      case 'approve_and_create_coord':
        handleApproveAndCreateCoord(id);
        break;
      case 'resubmit': {
        const note = prompt(
          `Gửi lại đề xuất "${p.title}" sau khi điều chỉnh?\n\nNhập ghi chú (tuỳ chọn — mô tả đã sửa gì):`,
          '',
        );
        if (note !== null) handleResubmit(id, note.trim());
        break;
      }
      case 'close':
        if (confirm(`Đóng hồ sơ đề xuất "${p.title}"?`)) handleCloseDossier(id);
        break;
    }
  }, [
    proposals,
    handleApprove,
    handleRequestRevision,
    handleReject,
    handleApproveAndCreateCoord,
    handleResubmit,
    handleCloseDossier,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  const totalCount = proposals.length;
  const todayStr = new Date().toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header — desktop only (mobile có title + FAB trong MobileProposalView) */}
      <div className="hidden md:flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900">Đề xuất</h2>
          <p className="text-xs text-slate-500 mt-0.5 capitalize">
            {todayStr} · {totalCount} đề xuất trong hệ thống
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            title="Làm mới"
            type="button"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
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

      {loading ? (
        <div className="py-16 flex items-center justify-center text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Đang tải đề xuất…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : (
        <>
          {/* V6.4 (2026-06-13): MOBILE — spec anh chốt: card view + bottom sheet +
              swipe KPI + sticky tabs + FAB tạo. */}
          <div className="md:hidden">
            <MobileProposalView
              proposals={proposals}
              currentUserUid={currentUserId}
              canCreate={canCreate}
              onCreate={() => setShowCreate(true)}
              onRowClick={setSelected}
            />
          </div>

          {/* Desktop (md+) — giữ 2 branch CompactDashboard (TP/QLCS) hoặc full (GD/CEO) */}
          <div className="hidden md:block">
            {isTP(currentUserRole) || isQLCS(currentUserRole) ? (
              <CompactDashboard
                proposals={proposals}
                currentUserUid={currentUserId}
                onRowClick={setSelected}
              />
            ) : (
              <>
                <DexuatDashboard
                  proposals={dashboardProposals}
                  currentUserUid={currentUserId}
                  currentUserRole={currentUserRole}
                />
                <DexuatTable
                  proposals={proposals}
                  currentUserUid={currentUserId}
                  currentUserRole={currentUserRole}
                  onRowClick={setSelected}
                  onAction={handleTableAction}
                />
              </>
            )}
          </div>
        </>
      )}

      {/* Create modal V6 — 5 trường nhập (hoặc Sửa khi editingProposal) */}
      {showCreate && (
        <CreateProposalModal
          open
          onClose={() => { setShowCreate(false); setEditingProposal(null); }}
          onSubmitV6={handleCreate}
          initialProposal={editingProposal}
          onUpdate={handleUpdate}
          users={users.map((u) => ({ id: u.id, name: u.name, roleId: u.roleId }))}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          currentUserBlock={currentUserBlock}
        />
      )}

      {/* Detail drawer V6 — 5 section + 4 nút duyệt + nút Sửa */}
      {selected && (
        <ProposalDetailDrawer
          proposal={adaptProposalToDrawer(selected)}
          currentUserUid={currentUserId}
          currentUserRole={currentUserRole}
          onClose={() => setSelected(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onRequestRevision={handleRequestRevision}
          onApproveAndCreateCoord={handleApproveAndCreateCoord}
          onCloseDossier={handleCloseDossier}
          onEdit={handleEdit}
        />
      )}
    </div>
  );
}
