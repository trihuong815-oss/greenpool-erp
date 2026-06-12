'use client';

// Modal tạo đề xuất V6 MINIMAL — SPEC anh chốt 2026-06-12.
//
// Nguyên tắc V6:
//   "Tạo đề xuất dưới 1 phút"
//   "Tối đa 5 trường nhập liệu"
//   "Không có dữ liệu dư thừa"
//   "Cho phép mở rộng workflow trong tương lai mà không sửa code"
//
// 5 trường nhập liệu DUY NHẤT:
//   1) Tên đề xuất *
//   2) Loại đề xuất * (5 default: Vận hành/Cải tiến/Đầu tư/Chiến lược/Khẩn cấp)
//   3) Lý do đề xuất *
//   4) Giá trị dự kiến (VNĐ) — CHỈ HIỆN khi kind === 'dau_tu'
//   5) File đính kèm (placeholder upload)
//
// Block "Luồng duyệt gợi ý" hiển thị NGAY sau khi user chọn kind + cost
// (read-only — server quyết định cuối cùng theo workflow rules).
//
// Footer 3 nút: Huỷ · Lưu nháp · Gửi đề xuất.
//
// Backward-compat (BẮT BUỘC):
//   - GIỮ EXPORT toàn bộ type V5 cũ (CreateProposalPayloadV5, ProposalKindV5,
//     ProposalPriorityV5, ProposalSourceV5, ScopeTarget, ResolvedStep, V3 alias,
//     onSubmit/onCreate handler signature) — DeXuatClient hiện hành đọc 20+ field V5.
//   - Modal V6 chỉ THU NHỎ UI, vẫn EMIT một `CreateProposalPayloadV5` đầy đủ
//     (các field V5 không có trong V6 sẽ fill default: '' / [] / 'binh_thuong' …).
//   - Thêm type mới `CreateProposalPayloadV6` đúng theo SPEC để tương lai có thể
//     migrate dần DeXuatClient sang V6.

import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Coins,
  Sparkles,
  Target,
  Paperclip,
  Workflow,
  AlertTriangle,
  Lightbulb,
  FileText,
} from 'lucide-react';

