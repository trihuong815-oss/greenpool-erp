'use client';

// /de-xuat V5 — anh chốt 2026-06-12:
//   - Trang là composite: DexuatDashboard (V5) + DexuatTable (V5) + ProposalDetailDrawer (V5).
//   - Modal tạo dùng CreateProposalModal V5 (5 block + 5 câu hỏi guide + auto chain
//     suggest theo loại/ưu tiên/ngưỡng tài chính/phạm vi ảnh hưởng + accordion "Sau duyệt").
//   - 8 trạng thái V5 (BỎ dong_y_nguyen_tac so với V3):
//     nhap → da_gui → dang_xem_xet → yeu_cau_bo_sung → da_phe_duyet / tu_choi →
//     chuyen_dieu_phoi → dong_ho_so.
//   - V1 vẫn reuse collection `tasks` (kind='proposal'). Adapter map Task → ProposalV5
//     cho cả table và drawer.
//   - Action V5 (6): view / approve / reject / request_revision /
//     approve_and_create_coord / close.
//   - Convert: tạo task `kind='assignment'` mới với meta.fromProposalId rồi
//     router.push('/dieu-phoi').
//   - "Đóng hồ sơ" V1 alert + console.log (V6 sẽ wire endpoint backend).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { tasksApi, type Task } from '@/lib/services/tasks/api-client';
import DexuatDashboard, {
  type ProposalV5 as DashboardProposalV5,
} from './_components/DexuatDashboard';
import DexuatTable, { type ActionKey } from './_components/DexuatTable';
import CreateProposalModal, {
  type CreateProposalPayloadV5,
} from './_components/CreateProposalModal';
import ProposalDetailDrawer, {
  type ProposalV2,
  type ProposalApproverV2,
  type ApproverStepStatus,
  type ProposalScopeItem,
} from './_components/ProposalDetailDrawer';
import type {
  ProposalKind,
  Priority,
  ProposalStatus,
  ProposalSource,
  ProposalV5,
  ApproverStep,
  ScopeTarget,
  AfterApproval,
} from './_components/types';
import { ROLE_BLOCK } from '@/lib/permissions';
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
// Helpers — block từ role
// ──────────────────────────────────────────────────────────────────────────────
function resolveBlockOfRole(role: string): 'KD' | 'VP' {
  const b = ROLE_BLOCK[role];
  if (b === 'VP') return 'VP';
  // 'all' (ADMIN/CEO) hoặc undefined → mặc định KD
  return 'KD';
}

// ──────────────────────────────────────────────────────────────────────────────
// Adapter — Task → ProposalV5
// ──────────────────────────────────────────────────────────────────────────────

