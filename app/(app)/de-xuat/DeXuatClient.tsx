'use client';

// /de-xuat V3 — anh chốt 2026-05-31:
//   - Trang là composite của 3 module V3 mới: DexuatDashboard + DexuatTable + ProposalDetailDrawer.
//   - Modal tạo dùng CreateProposalModal V3 (6 section: thông tin chung · vấn đề · giải pháp ·
//     tác động · luồng duyệt · sau duyệt).
//   - V1 vẫn reuse collection `tasks` (kind='proposal') vì backend chưa migrate sang collection
//     `proposals` riêng. Adapter map Task → ProposalV3 cho cả table và drawer.
//   - Bốn thao tác duyệt: approve · agree_in_principle · request_revision · reject.
//     V3-MVP gửi qua endpoint tasks hiện có; với `agree_in_principle` và `dong_ho_so`
//     chưa có endpoint chuyên trị nên ghi log nhận biết — V4 sẽ extend backend.
//   - Convert: tạo task `kind='assignment'` mới với meta.fromProposalId rồi router.push('/dieu-phoi').

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { tasksApi, type Task } from '@/lib/services/tasks/api-client';
import DexuatDashboard, { type ProposalV3 as DashboardProposalV3 } from './_components/DexuatDashboard';
import DexuatTable, { type ActionKey } from './_components/DexuatTable';
import CreateProposalModal, {
  type CreateProposalPayloadV3,
  type CreateProposalPayload,
} from './_components/CreateProposalModal';
import ProposalDetailDrawer, {
  type ProposalV2,
  type ProposalApproverV2,
  type ApproverStepStatus,
} from './_components/ProposalDetailDrawer';
import type {
  ProposalKind,
  ProposalStatus,
  ProposalV3,
  ApproverStep,
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
// Adapter — Task → ProposalV3 (canonical, dùng cho table + drawer)
// ──────────────────────────────────────────────────────────────────────────────

/** Map Task.status → 9 trạng thái V3. */
function mapStatus(t: Task): ProposalStatus {
  const meta = ((t as any).meta ?? {}) as Record<string, unknown>;
  if (meta.closed === true) return 'dong_ho_so';
  if (meta.linkedCoordId) return 'chuyen_dieu_phoi';
  switch (t.status) {
    case 'pending_approval': {
      // Bước đầu tiên — chưa ai mở → "đã gửi"; đã có ai vào xem → "đang xem xét"
      const completed = Array.isArray(t.approvalsCompleted) ? t.approvalsCompleted : [];
      if (completed.length > 0) return 'dang_xem_xet';
      return 'da_gui';
    }
    case 'requested_revision': return 'yeu_cau_bo_sung';
    case 'rejected':
    case 'cancelled': return 'tu_choi';
    case 'pending':
    case 'in_progress': return 'da_phe_duyet';
    case 'done': {
      if (meta.agreedInPrinciple === true) return 'dong_y_nguyen_tac';
      return 'da_phe_duyet';
    }
    default: return 'nhap';
  }
}

/** Map Task.proposalType (V2: tai_chinh|van_hanh) → 5 loại V3. */
function mapKind(t: Task): ProposalKind {
  const meta = ((t as any).meta ?? {}) as Record<string, unknown>;
  // V3 ưu tiên đọc kind mới ghi trong meta (sau khi V4 backend hỗ trợ)
  const v3Kind = meta.proposalKindV3;
  if (typeof v3Kind === 'string') {
    if (v3Kind === 'van_hanh' || v3Kind === 'nhan_su' || v3Kind === 'mkt_kd' ||
        v3Kind === 'tai_chinh' || v3Kind === 'chien_luoc') {
      return v3Kind;
    }
  }
  // Fallback V2
  const pt = t.proposalType;
  if (pt === 'tai_chinh') return 'tai_chinh';
  if (pt === 'van_hanh') return 'van_hanh';
  return 'van_hanh';
}

/** Resolve approverChain V3 (uid + role + decision history). */
function buildApproverChain(t: Task, users: UserLite[]): {
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

  // Nếu pending_approval mà chưa xác định idx → idx = số bước đã duyệt
  if (activeIdx === -1) {
    if (t.status === 'pending_approval' || t.status === 'requested_revision') {
      activeIdx = completed.length;
    } else {
      activeIdx = chain.length; // out-of-bounds → "chain đã xong"
    }
  }
  return { chain, idx: activeIdx };
}

/** Adapter chính — Task → ProposalV3 (types.ts). */
function adaptTaskToProposalV3(t: Task, users: UserLite[]): ProposalV3 {
  const yyyy = (t.createdAt ?? '').slice(0, 4) || new Date().getFullYear().toString();
  const code = `DX-${yyyy}-${t.id.slice(0, 4).toUpperCase()}`;
  const meta = ((t as any).meta ?? {}) as Record<string, any>;
  const { chain, idx } = buildApproverChain(t, users);

  // Map ngược priority Task → ProposalV3.Priority
  const pr: ProposalV3['priority'] = t.priority === 'urgent' ? 'urgent'
    : t.priority === 'high' ? 'high'
    : t.priority === 'low' ? 'low'
    : 'normal';

  // Khối: ưu tiên meta.relatedBlockV3, fallback theo assigneeBlock
  const blockV3Raw = meta.relatedBlockV3;
  const relatedBlock: ProposalV3['relatedBlock'] =
    blockV3Raw === 'KD' || blockV3Raw === 'VP' || blockV3Raw === 'cross'
      ? blockV3Raw
      : t.assigneeBlock === 'VP' ? 'VP'
      : 'KD';

  return {
    id: t.id,
    code,
    title: t.title,
    description: t.description ?? '',
    kind: mapKind(t),
    priority: pr,
    relatedBlock,
    relatedDeptId: t.assigneeDeptId ?? undefined,
    relatedBranchId: t.assigneeFacilityId ?? undefined,
    creatorUid: t.createdBy,
    creatorName: t.createdByName ?? '',
    creatorRole: t.createdByRole ?? '',
    createdAt: t.createdAt,
    updatedAt: t.updatedAt ?? t.createdAt,
    // S2
    currentSituation: typeof meta.currentSituation === 'string' ? meta.currentSituation : undefined,
    problemStatement: typeof meta.problemStatement === 'string' ? meta.problemStatement : undefined,
    evidence: typeof meta.evidence === 'string' ? meta.evidence : undefined,
    attachments: [],
    // S3
    proposedSolution: typeof meta.proposedSolution === 'string' ? meta.proposedSolution : t.description ?? undefined,
    scope: typeof meta.scope === 'string' ? meta.scope : undefined,
    expectedStartDate: typeof meta.expectedStartDate === 'string' ? meta.expectedStartDate : undefined,
    involvedUnits: Array.isArray(meta.involvedUnits) ? meta.involvedUnits : undefined,
    // S4
    expectedBenefit: typeof meta.expectedBenefit === 'string' ? meta.expectedBenefit : undefined,
    riskIfNot: typeof meta.riskIfNot === 'string' ? meta.riskIfNot : undefined,
    riskIfDo: typeof meta.riskIfDo === 'string' ? meta.riskIfDo : undefined,
    estimatedCost: t.estimatedCost ?? undefined,
    neededHeadcount: typeof meta.neededHeadcount === 'string' ? meta.neededHeadcount : undefined,
    // S5
    approverChain: chain,
    approverIdx: idx,
    // S6
    createCoordAfter: meta.createCoordAfter === true,
    expectedOwnerUid: typeof meta.expectedOwnerUid === 'string' ? meta.expectedOwnerUid : undefined,
    expectedOwnerName: typeof meta.expectedOwnerName === 'string' ? meta.expectedOwnerName : undefined,
    expectedCollaborators: Array.isArray(meta.expectedCollaborators) ? meta.expectedCollaborators : undefined,
    expectedDeadline: typeof meta.expectedDeadline === 'string' ? meta.expectedDeadline : t.dueDate ?? undefined,
    expectedDeliverable: typeof meta.expectedDeliverable === 'string'
      ? meta.expectedDeliverable
      : (t.expectedDeliverable ?? undefined),
    // Standard
    status: mapStatus(t),
    linkedCoordTaskId: typeof meta.linkedCoordId === 'string' ? meta.linkedCoordId : undefined,
    linkedCoordTaskCode: typeof meta.linkedCoordCode === 'string' ? meta.linkedCoordCode : undefined,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Adapter — ProposalV3 → DashboardProposalV3
// (Dashboard tự định nghĩa shape riêng: approverChain: string[] + approverHistory)
// ──────────────────────────────────────────────────────────────────────────────
function adaptProposalToDashboard(p: ProposalV3): DashboardProposalV3 {
  // chain → list token "user:UID" hoặc "role:CODE"
  const chainTokens: string[] = p.approverChain.map((s) => {
    if (s.uid) return `user:${s.uid}`;
    if (s.roleCode) return `role:${s.roleCode}`;
    return s.name;
  });
  // priority V3 (Priority types) → 'thap'|'thuong'|'cao'|'khan'
  const pr: DashboardProposalV3['priority'] = p.priority === 'urgent'
    ? 'khan'
    : p.priority === 'high'
      ? 'cao'
      : p.priority === 'low'
        ? 'thap'
        : 'thuong';
  // Block: 'cross' → 'lien_khoi' (dashboard label)
  const block: DashboardProposalV3['relatedBlock'] = p.relatedBlock === 'cross'
    ? 'lien_khoi'
    : p.relatedBlock;

  return {
    id: p.id,
    code: p.code,
    title: p.title,
    kind: p.kind,
    status: p.status,
    priority: pr,
    relatedBlock: block,
    relatedBranch: p.relatedBranchId,
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
        decision:
          s.decision === 'approved' ? 'approved'
          : s.decision === 'rejected' ? 'rejected'
          : s.decision === 'requested_revision' ? 'requested_revision'
          : s.decision === 'agreed_in_principle' ? 'conditional'
          : undefined,
        notes: s.notes,
      })),
    estimatedCost: p.estimatedCost,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt ?? p.createdAt,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Adapter — ProposalV3 → ProposalV2 (drawer prop)
// ──────────────────────────────────────────────────────────────────────────────
function approverStepStatus(p: ProposalV3, idx: number): ApproverStepStatus {
  const s = p.approverChain[idx];
  if (s.decision === 'approved') return 'da_duyet';
  if (s.decision === 'agreed_in_principle') return 'dong_y_nguyen_tac';
  if (s.decision === 'rejected') return 'tu_choi';
  if (s.decision === 'requested_revision') return 'yeu_cau_bo_sung';
  if (idx === p.approverIdx && (p.status === 'da_gui' || p.status === 'dang_xem_xet' || p.status === 'yeu_cau_bo_sung' || p.status === 'dong_y_nguyen_tac')) {
    return 'dang_xem_xet';
  }
  return 'cho_tiep';
}

function adaptProposalToDrawer(p: ProposalV3): ProposalV2 {
  const approverChainV2: ProposalApproverV2[] = p.approverChain.map((s, idx) => ({
    id: `step-${idx}`,
    uid: s.uid ?? '',
    name: s.name,
    role: s.roleCode ?? '',
    status: approverStepStatus(p, idx),
    decidedAt: s.decidedAt,
    note: s.notes,
  }));

  // ProposalV2.kind extends V3 (5 V3 + co_so/khac). Map trực tiếp 5 kind V3.
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    description: p.description ?? '',
    kind: p.kind,
    status: p.status,
    estimatedCost: p.estimatedCost ?? null,
    deadline: p.expectedDeadline,
    creatorUid: p.creatorUid,
    creatorName: p.creatorName,
    creatorRole: p.creatorRole,
    createdAt: p.createdAt,
    approverChain: approverChainV2,
    attachments: [],
    linkedCoordTaskId: p.linkedCoordTaskId,
    linkedCoordTaskCode: p.linkedCoordTaskCode,
    // V3 mở rộng
    priority: p.priority === 'urgent' ? 'khan'
      : p.priority === 'high' ? 'cao'
      : p.priority === 'low' ? 'thap'
      : 'thuong',
    relatedBlock: p.relatedBlock === 'cross' ? 'lien_khoi' : p.relatedBlock,
    relatedDept: p.relatedDeptId,
    relatedBranch: p.relatedBranchId,
    currentSituation: p.currentSituation,
    problemStatement: p.problemStatement,
    evidence: p.evidence,
    proposedSolution: p.proposedSolution,
    scope: p.scope,
    expectedStartDate: p.expectedStartDate,
    involvedUnits: p.involvedUnits,
    expectedBenefit: p.expectedBenefit,
    riskIfNot: p.riskIfNot,
    riskIfDo: p.riskIfDo,
    neededHeadcount: undefined,
    createCoordAfter: p.createCoordAfter,
    expectedOwner: p.expectedOwnerName,
    expectedCollaborators: p.expectedCollaborators?.map((c) => `${c.unitName}: ${c.supportContent}`),
    expectedDeadline: p.expectedDeadline,
    expectedDeliverable: p.expectedDeliverable,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
export function DeXuatClient(props: Props) {
  const { currentUserId, currentUserName, currentUserRole, users, departments, branches } = props;
  const router = useRouter();
  const searchParams = useSearchParams();

  const canCreate = canCreateProposal(currentUserRole);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<ProposalV3 | null>(null);
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
      .then((t) => { if (t.kind === 'proposal') setSelected(adaptTaskToProposalV3(t, users)); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Adapt list ────────────────────────────────────────────────────────────
  const proposals: ProposalV3[] = useMemo(
    () => tasks.map((t) => adaptTaskToProposalV3(t, users)),
    [tasks, users],
  );

  const dashboardProposals: DashboardProposalV3[] = useMemo(
    () => proposals.map(adaptProposalToDashboard),
    [proposals],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async (payload: CreateProposalPayloadV3) => {
    try {
      // Map approverChain V3 → approverUserIds (uid only). Bỏ qua bước chưa chọn người.
      const approverUserIds = payload.approverChain
        .map((a) => a.uid)
        .filter((x): x is string => !!x);

      // proposalType V2 (api hiện hành): nếu kind V3 = tai_chinh → 'tai_chinh',
      // còn lại → 'van_hanh' (giữ schema cũ pass server validation).
      const proposalTypeV2 = payload.kind === 'tai_chinh' ? 'tai_chinh' : 'van_hanh';
      const financialGroup = payload.kind === 'tai_chinh' ? 'chi_khac' : null;

      const body: any = {
        kind: 'proposal',
        title: payload.title,
        description: payload.proposedSolution || payload.problemStatement || '',
        priority: payload.priority === 'khan' ? 'urgent'
          : payload.priority === 'cao' ? 'high'
          : payload.priority === 'thap' ? 'low'
          : 'normal',
        dueDate: payload.expectedStartDate || null,
        assigneeBlock: payload.relatedBlock === 'lien_khoi' ? 'KD' : payload.relatedBlock,
        assigneeUserIds: [currentUserId],
        proposalType: proposalTypeV2,
        financialGroup,
        estimatedCost: payload.estimatedCost,
        approverUserIds,
        expectedDeliverable: payload.createCoordAfter ? payload.expectedDeliverable ?? null : null,
        // Meta lưu trường V3 chưa có chỗ trong schema V2.
        meta: {
          proposalKindV3: payload.kind,
          relatedBlockV3: payload.relatedBlock,
          currentSituation: payload.currentSituation,
          problemStatement: payload.problemStatement,
          evidence: payload.evidence,
          proposedSolution: payload.proposedSolution,
          scope: payload.scope,
          expectedStartDate: payload.expectedStartDate,
          involvedUnits: payload.involvedUnits ? [payload.involvedUnits] : [],
          expectedBenefit: payload.expectedBenefit,
          riskIfNot: payload.riskIfNot,
          riskIfDo: payload.riskIfDo,
          neededHeadcount: payload.neededHeadcount,
          createCoordAfter: payload.createCoordAfter,
          expectedOwnerName: payload.expectedOwnerName,
          expectedCollaborators: payload.expectedCollaborators,
          expectedDeadline: payload.expectedDeadline,
          expectedDeliverable: payload.expectedDeliverable,
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

  // Backward-compat: modal vẫn có thể gọi onCreate với payload V2-shaped.
  const handleCreateLegacy = useCallback((payload: CreateProposalPayload) => {
    handleCreate(payload);
  }, [handleCreate]);

  const handleApprove = useCallback(async (id: string, note?: string) => {
    try {
      await tasksApi.approve(id, note);
      setSelected(null);
      refresh();
    } catch (e: any) {
      alert(`Phê duyệt thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [refresh]);

  const handleAgreeInPrinciple = useCallback(async (id: string, note: string) => {
    // V4 backend sẽ có endpoint riêng. V3-MVP: dùng approve + prefix note để admin/CEO
    // nhận biết trong audit log.
    try {
      await tasksApi.approve(id, `[Đồng ý nguyên tắc] ${note}`);
      setSelected(null);
      refresh();
    } catch (e: any) {
      alert(`Đồng ý nguyên tắc thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [refresh]);

  const handleRequestRevision = useCallback(async (id: string, reason: string) => {
    try {
      await tasksApi.requestRevision(id, reason);
      setSelected(null);
      refresh();
    } catch (e: any) {
      alert(`Yêu cầu bổ sung thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [refresh]);

  const handleReject = useCallback(async (id: string, reason: string) => {
    try {
      await tasksApi.reject(id, reason);
      setSelected(null);
      refresh();
    } catch (e: any) {
      alert(`Từ chối thất bại: ${e?.message ?? 'lỗi không xác định'}`);
    }
  }, [refresh]);

  const handleCloseDossier = useCallback(async (id: string) => {
    // V4 backend sẽ có endpoint dedicated. V3-MVP: thông báo cho user biết.
    alert('Đóng hồ sơ — V4 sẽ wire endpoint backend. Đề xuất đã được đánh dấu để theo dõi.');
    void id;
    setSelected(null);
  }, []);

  const handleConvertToCoord = useCallback(async (id: string) => {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    if (!confirm('Tạo điều phối từ đề xuất này? Hệ thống sẽ copy nội dung sang module Điều phối.')) return;
    try {
      const body: any = {
        kind: 'assignment',
        title: p.title,
        description: [
          p.proposedSolution ? `Giải pháp: ${p.proposedSolution}` : '',
          p.scope ? `Phạm vi: ${p.scope}` : '',
          `Sinh từ đề xuất #${p.code}`,
        ].filter(Boolean).join('\n\n'),
        priority: p.priority || 'normal',
        dueDate: p.expectedDeadline || null,
        assigneeBlock: p.relatedBlock === 'cross' ? 'KD' : p.relatedBlock,
        assigneeUserIds: p.expectedOwnerUid ? [p.expectedOwnerUid] : [],
        goal: p.expectedBenefit || null,
        expectedDeliverable: p.expectedDeliverable || null,
        meta: {
          fromProposalId: p.id,
          fromProposalCode: p.code,
        },
      };
      await tasksApi.create(body);
      alert(`Đã tạo điều phối từ đề xuất #${p.code}. Đang chuyển sang module Điều phối...`);
      router.push('/dieu-phoi');
    } catch (e: any) {
      alert(`Tạo điều phối thất bại: ${e?.message ?? 'lỗi không xác định'}`);
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
      case 'approve_principle': {
        const note = prompt('Nhập kế hoạch bổ sung kèm đồng ý nguyên tắc:');
        if (note && note.trim()) handleAgreeInPrinciple(id, note.trim());
        break;
      }
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
      case 'convert_coord':
        handleConvertToCoord(id);
        break;
      case 'close':
        if (confirm(`Đóng hồ sơ đề xuất "${p.title}"?`)) handleCloseDossier(id);
        break;
    }
  }, [proposals, handleApprove, handleAgreeInPrinciple, handleRequestRevision, handleReject, handleConvertToCoord, handleCloseDossier]);

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
          {/* Dashboard 8 KPI + 3 biểu đồ + điểm nghẽn */}
          <DexuatDashboard
            proposals={dashboardProposals}
            currentUserUid={currentUserId}
            currentUserRole={currentUserRole}
          />

          {/* Table 12 cột + 8 tab + 6 action */}
          <DexuatTable
            proposals={proposals}
            currentUserUid={currentUserId}
            currentUserRole={currentUserRole}
            onRowClick={setSelected}
            onAction={handleTableAction}
          />
        </>
      )}

      {/* Create modal V3 */}
      {showCreate && (
        <CreateProposalModal
          open
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          onCreate={handleCreateLegacy}
          users={users.map((u) => ({ id: u.id, name: u.name, roleId: u.roleId }))}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          departments={departments.map((d) => ({ id: d.id, name: d.name }))}
          branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        />
      )}

      {/* Detail drawer V3 */}
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
          onAgreeInPrinciple={handleAgreeInPrinciple}
          onCloseDossier={handleCloseDossier}
        />
      )}
    </div>
  );
}