import { resolveApproverChain } from '../_lib/chain-resolver';
import { formatVND } from '../_lib/proposal-settings';
import {
  AVAILABLE_RELATED_UNITS,
  detectUnitsScope,
  UNITS_SCOPE_LABEL,
  UNITS_SCOPE_COLOR,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types V5 — GIỮ NGUYÊN export (DeXuatClient hiện vẫn import)
// ─────────────────────────────────────────────────────────────────────────────

export type ProposalKindV5 =
  | 'van_hanh'
  | 'cai_tien'
  | 'dau_tu'
  | 'chien_luoc'
  | 'khan_cap';

export type ProposalPriorityV5 = 'binh_thuong' | 'quan_trong' | 'khan_cap';

export type ProposalSourceV5 =
  | 'phat_sinh'
  | 'kpi'
  | 'hop'
  | 'ceo_giao'
  | 'khach_hang_phan_anh'
  | 'khac';

export type ScopeTargetKind = 'tp' | 'qlcs' | 'co_so' | 'khoi';

export interface ScopeTarget {
  id: string;
  kind: ScopeTargetKind;
  label: string;
  blockHint?: 'KD' | 'VP';
}

export interface ResolvedStep {
  roleCode: string;
  label: string;
  reason: string;
}

export interface CreateProposalPayloadV5 {
  status: 'nhap' | 'da_gui';
  // BLOCK 1
  title: string;
  kind: ProposalKindV5;
  priority: ProposalPriorityV5;
  source: ProposalSourceV5;
  estimatedCost?: number;
  // BLOCK 2
  currentSituation: string;
  problemStatement: string;
  evidence?: string;
  attachments: string[];
  // BLOCK 3
  proposedSolution: string;
  scopeTargets: ScopeTarget[];
  decisionRequested: string;
  // BLOCK 4
  expectedBenefit: string;
  riskIfNot: string;
  expectedResult: string;
  // BLOCK 5
  afterApproval: 'chi_phe_duyet' | 'de_nghi_tao_dieu_phoi';
  suggestedOwnerUid?: string;
  suggestedOwnerName?: string;
  suggestedDeadline?: string;
  deploymentNote?: string;
  // Auto-computed
  resolvedApproverChain?: ResolvedStep[];
  resolvedBlock?: 'KD' | 'VP' | 'cross';
  isCrossBlock?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types V3 — GIỮ NGUYÊN export (backward-compat cho callsite cũ)
// ─────────────────────────────────────────────────────────────────────────────

export type ProposalKindV3 =
  | 'van_hanh'
  | 'nhan_su'
  | 'mkt_kd'
  | 'tai_chinh'
  | 'chien_luoc';

export type ProposalPriorityV3 = 'thap' | 'thuong' | 'cao' | 'khan';
export type ProposalBlockV3 = 'KD' | 'VP' | 'lien_khoi';

export interface ApproverDraftV3 {
  id: string;
  uid: string;
  name: string;
  roleCode: string;
  reason: string;
  slaHours: number;
}

export interface CollaboratorDraftV3 {
  id: string;
  unit: string;
  support: string;
}

export interface CreateProposalPayloadV3 {
  status: 'nhap' | 'da_gui';
  title: string;
  kind: ProposalKindV3;
  priority: ProposalPriorityV3;
  relatedBlock: ProposalBlockV3;
  relatedDeptId?: string;
  relatedBranchId?: string;
  currentSituation: string;
  problemStatement: string;
  evidence?: string;
  attachments: string[];
  proposedSolution: string;
  scope: string;
  expectedStartDate?: string;
  involvedUnits: string;
  expectedBenefit: string;
  riskIfNot: string;
  riskIfDo: string;
  estimatedCost: number | null;
  neededHeadcount?: number | null;
  approverChain: ApproverDraftV3[];
  createCoordAfter: boolean;
  expectedOwnerName?: string;
  expectedCollaborators?: CollaboratorDraftV3[];
  expectedDeadline?: string;
  expectedDeliverable?: string;
}

export type CreateProposalPayload = CreateProposalPayloadV3 & {
  description: string;
  deadline: string;
};

export type ProposalKind = ProposalKindV3;
export type ProposalStatus =
  | 'nhap'
  | 'da_gui'
  | 'dang_xem_xet'
  | 'yeu_cau_bo_sung'
  | 'dong_y_nguyen_tac'
  | 'da_phe_duyet'
  | 'tu_choi'
  | 'chuyen_dieu_phoi'
  | 'dong_ho_so';

// ─────────────────────────────────────────────────────────────────────────────
// Types V6 (mới — minimal)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProposalAttachmentDraftV6 {
  name: string;
  url?: string;
}

/** Payload V6 minimal — đúng SPEC 5 trường nhập + V6+ relatedUnits. */
export interface CreateProposalPayloadV6 {
  status: 'nhap' | 'da_gui';
  // 5 trường nhập
  title: string;
  kind: ProposalKindV5;
  reason: string;
  estimatedCost?: number;
  attachments?: ProposalAttachmentDraftV6[];
  // V6+ Đơn vị liên quan (multi-select) + auto scope
  relatedUnits?: { id: string; label: string; block: 'KD' | 'VP' }[];
  unitsScope?: 'trong_khoi' | 'lien_khoi';
  // V6.4 (2026-06-12): người nhận đề xuất — UID cụ thể (server cần để build chain).
  recipientTier?: 'peer' | 'senior';
  recipientUid?: string;
  recipientName?: string;
  // Auto computed (read-only client preview)
  resolvedApproverChain?: ResolvedStep[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface UserOption {
  id: string;
  name: string;
  roleId: string;
}

interface CreateProposalModalProps {
  open: boolean;
  onClose: () => void;
  /** V6 callback — ưu tiên dùng cho callsite mới. */
  onSubmitV6?: (payload: CreateProposalPayloadV6) => void;
  /** V5 callback — DeXuatClient hiện hành dùng. Modal V6 vẫn emit V5 đầy đủ. */
  onSubmitV5?: (payload: CreateProposalPayloadV5) => void;
  /** V3 callback — giữ cho callsite cũ. */
  onSubmit?: (payload: CreateProposalPayloadV3) => void;
  /** V2 callback — DeXuatClient cũ hơn nữa. */
  onCreate?: (payload: CreateProposalPayload) => void;
  /** V6.2: nếu set → modal vào CHẾ ĐỘ SỬA — pre-fill từ proposal, submit gọi onUpdate. */
  initialProposal?: any | null;
  /** V6.2: callback khi cập nhật. */
  onUpdate?: (proposalId: string, payload: CreateProposalPayloadV6) => void;
  users?: UserOption[];
  currentUserRole?: string;
  currentUserName?: string;
  currentUserBlock?: 'KD' | 'VP';
  /** Optional — không dùng trong V6 nhưng giữ prop để callsite cũ không vỡ. */
  departments?: { id: string; name: string }[];
  branches?: { id: string; name: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Default kinds — V6 đọc cứng 5 mặc định ở đây (V2 sẽ tải từ Cài đặt Workflow)
// ─────────────────────────────────────────────────────────────────────────────

const KIND_V6_OPTIONS: {
  key: ProposalKindV5;
  label: string;
  icon: any;
  tone: string;
}[] = [
  { key: 'van_hanh',   label: 'Vận hành',   icon: Sparkles,       tone: 'bg-sky-50 text-sky-700 border-sky-300' },
  { key: 'cai_tien',   label: 'Cải tiến',   icon: Lightbulb,      tone: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  { key: 'dau_tu',     label: 'Đầu tư',     icon: Coins,          tone: 'bg-amber-50 text-amber-700 border-amber-300' },
  { key: 'chien_luoc', label: 'Chiến lược', icon: Target,         tone: 'bg-violet-50 text-violet-700 border-violet-300' },
  { key: 'khan_cap',   label: 'Khẩn cấp',   icon: AlertTriangle,  tone: 'bg-rose-50 text-rose-700 border-rose-300' },
];

const ROLE_LABEL: Record<string, string> = {
  CEO: 'CEO',
  CT: 'Chủ tịch',
  CHU_TICH: 'Chủ tịch',
  GD_KD: 'Giám đốc Kinh doanh',
  GD_VP: 'Giám đốc Văn phòng',
  TP_DT: 'TP Đào tạo',
  TP_NS: 'TP Nhân sự',
  TP_KE: 'TP Kế toán',
  TP_MKT: 'TP Marketing',
  TP_KT: 'TP Kỹ thuật',
  TP_GS: 'TP Giám sát',
  QLCS: 'Quản lý cơ sở',
};

// ─────────────────────────────────────────────────────────────────────────────
// Mapper V6 → V5 (fill default cho field V5 không có trong V6)
// ─────────────────────────────────────────────────────────────────────────────

function v6ToV5(
  v6: CreateProposalPayloadV6,
  reason: string,
  creatorBlock: 'KD' | 'VP',
): CreateProposalPayloadV5 {
  return {
    status: v6.status,
    // BLOCK 1
    title: v6.title,
    kind: v6.kind,
    priority: 'binh_thuong',
    source: 'phat_sinh',
    estimatedCost: v6.estimatedCost,
    // BLOCK 2 — V6 dồn vào "Lý do đề xuất"
    currentSituation: '',
    problemStatement: reason,
    evidence: undefined,
    attachments: (v6.attachments ?? []).map((a) => a.url || a.name).filter(Boolean),
    // BLOCK 3 — V6 không thu thập
    proposedSolution: reason,
    scopeTargets: [],
    decisionRequested: '',
    // BLOCK 4 — V6 không thu thập
    expectedBenefit: '',
    riskIfNot: '',
    expectedResult: '',
    // BLOCK 5 — V6 mặc định "chỉ phê duyệt"; sẽ dùng nút "Duyệt & Tạo điều phối" ở drawer
    afterApproval: 'chi_phe_duyet',
    suggestedOwnerUid: undefined,
    suggestedOwnerName: undefined,
    suggestedDeadline: undefined,
    deploymentNote: undefined,
    // Auto-computed
    resolvedApproverChain: v6.resolvedApproverChain,
    resolvedBlock: creatorBlock,
    isCrossBlock: false,
  };
}

// V5 → V3 (giữ cho callsite cũ)
function kindV5ToV3(k: ProposalKindV5): ProposalKindV3 {
  switch (k) {
    case 'van_hanh':   return 'van_hanh';
    case 'cai_tien':   return 'van_hanh';
    case 'dau_tu':     return 'tai_chinh';
    case 'chien_luoc': return 'chien_luoc';
    case 'khan_cap':   return 'van_hanh';
  }
}

function mapV5ToV3(p: CreateProposalPayloadV5): CreateProposalPayloadV3 {
  const block = p.resolvedBlock === 'cross' ? 'lien_khoi' : (p.resolvedBlock ?? 'KD');
  return {
    status: p.status,
    title: p.title,
    kind: kindV5ToV3(p.kind),
    priority: 'thuong',
    relatedBlock: block,
    relatedDeptId: undefined,
    relatedBranchId: undefined,
    currentSituation: p.currentSituation,
    problemStatement: p.problemStatement,
    evidence: p.evidence,
    attachments: p.attachments,
    proposedSolution: p.proposedSolution,
    scope: '',
    expectedStartDate: p.suggestedDeadline,
    involvedUnits: '',
    expectedBenefit: p.expectedBenefit,
    riskIfNot: p.riskIfNot,
    riskIfDo: '',
    estimatedCost: typeof p.estimatedCost === 'number' ? p.estimatedCost : null,
    neededHeadcount: null,
    approverChain: (p.resolvedApproverChain ?? []).map((s, idx) => ({
      id: `v6-${idx}-${s.roleCode}`,
      uid: '',
      name: '',
      roleCode: s.roleCode,
      reason: s.reason,
      slaHours: 48,
    })),
    createCoordAfter: p.afterApproval === 'de_nghi_tao_dieu_phoi',
    expectedOwnerName: p.suggestedOwnerName,
    expectedCollaborators: undefined,
    expectedDeadline: p.suggestedDeadline,
    expectedDeliverable: p.expectedResult,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component V6
// ─────────────────────────────────────────────────────────────────────────────

export default function CreateProposalModal({
  open,
  onClose,
  onSubmitV6,
  onSubmitV5,
  onSubmit,
  onCreate,
  initialProposal,
  onUpdate,
  currentUserRole,
  currentUserName,
  currentUserBlock = 'KD',
}: CreateProposalModalProps) {
  const isEditMode = !!initialProposal;
  // 5 trường nhập V6 + V6+ relatedUnits
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ProposalKindV5 | ''>('');
  const [reason, setReason] = useState('');
  const [estimatedCostStr, setEstimatedCostStr] = useState('');
  const [attachments, setAttachments] = useState<ProposalAttachmentDraftV6[]>([]);
  // V6+ Đơn vị liên quan multi-select
  const [relatedUnitIds, setRelatedUnitIds] = useState<string[]>([]);
  // V6.4 (2026-06-12): chọn người nhận đề xuất cụ thể (UID)
  const [recipientTier, setRecipientTier] = useState<'peer' | 'senior'>('senior');
  const [recipientUid, setRecipientUid] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientOptions, setRecipientOptions] = useState<Array<{ uid: string; displayName: string; roleCode: string; roleName: string }>>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Fetch candidate list khi đổi tier
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingRecipients(true);
    fetch(`/api/proposals/recipients?tier=${recipientTier}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const items = Array.isArray(j?.items) ? j.items : [];
        setRecipientOptions(items);
        // Nếu UID hiện tại không còn trong list → reset
        if (recipientUid && !items.some((x: any) => x.uid === recipientUid)) {
          setRecipientUid('');
          setRecipientName('');
        }
      })
      .catch(() => {
        if (!cancelled) setRecipientOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecipients(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recipientTier]);

  // V6.2: pre-fill state khi mở mode edit
  useEffect(() => {
    if (!open || !initialProposal) return;
    const p = initialProposal;
    setTitle(p.title ?? '');
    setKind((p.kind as ProposalKindV5) || '');
    setReason(p.reason ?? p.problemStatement ?? p.description ?? '');
    setEstimatedCostStr(typeof p.estimatedCost === 'number' && p.estimatedCost > 0 ? String(p.estimatedCost) : '');
    setAttachments(Array.isArray(p.attachments) ? p.attachments : []);
    setRelatedUnitIds(
      Array.isArray(p.relatedUnits) ? p.relatedUnits.map((u: any) => u.id) : [],
    );
    // V6.4: pre-fill recipient nếu có
    const tier = (p as any).recipientTier;
    if (tier === 'peer' || tier === 'senior') setRecipientTier(tier);
    const uid = (p as any).recipientUid;
    if (typeof uid === 'string') {
      setRecipientUid(uid);
      setRecipientName(typeof (p as any).recipientName === 'string' ? (p as any).recipientName : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProposal?.id]);

  // ── derived ─────────────────────────────────────────────────────────────
  const estimatedCostNum = useMemo(() => {
    const trimmed = estimatedCostStr.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [estimatedCostStr]);

  const resolvedChain = useMemo<ResolvedStep[]>(() => {
    if (!kind) return [];
    return resolveApproverChain({
      kind,
      estimatedCost: estimatedCostNum ?? 0,
      creatorBlock: currentUserBlock,
    });
  }, [kind, estimatedCostNum, currentUserBlock]);

  // V6+ relatedUnits + auto scope
  const relatedUnits = useMemo(
    () => AVAILABLE_RELATED_UNITS.filter((u) => relatedUnitIds.includes(u.id)),
    [relatedUnitIds],
  );
  const unitsScope = useMemo(
    () => detectUnitsScope(currentUserBlock, relatedUnits),
    [currentUserBlock, relatedUnits],
  );
  function toggleUnit(id: string) {
    setRelatedUnitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const chainReason = useMemo(() => {
    if (!kind) return '';
    const parts: string[] = [];
    parts.push('Loại: ' + (KIND_V6_OPTIONS.find((k) => k.key === kind)?.label ?? kind));
    if (kind === 'dau_tu' && estimatedCostNum) {
      parts.push('Giá trị: ' + formatVND(estimatedCostNum));
    }
    return parts.join(' · ');
  }, [kind, estimatedCostNum]);

  if (!open) return null;

  // ── reset / close ────────────────────────────────────────────────────────
  function resetForm() {
    setTitle('');
    setKind('');
    setReason('');
    setEstimatedCostStr('');
    setAttachments([]);
    setRelatedUnitIds([]);
    setRecipientUid('');
    setRecipientName('');
    // KHÔNG reset recipientTier — giữ tier user chọn để UX mượt khi tạo đề xuất kế tiếp.
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  // ── validate ─────────────────────────────────────────────────────────────
  function validateForSubmit(): string | null {
    const t = title.trim();
    if (!t) return 'Vui lòng nhập tên đề xuất.';
    if (t.length < 3) return 'Tên đề xuất tối thiểu 3 ký tự.';
    if (!kind) return 'Vui lòng chọn loại đề xuất.';
    const r = reason.trim();
    if (!r) return 'Vui lòng nhập lý do đề xuất.';
    if (r.length < 10) return 'Lý do đề xuất tối thiểu 10 ký tự.';
    if (estimatedCostStr.trim() && (estimatedCostNum ?? 0) <= 0) {
      return 'Giá trị dự kiến phải lớn hơn 0.';
    }
    if (!recipientUid) return 'Vui lòng chọn người nhận đề xuất.';
    return null;
  }

  function buildPayloadV6(status: 'nhap' | 'da_gui'): CreateProposalPayloadV6 {
    return {
      status,
      title: title.trim(),
      kind: kind as ProposalKindV5,
      reason: reason.trim(),
      estimatedCost: kind === 'dau_tu' ? estimatedCostNum : undefined,
      attachments: attachments.length ? attachments : undefined,
      // V6+ Đơn vị liên quan + auto scope
      relatedUnits: relatedUnits.length ? relatedUnits : undefined,
      unitsScope: relatedUnits.length ? unitsScope : undefined,
      // V6.4: chọn người nhận cụ thể (UID)
      recipientTier,
      recipientUid: recipientUid || undefined,
      recipientName: recipientName || undefined,
      resolvedApproverChain: resolvedChain,
    };
  }

  function emit(v6: CreateProposalPayloadV6) {
    // V6.2: nếu mode='edit' → gọi onUpdate thay onSubmitV6
    if (isEditMode && initialProposal?.id && onUpdate) {
      onUpdate(initialProposal.id, v6);
      return;
    }
    // V6 trước
    onSubmitV6?.(v6);

    // V5 (DeXuatClient hiện tại) — map xuống V5 shape đầy đủ
    if (onSubmitV5 || onSubmit || onCreate) {
      const v5 = v6ToV5(v6, v6.reason, currentUserBlock);
      onSubmitV5?.(v5);
      if (onSubmit || onCreate) {
        const v3 = mapV5ToV3(v5);
        onSubmit?.(v3);
        if (onCreate) {
          const legacy: CreateProposalPayload = {
            ...v3,
            description: v3.proposedSolution || v3.problemStatement,
            deadline: v3.expectedStartDate ?? '',
          };
          onCreate(legacy);
        }
      }
    }
  }

  function handleSaveDraft() {
    if (!title.trim()) {
      alert('Vui lòng nhập tên đề xuất trước khi lưu nháp.');
      return;
    }
    if (!kind) {
      alert('Vui lòng chọn loại đề xuất trước khi lưu nháp.');
      return;
    }
    emit(buildPayloadV6('nhap'));
    resetForm();
    onClose();
  }

  function handleSubmit() {
    const err = validateForSubmit();
    if (err) {
      alert(err);
      return;
    }
    emit(buildPayloadV6('da_gui'));
    resetForm();
    onClose();
  }

  function handleAddAttachmentPlaceholder() {
    // Placeholder upload — V2 sẽ tích hợp Firebase Storage.
    const name = window.prompt(
      'Nhập tên file (chức năng upload thực sẽ có ở phiên bản tiếp theo)',
      '',
    );
    if (!name) return;
    setAttachments((prev) => [...prev, { name: name.trim() }]);
  }

  function handleRemoveAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white rounded-t-xl z-10">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {isEditMode ? `Sửa đề xuất ${initialProposal?.code ?? ''}` : 'Tạo đề xuất mới'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Điền tối thiểu thông tin — hệ thống sẽ tự gợi ý luồng duyệt.
              {currentUserName && (
                <span className="ml-1 text-slate-400">
                  · Người tạo: <span className="text-slate-600 font-medium">{currentUserName}</span>
                  {currentUserRole ? ` (${ROLE_LABEL[currentUserRole] ?? currentUserRole})` : ''}
                  {currentUserBlock ? ` · Khối ${currentUserBlock === 'VP' ? 'Văn phòng' : 'Kinh doanh'}` : ''}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5 max-h-[72vh] overflow-y-auto">
          {/* 1 — Tên đề xuất */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tên đề xuất <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Mở lớp hè Hoàng Mai / Mua máy lọc mới / Tăng ngân sách Marketing tháng 7"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              maxLength={200}
            />
          </div>

          {/* 2 — Loại đề xuất */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Loại đề xuất <span className="text-rose-500">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {KIND_V6_OPTIONS.map(({ key, label, icon: Icon, tone }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setKind(key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
                    kind === key
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : `${tone} hover:border-emerald-400`
                  }`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* 3 — Lý do đề xuất */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Lý do đề xuất <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder={
                'Mô tả ngắn gọn hiện trạng, vấn đề và đề xuất giải pháp.\n' +
                'VD: Các lớp hè hiện tại đã kín 100%. Khoảng 60 học viên đang chờ xếp lớp. ' +
                'Đề nghị mở thêm 02 lớp hè để đáp ứng nhu cầu tuyển sinh.'
              }
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Tối thiểu 10 ký tự. Người duyệt sẽ đọc trực tiếp ô này.
            </p>
          </div>

          {/* 4 — Giá trị dự kiến (chỉ hiện khi kind = dau_tu) */}
          {kind === 'dau_tu' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Giá trị dự kiến (VNĐ)
                <span className="ml-1 text-[10px] font-normal text-slate-400">
                  (chỉ áp dụng cho đề xuất Đầu tư)
                </span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={estimatedCostStr}
                onChange={(e) => setEstimatedCostStr(e.target.value)}
                placeholder="VD: 20.000.000 / 150.000.000 / 500.000.000"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums"
              />
              {estimatedCostNum !== undefined && (
                <p className="text-[11px] text-emerald-700 mt-1">
                  ≈ {formatVND(estimatedCostNum)}
                </p>
              )}
            </div>
          )}

          {/* V6+ — Đơn vị liên quan (multi-select) + auto tag Trong khối / Liên khối */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Đơn vị liên quan
              <span className="ml-1 text-[10px] font-normal text-slate-400">
                (chọn nhiều · hệ thống tự xác định Trong khối / Liên khối)
              </span>
            </label>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              {/* Khối KD */}
              <div className="mb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">
                  Khối Kinh doanh
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_RELATED_UNITS.filter((u) => u.block === 'KD').map((u) => {
                    const active = relatedUnitIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUnit(u.id)}
                        className={
                          'px-2.5 py-1 rounded-md text-xs font-medium ring-1 transition ' +
                          (active
                            ? 'bg-emerald-100 text-emerald-800 ring-emerald-300'
                            : 'bg-white text-slate-600 ring-slate-200 hover:ring-emerald-300')
                        }
                      >
                        {u.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Khối VP */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700 mb-1">
                  Khối Văn phòng
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_RELATED_UNITS.filter((u) => u.block === 'VP').map((u) => {
                    const active = relatedUnitIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUnit(u.id)}
                        className={
                          'px-2.5 py-1 rounded-md text-xs font-medium ring-1 transition ' +
                          (active
                            ? 'bg-violet-100 text-violet-800 ring-violet-300'
                            : 'bg-white text-slate-600 ring-slate-200 hover:ring-violet-300')
                        }
                      >
                        {u.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Auto-tag scope chip */}
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <span className="text-slate-500">Phạm vi tự xác định:</span>
              <span
                className={
                  'inline-flex items-center px-2 py-0.5 rounded ring-1 ring-inset font-semibold ' +
                  UNITS_SCOPE_COLOR[unitsScope]
                }
              >
                {unitsScope === 'lien_khoi' ? '🔗 ' : '✓ '}
                {UNITS_SCOPE_LABEL[unitsScope]}
              </span>
              <span className="text-slate-400">
                ({relatedUnits.length} đơn vị · creator khối{' '}
                {currentUserBlock === 'KD' ? 'KD' : 'VP'})
              </span>
            </div>
          </div>

          {/* 5 — File đính kèm (placeholder) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              File đính kèm
              <span className="ml-1 text-[10px] font-normal text-slate-400">(tuỳ chọn)</span>
            </label>
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4">
              {attachments.length === 0 ? (
                <div className="text-center">
                  <Paperclip size={18} className="mx-auto text-slate-400 mb-1.5" />
                  <button
                    type="button"
                    onClick={handleAddAttachmentPlaceholder}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800 underline"
                  >
                    Thêm file đính kèm
                  </button>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Cho phép PDF, Excel, Word, Ảnh (upload thực sẽ có ở phiên bản tiếp theo).
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {attachments.map((a, idx) => (
                    <div
                      key={`${a.name}-${idx}`}
                      className="flex items-center justify-between bg-white border border-slate-200 rounded-md px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={13} className="text-slate-500 shrink-0" />
                        <span className="text-xs text-slate-700 truncate">{a.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(idx)}
                        className="text-[11px] text-rose-600 hover:text-rose-700"
                      >
                        Xoá
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddAttachmentPlaceholder}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800 underline"
                  >
                    + Thêm file
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* V6.4 (2026-06-12): Chọn người nhận đề xuất — UID cụ thể */}
          <section className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Gửi đề xuất tới <span className="text-rose-500">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[11px] text-slate-500">Cấp:</span>
              <div className="inline-flex rounded-md ring-1 ring-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setRecipientTier('senior')}
                  className={`px-3 py-1 text-xs font-medium ${
                    recipientTier === 'senior'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Cấp trên
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientTier('peer')}
                  className={`px-3 py-1 text-xs font-medium border-l border-slate-200 ${
                    recipientTier === 'peer'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Ngang cấp
                </button>
              </div>
            </div>
            <select
              value={recipientUid}
              onChange={(e) => {
                const uid = e.target.value;
                setRecipientUid(uid);
                const opt = recipientOptions.find((o) => o.uid === uid);
                setRecipientName(opt?.displayName ?? '');
              }}
              disabled={loadingRecipients}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">
                {loadingRecipients
                  ? 'Đang tải danh sách...'
                  : recipientOptions.length === 0
                  ? 'Không có người nhận phù hợp ở cấp này'
                  : '— Chọn người nhận —'}
              </option>
              {recipientOptions.map((o) => (
                <option key={o.uid} value={o.uid}>
                  {o.displayName} · {o.roleName || o.roleCode}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1.5 italic">
              Người được chọn sẽ là cấp đầu tiên duyệt. Hệ thống tự bổ sung các cấp tiếp theo dựa trên luồng duyệt gợi ý bên dưới.
            </p>
          </section>

          {/* Luồng duyệt gợi ý — READ-ONLY */}
          <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Workflow size={14} className="text-emerald-700" />
              <p className="text-xs font-semibold text-emerald-800">Luồng duyệt gợi ý</p>
            </div>
            {resolvedChain.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                Chọn loại đề xuất ở trên để hệ thống gợi ý chuỗi duyệt phù hợp.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  {resolvedChain.map((s, idx) => (
                    <span key={`${s.roleCode}-${idx}`} className="inline-flex items-center gap-1">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-white border border-emerald-300 text-emerald-800">
                        <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold inline-flex items-center justify-center">
                          {idx + 1}
                        </span>
                        {s.label}
                      </span>
                      {idx < resolvedChain.length - 1 && (
                        <span className="text-emerald-600">→</span>
                      )}
                    </span>
                  ))}
                </div>
                {chainReason && (
                  <p className="text-[11px] text-emerald-700 mt-2">Căn cứ: {chainReason}</p>
                )}
                <p className="text-[11px] text-slate-500 mt-1 italic">
                  Luồng duyệt được quyết định bởi Cài đặt → Workflow Đề xuất.
                </p>
              </>
            )}
          </section>
        </div>

        {/* Footer — 3 nút theo SPEC */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50 rounded-b-xl sticky bottom-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg border border-transparent"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
          >
            Lưu nháp
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
          >
            {isEditMode ? 'Lưu thay đổi' : 'Gửi đề xuất'}
          </button>
        </div>
      </div>
    </div>
  );
}