/** Map Task.status → 8 trạng thái V5 (BỎ dong_y_nguyen_tac). */
function mapStatusV5(t: Task): ProposalStatus {
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

/** Map kind ghi trong meta (V5 mới) → 5 ProposalKind V5.
 *  V3 cũ (nhan_su/mkt_kd/tai_chinh) → fallback: van_hanh/cai_tien/dau_tu. */
function mapKindV5(t: Task): ProposalKind {
  const meta = ((t as any).meta ?? {}) as Record<string, unknown>;
  const raw = meta.proposalKindV5 ?? meta.proposalKindV3;
  if (typeof raw === 'string') {
    switch (raw) {
      case 'van_hanh':
      case 'cai_tien':
      case 'dau_tu':
      case 'chien_luoc':
      case 'khan_cap':
        return raw;
      // V3 alias → V5
      case 'nhan_su': return 'van_hanh';
      case 'mkt_kd':  return 'cai_tien';
      case 'tai_chinh': return 'dau_tu';
    }
  }
  // Fallback theo proposalType V2
  if (t.proposalType === 'tai_chinh') return 'dau_tu';
  return 'van_hanh';
}

/** Map Task.priority (low/normal/high/urgent) → 3 Priority V5. */
function mapPriorityV5(t: Task): Priority {
  switch (t.priority) {
    case 'urgent': return 'khan_cap';
    case 'high':   return 'quan_trong';
    case 'low':
    case 'normal':
    default:       return 'binh_thuong';
  }
}

/** Đọc source V5 từ meta, mặc định "phat_sinh". */
function mapSourceV5(t: Task): ProposalSource {
  const meta = ((t as any).meta ?? {}) as Record<string, unknown>;
  const src = meta.source;
  if (
    src === 'phat_sinh' || src === 'kpi' || src === 'hop' ||
    src === 'ceo_giao' || src === 'khach_hang_phan_anh' || src === 'khac'
  ) return src;
  return 'phat_sinh';
}

/** Đọc afterApproval V5 từ meta. */
function mapAfterApprovalV5(t: Task): AfterApproval | undefined {
  const meta = ((t as any).meta ?? {}) as Record<string, unknown>;
  if (meta.afterApproval === 'chi_phe_duyet' || meta.afterApproval === 'de_nghi_tao_dieu_phoi') {
    return meta.afterApproval;
  }
  // Backward-compat V3: createCoordAfter=true → de_nghi_tao_dieu_phoi
  if (meta.createCoordAfter === true) return 'de_nghi_tao_dieu_phoi';
  return undefined;
}

/** Đọc scopeTargets V5 từ meta. Nếu chưa có → suy luận từ assigneeBlock/Dept/Facility. */
function mapScopeTargetsV5(t: Task): ScopeTarget[] {
  const meta = ((t as any).meta ?? {}) as Record<string, unknown>;
  const raw = meta.scopeTargets;
  if (Array.isArray(raw)) {
    return raw
      .filter((x: any): x is { type: string; id: string; label?: string } =>
        x && typeof x === 'object' && typeof x.type === 'string' && typeof x.id === 'string')
      .map((x: any): ScopeTarget => ({
        type:
          x.type === 'dept' || x.type === 'facility' || x.type === 'role' || x.type === 'block'
            ? x.type
            : 'dept',
        id: x.id,
        label: typeof x.label === 'string' ? x.label : x.id,
      }));
  }
  // Fallback: dựng từ assignee
  const out: ScopeTarget[] = [];
  if (t.assigneeBlock) {
    out.push({
      type: 'block',
      id: t.assigneeBlock,
      label: t.assigneeBlock === 'KD' ? 'Khối Kinh doanh' : 'Khối Văn phòng',
    });
  }
  if (t.assigneeDeptId) out.push({ type: 'dept', id: t.assigneeDeptId, label: t.assigneeDeptId });
  if (t.assigneeFacilityId) out.push({ type: 'facility', id: t.assigneeFacilityId, label: t.assigneeFacilityId });
  return out;
}

/** Suy luận relatedBlocks / isCrossBlock từ scopeTargets. */
function computeRelatedBlocks(targets: ScopeTarget[], fallback: 'KD' | 'VP'): {
  blocks: Array<'KD' | 'VP'>;
  isCross: boolean;
} {
  let hasKD = false;
  let hasVP = false;
  for (const t of targets) {
    if (t.type === 'block') {
      if (t.id === 'KD') hasKD = true;
      if (t.id === 'VP') hasVP = true;
    }
  }
  if (!hasKD && !hasVP) {
    // fallback theo block của assignee/creator
    if (fallback === 'VP') hasVP = true;
    else hasKD = true;
  }
  const blocks: Array<'KD' | 'VP'> = [];
  if (hasKD) blocks.push('KD');
  if (hasVP) blocks.push('VP');
  return { blocks, isCross: hasKD && hasVP };
}

/** Build approverChain V5 (uid + roleCode + decision history). */
function buildApproverChainV5(t: Task, users: UserLite[]): {
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

/** Adapter chính — Task → ProposalV5. */
function adaptTaskToProposalV5(t: Task, users: UserLite[]): ProposalV5 {
  const yyyy = (t.createdAt ?? '').slice(0, 4) || new Date().getFullYear().toString();
  const code = `DX-${yyyy}-${t.id.slice(0, 4).toUpperCase()}`;
  const meta = ((t as any).meta ?? {}) as Record<string, any>;
  const { chain, idx } = buildApproverChainV5(t, users);

  const scopeTargets = mapScopeTargetsV5(t);
  const creatorBlock: 'KD' | 'VP' = t.createdByBlock === 'VP' ? 'VP' : 'KD';
  const { blocks: relatedBlocks, isCross } = computeRelatedBlocks(scopeTargets, creatorBlock);

  const relatedDepts: string[] = scopeTargets
    .filter((s) => s.type === 'dept')
    .map((s) => s.id);
  const relatedFacilities: string[] = scopeTargets
    .filter((s) => s.type === 'facility')
    .map((s) => s.id);

  return {
    // Standard
    id: t.id,
    code,
    status: mapStatusV5(t),
    creatorUid: t.createdBy,
    creatorName: t.createdByName ?? '',
    creatorRole: t.createdByRole ?? '',
    creatorBlock,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt ?? t.createdAt,

    // Block 1
    title: t.title,
    kind: mapKindV5(t),
    priority: mapPriorityV5(t),
    source: mapSourceV5(t),
    estimatedCost: t.estimatedCost ?? undefined,

    // Block 2
    currentSituation: typeof meta.currentSituation === 'string' ? meta.currentSituation : undefined,
    problemStatement: typeof meta.problemStatement === 'string' ? meta.problemStatement : undefined,
    evidence: typeof meta.evidence === 'string' ? meta.evidence : undefined,
    attachments: [],

    // Block 3
    proposedSolution:
      typeof meta.proposedSolution === 'string' ? meta.proposedSolution : t.description ?? undefined,
    scopeTargets,
    decisionRequested:
      typeof meta.decisionRequested === 'string' ? meta.decisionRequested : undefined,

    // Block 4
    expectedBenefit: typeof meta.expectedBenefit === 'string' ? meta.expectedBenefit : undefined,
    riskIfNot: typeof meta.riskIfNot === 'string' ? meta.riskIfNot : undefined,
    expectedResult:
      typeof meta.expectedResult === 'string'
        ? meta.expectedResult
        : typeof meta.expectedDeliverable === 'string'
          ? meta.expectedDeliverable
          : t.expectedDeliverable ?? undefined,

    // Block 5
    afterApproval: mapAfterApprovalV5(t),
    suggestedOwnerUid:
      typeof meta.suggestedOwnerUid === 'string' ? meta.suggestedOwnerUid : undefined,
    suggestedOwnerName:
      typeof meta.suggestedOwnerName === 'string'
        ? meta.suggestedOwnerName
        : typeof meta.expectedOwnerName === 'string'
          ? meta.expectedOwnerName
          : undefined,
    suggestedDeadline:
      typeof meta.suggestedDeadline === 'string'
        ? meta.suggestedDeadline
        : typeof meta.expectedDeadline === 'string'
          ? meta.expectedDeadline
          : t.dueDate ?? undefined,
    deploymentNote:
      typeof meta.deploymentNote === 'string' ? meta.deploymentNote : undefined,

    // Auto-computed
    relatedBlocks,
    relatedDepts,
    relatedFacilities,
    isCrossBlock: isCross,

    // Approver
    approverChain: chain,
    approverIdx: idx,

    // Linked coord
    linkedCoordTaskId: typeof meta.linkedCoordId === 'string' ? meta.linkedCoordId : undefined,
    linkedCoordTaskCode: typeof meta.linkedCoordCode === 'string' ? meta.linkedCoordCode : undefined,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Adapter — ProposalV5 → Dashboard shape
// (Dashboard tự định nghĩa shape riêng: approverChain: string[] + approverHistory)
// ──────────────────────────────────────────────────────────────────────────────
function adaptProposalToDashboard(p: ProposalV5): DashboardProposalV5 {
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
    priority: p.priority,
    scopeTargets: p.scopeTargets.map((s) => ({
      id: `${s.type}:${s.id}`,
      label: s.label,
      kind:
        s.type === 'dept' ? 'tp'
        : s.type === 'facility' ? 'facility'
        : s.type === 'block' ? 'block'
        : 'tp',
    })),
    relatedBlocks: p.relatedBlocks,
    creatorUid: p.creatorUid,
    creatorName: p.creatorName,
    approverChain: chainTokens,
    approverIdx: p.approverIdx,
    approverHistory: p.approverChain
      .filter((s) => !!s.decidedAt)
      .map((s) => ({
        uid: s.uid,
        roleCode: s.roleCode,
        name: s.name,
        decidedAt: s.decidedAt,
        decision: s.decision,
        notes: s.notes,
      })),
    estimatedCost: p.estimatedCost,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt ?? p.createdAt,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Adapter — ProposalV5 → ProposalV2 (drawer prop)
// ──────────────────────────────────────────────────────────────────────────────
function approverStepStatus(p: ProposalV5, idx: number): ApproverStepStatus {
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

function scopeKindForDrawer(t: ScopeTarget): ProposalScopeItem['kind'] {
  if (t.type === 'block') return 'khoi';
  if (t.type === 'facility') return 'co_so';
  // dept/role → TP/QLCS (đơn giản hoá: dept = TP)
  if (t.type === 'dept') {
    if (t.id.toUpperCase().startsWith('QLCS')) return 'QLCS';
    return 'TP';
  }
  return 'TP';
}

function adaptProposalToDrawer(p: ProposalV5): ProposalV2 {
  const approverChainV2: ProposalApproverV2[] = p.approverChain.map((s, idx) => ({
    id: `step-${idx}`,
    uid: s.uid ?? '',
    name: s.name,
    role: s.roleCode ?? '',
    status: approverStepStatus(p, idx),
    decidedAt: s.decidedAt,
    note: s.notes,
  }));

  const scopeItems: ProposalScopeItem[] = p.scopeTargets.map((s) => ({
    kind: scopeKindForDrawer(s),
    id: s.id,
    label: s.label,
  }));

  return {
    id: p.id,
    code: p.code,
    title: p.title,
    description: p.proposedSolution ?? p.problemStatement ?? '',
    kind: p.kind,
    status: p.status,
    estimatedCost: p.estimatedCost ?? null,
    deadline: p.suggestedDeadline,
    creatorUid: p.creatorUid,
    creatorName: p.creatorName,
    creatorRole: p.creatorRole,
    createdAt: p.createdAt,
    approverChain: approverChainV2,
    attachments: [],
    linkedCoordTaskId: p.linkedCoordTaskId,
    linkedCoordTaskCode: p.linkedCoordTaskCode,
    // V5 priority
    priority: p.priority,
    relatedBlock: p.isCrossBlock
      ? 'lien_khoi'
      : p.relatedBlocks[0] === 'VP'
        ? 'VP'
        : 'KD',
    relatedDept: p.relatedDepts[0],
    relatedBranch: p.relatedFacilities[0],
    currentSituation: p.currentSituation,
    problemStatement: p.problemStatement,
    evidence: p.evidence,
    proposedSolution: p.proposedSolution,
    expectedBenefit: p.expectedBenefit,
    riskIfNot: p.riskIfNot,
    createCoordAfter: p.afterApproval === 'de_nghi_tao_dieu_phoi',
    expectedOwner: p.suggestedOwnerName,
    expectedDeadline: p.suggestedDeadline,
    expectedDeliverable: p.expectedResult,
    // V5 mở rộng
    scopeItems,
    autoRelatedBlocks: p.relatedBlocks,
    isCrossBlock: p.isCrossBlock,
    decisionNeeded: p.decisionRequested,
    expectedResult: p.expectedResult,
    source: p.source,
  };
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
  const [selected, setSelected] = useState<ProposalV5 | null>(null);
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

  // ── Deep-link ?taskId / ?id → mở drawer ───────────────────────────────────
  useEffect(() => {
    const taskIdParam = searchParams.get('taskId') ?? searchParams.get('id');
    if (!taskIdParam) return;
    tasksApi.get(taskIdParam)
      .then((t) => { if (t.kind === 'proposal') setSelected(adaptTaskToProposalV5(t, users)); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Adapt list ────────────────────────────────────────────────────────────
  const proposals: ProposalV5[] = useMemo(
    () => tasks.map((t) => adaptTaskToProposalV5(t, users)),
    [tasks, users],
  );

  const dashboardProposals: DashboardProposalV5[] = useMemo(
    () => proposals.map(adaptProposalToDashboard),
    [proposals],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreateV5 = useCallback(async (payload: CreateProposalPayloadV5) => {
    try {
      // approverUserIds: V5 chain do hệ thống resolve theo role (CHƯA gắn user thật).
      // Backend approval bước-bằng-role chưa được wire trong tasksApi → để rỗng.
      // V6 sẽ: enrich resolvedApproverChain → user thật (qua role→user mapping) trước khi gửi.
      const approverUserIds: string[] = [];

      // proposalType V2 mapping: kind 'dau_tu' (hoặc có cost) → 'tai_chinh', còn lại 'van_hanh'.
      const isCostBound = payload.kind === 'dau_tu' || (payload.estimatedCost ?? 0) > 0;
      const proposalTypeV2 = isCostBound ? 'tai_chinh' : 'van_hanh';
      const financialGroup = isCostBound ? 'chi_khac' : null;

      // Priority V5 → V2 (low/normal/high/urgent)
      const priorityV2 = payload.priority === 'khan_cap'
        ? 'urgent'
        : payload.priority === 'quan_trong'
          ? 'high'
          : 'normal';

      // assigneeBlock: KD ưu tiên; cross → KD (server không có 'cross' literal)
      const assigneeBlock: 'KD' | 'VP' = payload.resolvedBlock === 'VP' ? 'VP' : 'KD';

      const body: any = {
        kind: 'proposal',
        title: payload.title,
        description: payload.proposedSolution || payload.problemStatement || '',
        priority: priorityV2,
        dueDate: payload.suggestedDeadline || null,
        assigneeBlock,
        assigneeUserIds: [currentUserId],
        proposalType: proposalTypeV2,
        financialGroup,
        estimatedCost: payload.estimatedCost ?? null,
        approverUserIds,
        expectedDeliverable:
          payload.afterApproval === 'de_nghi_tao_dieu_phoi'
            ? (payload.expectedResult || payload.deploymentNote || null)
            : (payload.expectedResult || null),
        // Meta lưu các trường V5 chưa có chỗ trong schema V2.
        meta: {
          proposalKindV5: payload.kind,
          priorityV5: payload.priority,
          source: payload.source,
          currentSituation: payload.currentSituation,
          problemStatement: payload.problemStatement,
          evidence: payload.evidence,
          proposedSolution: payload.proposedSolution,
          decisionRequested: payload.decisionRequested,
          scopeTargets: payload.scopeTargets.map((t) => ({
            type:
              t.kind === 'co_so' ? 'facility'
              : t.kind === 'khoi' ? 'block'
              : 'dept',
            id: t.id.split(':').slice(1).join(':') || t.id,
            label: t.label,
          })),
          resolvedBlock: payload.resolvedBlock,
          isCrossBlock: payload.isCrossBlock,
          resolvedApproverChain: payload.resolvedApproverChain,
          expectedBenefit: payload.expectedBenefit,
          riskIfNot: payload.riskIfNot,
          expectedResult: payload.expectedResult,
          afterApproval: payload.afterApproval,
          suggestedOwnerUid: payload.suggestedOwnerUid,
          suggestedOwnerName: payload.suggestedOwnerName,
          suggestedDeadline: payload.suggestedDeadline,
          deploymentNote: payload.deploymentNote,
          draftStatus: payload.status, // 'nhap' | 'da_gui'
        },
      };
      await tasksApi.create(body);
      setShowCreate(false);
      refresh();
    } catch (e: any) {
      alert(`Tạo đề xuất thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [currentUserId, refresh]);

  const handleApprove = useCallback(async (id: string, note?: string) => {
    try {
      // eslint-disable-next-line no-console
      console.log('[de-xuat] approve', { id, note });
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
      console.log('[de-xuat] request_revision', { id, reason });
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
      console.log('[de-xuat] reject', { id, reason });
      await tasksApi.reject(id, reason);
      setSelected(null);
      refresh();
    } catch (e: any) {
      alert(`Từ chối thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [refresh]);

  const handleCloseDossier = useCallback(async (id: string) => {
    // V6 backend sẽ có endpoint dedicated. V5-MVP: alert + log.
    // eslint-disable-next-line no-console
    console.log('[de-xuat] close_dossier', { id });
    alert('Đóng hồ sơ — V6 sẽ wire endpoint backend. Đề xuất đã được đánh dấu để theo dõi.');
    setSelected(null);
  }, []);

  const handleConvertToCoord = useCallback(async (id: string) => {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    if (!confirm('Tạo điều phối từ đề xuất này? Hệ thống sẽ copy nội dung sang module Điều phối.')) return;
    try {
      const block: 'KD' | 'VP' = p.relatedBlocks.includes('KD') ? 'KD' : 'VP';
      const priorityV2 = p.priority === 'khan_cap'
        ? 'urgent'
        : p.priority === 'quan_trong'
          ? 'high'
          : 'normal';
      const body: any = {
        kind: 'assignment',
        title: p.title,
        description: [
          p.proposedSolution ? `Giải pháp: ${p.proposedSolution}` : '',
          p.scopeTargets.length > 0
            ? `Phạm vi: ${p.scopeTargets.map((s) => s.label).join(' · ')}`
            : '',
          `Sinh từ đề xuất ${p.code}`,
        ].filter(Boolean).join('\n\n'),
        priority: priorityV2,
        dueDate: p.suggestedDeadline || null,
        assigneeBlock: block,
        assigneeUserIds: p.suggestedOwnerUid ? [p.suggestedOwnerUid] : [],
        goal: p.expectedBenefit || null,
        expectedDeliverable: p.expectedResult || null,
        meta: {
          fromProposalId: p.id,
          fromProposalCode: p.code,
        },
      };
      await tasksApi.create(body);
      alert(`Đã tạo điều phối từ đề xuất ${p.code}. Đang chuyển sang module Điều phối...`);
      router.push('/dieu-phoi');
    } catch (e: any) {
      alert(`Tạo điều phối thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [proposals, router]);

  /** "Duyệt & Tạo điều phối" — gộp 2 action. Nếu chưa duyệt thì approve trước. */
  const handleApproveAndCreateCoord = useCallback(async (id: string) => {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    if (!confirm(`Duyệt và tạo điều phối từ đề xuất "${p.title}"?`)) return;
    try {
      if (p.status === 'da_gui' || p.status === 'dang_xem_xet' || p.status === 'yeu_cau_bo_sung') {
        // eslint-disable-next-line no-console
        console.log('[de-xuat] approve before create_coord', { id });
        await tasksApi.approve(id);
      }
      // Sau khi approve, dùng cùng flow convert
      await handleConvertToCoord(id);
    } catch (e: any) {
      alert(`Duyệt & Tạo điều phối thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [proposals, handleConvertToCoord]);

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
    handleCloseDossier,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  const totalCount = proposals.length;
  const todayStr = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
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
          {/* Dashboard V5 — 7 KPI + 3 biểu đồ + bảng điểm nghẽn */}
          <DexuatDashboard
            proposals={dashboardProposals}
            currentUserUid={currentUserId}
            currentUserRole={currentUserRole}
          />

          {/* Table V5 — 11 cột + cột "Sau duyệt" + 6 action */}
          <DexuatTable
            proposals={proposals}
            currentUserUid={currentUserId}
            currentUserRole={currentUserRole}
            onRowClick={setSelected}
            onAction={handleTableAction}
          />
        </>
      )}

      {/* Create modal V5 */}
      {showCreate && (
        <CreateProposalModal
          open
          onClose={() => setShowCreate(false)}
          onSubmitV5={handleCreateV5}
          users={users.map((u) => ({ id: u.id, name: u.name, roleId: u.roleId }))}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          currentUserBlock={currentUserBlock}
        />
      )}

      {/* Detail drawer V5 */}
      {selected && (
        <ProposalDetailDrawer
          proposal={adaptProposalToDrawer(selected)}
          currentUserUid={currentUserId}
          currentUserRole={currentUserRole}
          onClose={() => setSelected(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onRequestRevision={handleRequestRevision}
          onConvertToCoord={handleConvertToCoord}
          onCloseDossier={handleCloseDossier}
        />
      )}
    </div>
  );
}
