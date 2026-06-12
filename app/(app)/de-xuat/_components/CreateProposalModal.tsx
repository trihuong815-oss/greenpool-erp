'use client';

// Modal tạo đề xuất V5 — theo SPEC anh chốt 2026-06-12.
// 5 BLOCK + 5 câu hỏi guide ở top:
//   B1 Thông tin đề xuất (tiêu đề · 5 loại · 3 ưu tiên · 6 nguồn · giá trị dự kiến)
//   B2 Hiện trạng & Vấn đề (hiện trạng · vấn đề · bằng chứng · attachments)
//   B3 Giải pháp đề xuất (nội dung · phạm vi MULTI-SELECT · quyết định cần xin)
//   B4 Hiệu quả kỳ vọng (lợi ích · rủi ro nếu không · kết quả kỳ vọng textarea)
//   B5 Sau khi duyệt (accordion: chỉ phê duyệt / đề nghị tạo điều phối)
// Luồng duyệt hiển thị READ-ONLY ngay sau Block 1, auto theo loại+ưu tiên+giá trị+phạm vi.
// Footer: Huỷ / Lưu nháp / Gửi đề xuất.
//
// Backward-compat: GIỮ NGUYÊN tất cả type V3 cũ (CreateProposalPayloadV3,
// CreateProposalPayload, ProposalKindV3...) để DeXuatClient cũ vẫn build được.
// Modal mới phát V5; emit() vẫn map về V3 + V2 nếu callsite cần.

import { useMemo, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  FileText,
  Users,
  Coins,
  Sparkles,
  Megaphone,
  Target,
  Paperclip,
  Workflow,
  CheckSquare,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types V5 (mới)
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

// Phạm vi ảnh hưởng (multi-select). 4 nhóm: tp · qlcs · co_so · khoi
export type ScopeTargetKind = 'tp' | 'qlcs' | 'co_so' | 'khoi';

export interface ScopeTarget {
  id: string;        // 'tp:TP_MKT' | 'qlcs:QLCS_HM' | 'co_so:HM' | 'khoi:KD'
  kind: ScopeTargetKind;
  label: string;     // "TP Marketing"
  blockHint?: 'KD' | 'VP'; // dùng cho auto-suy luận khối
}

export interface ResolvedStep {
  roleCode: string;
  label: string;
  reason: string;
}

export interface CreateProposalPayloadV5 {
  status: 'nhap' | 'da_gui';

  // BLOCK 1 — Thông tin đề xuất
  title: string;
  kind: ProposalKindV5;
  priority: ProposalPriorityV5;
  source: ProposalSourceV5;
  estimatedCost?: number;

  // BLOCK 2 — Hiện trạng & Vấn đề (câu hỏi 1)
  currentSituation: string;
  problemStatement: string;
  evidence?: string;
  attachments: string[];

  // BLOCK 3 — Giải pháp đề xuất (câu hỏi 2, 3, 4)
  proposedSolution: string;
  scopeTargets: ScopeTarget[];
  decisionRequested: string;

  // BLOCK 4 — Hiệu quả kỳ vọng (câu hỏi 5)
  expectedBenefit: string;
  riskIfNot: string;
  expectedResult: string;

  // BLOCK 5 — Sau khi duyệt
  afterApproval: 'chi_phe_duyet' | 'de_nghi_tao_dieu_phoi';
  suggestedOwnerUid?: string;
  suggestedOwnerName?: string;
  suggestedDeadline?: string;     // YYYY-MM-DD
  deploymentNote?: string;

  // Auto-computed (read-only, đính kèm khi gửi)
  resolvedApproverChain?: ResolvedStep[];
  resolvedBlock?: 'KD' | 'VP' | 'cross';
  isCrossBlock?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types V3 — GIỮ NGUYÊN cho backward-compat (DeXuatClient cũ vẫn import)
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

interface UserOption {
  id: string;
  name: string;
  roleId: string;
}

interface CreateProposalModalProps {
  open: boolean;
  onClose: () => void;
  /** V5 callback — ưu tiên dùng. */
  onSubmitV5?: (payload: CreateProposalPayloadV5) => void;
  /** V3 callback — giữ lại để callsite V3 không vỡ. Sẽ nhận payload V3 đã map. */
  onSubmit?: (payload: CreateProposalPayloadV3) => void;
  /** V2 backward-compat — DeXuatClient hiện hành dùng tên này. */
  onCreate?: (payload: CreateProposalPayload) => void;
  users?: UserOption[];
  currentUserRole?: string;
  currentUserName?: string;
  /** Khối của người tạo — dùng cho auto-suy luận chuỗi duyệt. */
  currentUserBlock?: 'KD' | 'VP';
  /** Optional — không còn dùng trong V5 nhưng giữ prop để callsite cũ không vỡ. */
  departments?: { id: string; name: string }[];
  branches?: { id: string; name: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels V5
// ─────────────────────────────────────────────────────────────────────────────

const KIND_V5_OPTIONS: { key: ProposalKindV5; label: string; icon: any; tone: string }[] = [
  { key: 'van_hanh',   label: 'Vận hành',  icon: Sparkles, tone: 'bg-sky-50 text-sky-700 border-sky-300' },
  { key: 'cai_tien',   label: 'Cải tiến',  icon: Lightbulb, tone: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  { key: 'dau_tu',     label: 'Đầu tư',    icon: Coins, tone: 'bg-amber-50 text-amber-700 border-amber-300' },
  { key: 'chien_luoc', label: 'Chiến lược', icon: Target, tone: 'bg-violet-50 text-violet-700 border-violet-300' },
  { key: 'khan_cap',   label: 'Khẩn cấp',  icon: AlertTriangle, tone: 'bg-rose-50 text-rose-700 border-rose-300' },
];

const PRIORITY_V5_OPTIONS: { key: ProposalPriorityV5; label: string; tone: string }[] = [
  { key: 'binh_thuong', label: 'Bình thường', tone: 'bg-slate-100 text-slate-700 border-slate-300' },
  { key: 'quan_trong',  label: 'Quan trọng',  tone: 'bg-amber-50 text-amber-800 border-amber-300' },
  { key: 'khan_cap',    label: 'Khẩn cấp',    tone: 'bg-rose-50 text-rose-700 border-rose-300' },
];

const SOURCE_V5_OPTIONS: { key: ProposalSourceV5; label: string }[] = [
  { key: 'phat_sinh',            label: 'Phát sinh thực tế' },
  { key: 'kpi',                  label: 'Từ KPI' },
  { key: 'hop',                  label: 'Từ cuộc họp' },
  { key: 'ceo_giao',             label: 'CEO giao' },
  { key: 'khach_hang_phan_anh',  label: 'Khách hàng phản ánh' },
  { key: 'khac',                 label: 'Khác' },
];

// Danh sách phạm vi ảnh hưởng (multi-select)
const SCOPE_TARGETS_TP: ScopeTarget[] = [
  { id: 'tp:TP_MKT', kind: 'tp', label: 'TP Marketing', blockHint: 'KD' },
  { id: 'tp:TP_DT',  kind: 'tp', label: 'TP Đào tạo',   blockHint: 'KD' },
  { id: 'tp:TP_KT',  kind: 'tp', label: 'TP Kỹ thuật',  blockHint: 'VP' },
  { id: 'tp:TP_NS',  kind: 'tp', label: 'TP Nhân sự',   blockHint: 'VP' },
  { id: 'tp:TP_KE',  kind: 'tp', label: 'TP Kế toán',   blockHint: 'VP' },
  { id: 'tp:TP_GS',  kind: 'tp', label: 'TP Giám sát',  blockHint: 'KD' },
];

const SCOPE_TARGETS_QLCS: ScopeTarget[] = [
  { id: 'qlcs:QLCS_HM',  kind: 'qlcs', label: 'QLCS Hoàng Mai',     blockHint: 'KD' },
  { id: 'qlcs:QLCS_TK',  kind: 'qlcs', label: 'QLCS Thái Kim',       blockHint: 'KD' },
  { id: 'qlcs:QLCS_CTT', kind: 'qlcs', label: 'QLCS Cổ Tân Trào',    blockHint: 'KD' },
  { id: 'qlcs:QLCS_24',  kind: 'qlcs', label: 'QLCS 24 NCT',         blockHint: 'KD' },
  { id: 'qlcs:QLCS_TT',  kind: 'qlcs', label: 'QLCS Tân Triều',      blockHint: 'KD' },
];

const SCOPE_TARGETS_CO_SO: ScopeTarget[] = [
  { id: 'co_so:HM',  kind: 'co_so', label: 'Cơ sở Hoàng Mai',  blockHint: 'KD' },
  { id: 'co_so:TK',  kind: 'co_so', label: 'Cơ sở Thái Kim',   blockHint: 'KD' },
  { id: 'co_so:CTT', kind: 'co_so', label: 'Cơ sở Cổ Tân Trào', blockHint: 'KD' },
  { id: 'co_so:24',  kind: 'co_so', label: 'Cơ sở 24 NCT',      blockHint: 'KD' },
  { id: 'co_so:TT',  kind: 'co_so', label: 'Cơ sở Tân Triều',   blockHint: 'KD' },
];

const SCOPE_TARGETS_KHOI: ScopeTarget[] = [
  { id: 'khoi:KD', kind: 'khoi', label: 'GĐ Kinh doanh',  blockHint: 'KD' },
  { id: 'khoi:VP', kind: 'khoi', label: 'GĐ Văn phòng',   blockHint: 'VP' },
];

const ROLE_LABEL: Record<string, string> = {
  CEO: 'CEO',
  CT: 'Chủ tịch',
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

// Ngưỡng tài chính V5 — cấu hình tại đây, KHÔNG hard-code rải rác.
const COST_TIER_SMALL = 10_000_000;
const COST_TIER_MID = 50_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// Auto-suy luận khối liên quan + chuỗi duyệt V5
// ─────────────────────────────────────────────────────────────────────────────

function resolveBlockFromScope(targets: ScopeTarget[]): {
  block: 'KD' | 'VP' | 'cross';
  isCross: boolean;
} {
  if (targets.length === 0) return { block: 'KD', isCross: false };
  let hasKD = false;
  let hasVP = false;
  for (const t of targets) {
    if (t.blockHint === 'KD') hasKD = true;
    if (t.blockHint === 'VP') hasVP = true;
  }
  if (hasKD && hasVP) return { block: 'cross', isCross: true };
  if (hasVP) return { block: 'VP', isCross: false };
  return { block: 'KD', isCross: false };
}

interface ResolveChainInput {
  kind: ProposalKindV5 | '';
  priority: ProposalPriorityV5;
  estimatedCost?: number;
  scopeTargets: ScopeTarget[];
}

function resolveApproverChainV5(input: ResolveChainInput): {
  steps: ResolvedStep[];
  reasonSummary: string;
} {
  const { kind, priority, estimatedCost = 0, scopeTargets } = input;
  if (!kind) return { steps: [], reasonSummary: '' };
  const { block, isCross } = resolveBlockFromScope(scopeTargets);
  const out: ResolvedStep[] = [];
  const reasons: string[] = [];

  // 1) Khẩn cấp hoặc kind = khan_cap → CEO ngay
  if (priority === 'khan_cap' || kind === 'khan_cap') {
    if (isCross) {
      out.push({ roleCode: 'GD_KD', label: 'GĐ Kinh doanh', reason: 'Khối Kinh doanh có liên quan' });
      out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Khối Văn phòng có liên quan' });
    } else if (block === 'VP') {
      out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Phụ trách khối liên quan' });
    } else {
      out.push({ roleCode: 'GD_KD', label: 'GĐ Kinh doanh', reason: 'Phụ trách khối liên quan' });
    }
    out.push({ roleCode: 'CEO', label: 'CEO', reason: 'Mức khẩn cấp — CEO duyệt' });
    reasons.push('mức khẩn cấp');
    return { steps: out, reasonSummary: reasons.join(' · ') };
  }

  // 2) Chiến lược → luôn lên CEO
  if (kind === 'chien_luoc') {
    if (isCross) {
      out.push({ roleCode: 'GD_KD', label: 'GĐ Kinh doanh', reason: 'Khối Kinh doanh có liên quan' });
      out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Khối Văn phòng có liên quan' });
    } else {
      out.push({
        roleCode: block === 'VP' ? 'GD_VP' : 'GD_KD',
        label: block === 'VP' ? 'GĐ Văn phòng' : 'GĐ Kinh doanh',
        reason: 'Phụ trách khối liên quan',
      });
    }
    out.push({ roleCode: 'CEO', label: 'CEO', reason: 'Đề xuất chiến lược' });
    reasons.push('loại chiến lược');
    return { steps: out, reasonSummary: reasons.join(' · ') };
  }

  // 3) Đầu tư hoặc có chi phí → xét ngưỡng tài chính
  const hasCost = estimatedCost > 0 || kind === 'dau_tu';
  if (hasCost) {
    out.push({ roleCode: 'TP_KE', label: 'TP Kế toán', reason: 'Kiểm tra ngân sách' });
    reasons.push('có chi phí');

    if (estimatedCost > COST_TIER_MID) {
      out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Phụ trách tài chính' });
      if (block === 'KD' || isCross) {
        out.push({ roleCode: 'GD_KD', label: 'GĐ Kinh doanh', reason: 'Khối Kinh doanh liên quan' });
      }
      out.push({ roleCode: 'CEO', label: 'CEO', reason: 'Vượt ngưỡng 50 triệu' });
      reasons.push('> 50 triệu');
      return { steps: out, reasonSummary: reasons.join(' · ') };
    }
    if (estimatedCost > COST_TIER_SMALL) {
      out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Duyệt 10–50 triệu' });
      if (block === 'KD' || isCross) {
        out.push({ roleCode: 'GD_KD', label: 'GĐ Kinh doanh', reason: 'Khối Kinh doanh đồng ý' });
      }
      reasons.push('10–50 triệu');
      return { steps: out, reasonSummary: reasons.join(' · ') };
    }
    // < 10 triệu (hoặc kind=dau_tu nhưng cost nhỏ)
    out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Duyệt chi phí nhỏ' });
    reasons.push('< 10 triệu');
    return { steps: out, reasonSummary: reasons.join(' · ') };
  }

  // 4) Vận hành / cải tiến không chi phí — GĐ khối liên quan duyệt
  if (isCross) {
    out.push({ roleCode: 'GD_KD', label: 'GĐ Kinh doanh', reason: 'Khối Kinh doanh có liên quan' });
    out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Khối Văn phòng có liên quan' });
    reasons.push('liên khối');
  } else {
    out.push({
      roleCode: block === 'VP' ? 'GD_VP' : 'GD_KD',
      label: block === 'VP' ? 'GĐ Văn phòng' : 'GĐ Kinh doanh',
      reason: 'Phụ trách khối liên quan',
    });
    reasons.push(`khối ${block === 'VP' ? 'Văn phòng' : 'Kinh doanh'}`);
  }
  // Mức quan trọng → bổ sung CEO ack
  if (priority === 'quan_trong') {
    out.push({ roleCode: 'CEO', label: 'CEO', reason: 'Mức quan trọng — CEO nắm' });
    reasons.push('mức quan trọng');
  }
  return { steps: out, reasonSummary: reasons.join(' · ') };
}

// ─────────────────────────────────────────────────────────────────────────────
// V5 → V3 mapper (để callsite V3 vẫn nhận được payload hợp lệ)
// ─────────────────────────────────────────────────────────────────────────────

function kindV5ToV3(k: ProposalKindV5): ProposalKindV3 {
  switch (k) {
    case 'van_hanh':   return 'van_hanh';
    case 'cai_tien':   return 'van_hanh';
    case 'dau_tu':     return 'tai_chinh';
    case 'chien_luoc': return 'chien_luoc';
    case 'khan_cap':   return 'van_hanh';
  }
}

function priorityV5ToV3(p: ProposalPriorityV5): ProposalPriorityV3 {
  switch (p) {
    case 'binh_thuong': return 'thuong';
    case 'quan_trong':  return 'cao';
    case 'khan_cap':    return 'khan';
  }
}

function blockV5ToV3(b: 'KD' | 'VP' | 'cross'): ProposalBlockV3 {
  if (b === 'cross') return 'lien_khoi';
  return b;
}

function mapV5ToV3(p: CreateProposalPayloadV5): CreateProposalPayloadV3 {
  const resolvedBlock = p.resolvedBlock ?? 'KD';
  return {
    status: p.status,
    title: p.title,
    kind: kindV5ToV3(p.kind),
    priority: priorityV5ToV3(p.priority),
    relatedBlock: blockV5ToV3(resolvedBlock),
    relatedDeptId: undefined,
    relatedBranchId: undefined,
    currentSituation: p.currentSituation,
    problemStatement: p.problemStatement,
    evidence: p.evidence,
    attachments: p.attachments,
    proposedSolution: p.proposedSolution,
    scope: p.scopeTargets.map((t) => t.label).join(' · '),
    expectedStartDate: p.suggestedDeadline,
    involvedUnits: p.scopeTargets.map((t) => t.label).join(', '),
    expectedBenefit: p.expectedBenefit,
    riskIfNot: p.riskIfNot,
    riskIfDo: '',
    estimatedCost: typeof p.estimatedCost === 'number' ? p.estimatedCost : null,
    neededHeadcount: null,
    approverChain: (p.resolvedApproverChain ?? []).map((s, idx) => ({
      id: `v5-${idx}-${s.roleCode}`,
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
    expectedDeliverable: p.expectedResult || p.deploymentNote,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CreateProposalModal({
  open,
  onClose,
  onSubmitV5,
  onSubmit,
  onCreate,
  users = [],
  currentUserRole,
  currentUserName,
  currentUserBlock = 'KD',
}: CreateProposalModalProps) {
  // BLOCK 1
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ProposalKindV5 | ''>('');
  const [priority, setPriority] = useState<ProposalPriorityV5>('binh_thuong');
  const [source, setSource] = useState<ProposalSourceV5 | ''>('');
  const [estimatedCostStr, setEstimatedCostStr] = useState('');

  // BLOCK 2
  const [currentSituation, setCurrentSituation] = useState('');
  const [problemStatement, setProblemStatement] = useState('');
  const [evidence, setEvidence] = useState('');

  // BLOCK 3
  const [proposedSolution, setProposedSolution] = useState('');
  const [scopeTargets, setScopeTargets] = useState<ScopeTarget[]>([]);
  const [decisionRequested, setDecisionRequested] = useState('');
  const [scopeExpanded, setScopeExpanded] = useState(true);

  // BLOCK 4
  const [expectedBenefit, setExpectedBenefit] = useState('');
  const [riskIfNot, setRiskIfNot] = useState('');
  const [expectedResult, setExpectedResult] = useState('');

  // BLOCK 5 — accordion thu gọn mặc định
  const [afterExpanded, setAfterExpanded] = useState(false);
  const [afterApproval, setAfterApproval] =
    useState<'chi_phe_duyet' | 'de_nghi_tao_dieu_phoi'>('chi_phe_duyet');
  const [suggestedOwnerName, setSuggestedOwnerName] = useState('');
  const [suggestedDeadline, setSuggestedDeadline] = useState('');
  const [deploymentNote, setDeploymentNote] = useState('');

  // ── derived ─────────────────────────────────────────────────────────────
  const estimatedCostNum = useMemo(() => {
    const trimmed = estimatedCostStr.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [estimatedCostStr]);

  const { block: resolvedBlock, isCross: isCrossBlock } = useMemo(
    () => resolveBlockFromScope(scopeTargets),
    [scopeTargets],
  );

  const { steps: resolvedChain, reasonSummary } = useMemo(
    () =>
      resolveApproverChainV5({
        kind,
        priority,
        estimatedCost: estimatedCostNum,
        scopeTargets,
      }),
    [kind, priority, estimatedCostNum, scopeTargets],
  );

  if (!open) return null;

  // ── scope helpers ────────────────────────────────────────────────────────
  function toggleScopeTarget(t: ScopeTarget) {
    setScopeTargets((prev) => {
      const exists = prev.some((x) => x.id === t.id);
      if (exists) return prev.filter((x) => x.id !== t.id);
      return [...prev, t];
    });
  }

  function isScopeChecked(id: string) {
    return scopeTargets.some((x) => x.id === id);
  }

  // ── reset / close ────────────────────────────────────────────────────────
  function resetForm() {
    setTitle('');
    setKind('');
    setPriority('binh_thuong');
    setSource('');
    setEstimatedCostStr('');
    setCurrentSituation('');
    setProblemStatement('');
    setEvidence('');
    setProposedSolution('');
    setScopeTargets([]);
    setDecisionRequested('');
    setScopeExpanded(true);
    setExpectedBenefit('');
    setRiskIfNot('');
    setExpectedResult('');
    setAfterExpanded(false);
    setAfterApproval('chi_phe_duyet');
    setSuggestedOwnerName('');
    setSuggestedDeadline('');
    setDeploymentNote('');
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  // ── validate ─────────────────────────────────────────────────────────────
  function validateForSubmit(): string | null {
    if (!title.trim()) return 'Vui lòng nhập tiêu đề đề xuất.';
    if (!kind) return 'Vui lòng chọn loại đề xuất.';
    if (!priority) return 'Vui lòng chọn mức ưu tiên.';
    if (!source) return 'Vui lòng chọn nguồn phát sinh.';
    if (!currentSituation.trim()) return 'Vui lòng mô tả hiện trạng.';
    if (!problemStatement.trim()) return 'Vui lòng mô tả vấn đề cần xử lý.';
    if (!proposedSolution.trim()) return 'Vui lòng nhập nội dung đề xuất.';
    if (scopeTargets.length === 0) return 'Vui lòng chọn ít nhất 1 phạm vi ảnh hưởng.';
    if (!decisionRequested.trim()) return 'Vui lòng nhập quyết định cần xin.';
    if (!expectedBenefit.trim()) return 'Vui lòng nhập lợi ích kỳ vọng.';
    if (!riskIfNot.trim()) return 'Vui lòng nhập rủi ro nếu không thực hiện.';
    return null;
  }

  function buildPayloadV5(status: 'nhap' | 'da_gui'): CreateProposalPayloadV5 {
    return {
      status,
      title: title.trim(),
      kind: kind as ProposalKindV5,
      priority,
      source: source as ProposalSourceV5,
      estimatedCost: estimatedCostNum,
      currentSituation: currentSituation.trim(),
      problemStatement: problemStatement.trim(),
      evidence: evidence.trim() || undefined,
      attachments: [],
      proposedSolution: proposedSolution.trim(),
      scopeTargets,
      decisionRequested: decisionRequested.trim(),
      expectedBenefit: expectedBenefit.trim(),
      riskIfNot: riskIfNot.trim(),
      expectedResult: expectedResult.trim(),
      afterApproval,
      suggestedOwnerName:
        afterApproval === 'de_nghi_tao_dieu_phoi' && suggestedOwnerName.trim()
          ? suggestedOwnerName.trim()
          : undefined,
      suggestedDeadline:
        afterApproval === 'de_nghi_tao_dieu_phoi' && suggestedDeadline
          ? suggestedDeadline
          : undefined,
      deploymentNote:
        afterApproval === 'de_nghi_tao_dieu_phoi' && deploymentNote.trim()
          ? deploymentNote.trim()
          : undefined,
      resolvedApproverChain: resolvedChain,
      resolvedBlock,
      isCrossBlock,
    };
  }

  function emit(payload: CreateProposalPayloadV5) {
    // V5 trước
    onSubmitV5?.(payload);

    // V3 (DeXuatClient hiện tại) — map xuống V3 shape
    if (onSubmit || onCreate) {
      const v3 = mapV5ToV3(payload);
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

  function handleSaveDraft() {
    if (!title.trim()) {
      alert('Vui lòng nhập tiêu đề đề xuất.');
      return;
    }
    if (!kind) {
      alert('Vui lòng chọn loại đề xuất.');
      return;
    }
    emit(buildPayloadV5('nhap'));
    resetForm();
    onClose();
  }

  function handleSubmit() {
    const err = validateForSubmit();
    if (err) {
      alert(err);
      return;
    }
    emit(buildPayloadV5('da_gui'));
    resetForm();
    onClose();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white rounded-t-xl z-10">
          <div>
            <h2 className="text-base font-bold text-slate-800">Tạo đề xuất mới</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Đề xuất là <span className="font-semibold">XIN QUYẾT ĐỊNH</span>. Sau khi được duyệt,
              có thể chuyển thành điều phối triển khai.
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
        <div className="px-5 py-4 space-y-6 max-h-[72vh] overflow-y-auto">
          {/* ───── Banner: 5 câu hỏi guide ───── */}
          <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-800 mb-1.5">
              5 câu hỏi cần trả lời
            </p>
            <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-900 list-decimal list-inside">
              <li>Đang có vấn đề gì?</li>
              <li>Đề xuất giải pháp gì?</li>
              <li>Ảnh hưởng tới ai?</li>
              <li>Cần quyết định gì?</li>
              <li>Nếu được duyệt thì kỳ vọng đạt gì?</li>
            </ol>
          </section>

          {/* ───── BLOCK 1 — Thông tin đề xuất ───── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              1. Thông tin đề xuất
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tiêu đề <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: Đề xuất mua máy lọc nước RO cho cơ sở 24 NCT"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Loại đề xuất <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {KIND_V5_OPTIONS.map(({ key, label, icon: Icon, tone }) => (
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

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Mức độ ưu tiên <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITY_V5_OPTIONS.map(({ key, label, tone }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPriority(key)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                        priority === key
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : `${tone} hover:border-emerald-400`
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Nguồn phát sinh <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SOURCE_V5_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSource(key)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                        source === key
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Giá trị dự kiến (VNĐ)
                  <span className="ml-1 text-[10px] text-slate-400">
                    (tuỳ chọn — chỉ nhập nếu là Đầu tư hoặc liên quan tài chính)
                  </span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={estimatedCostStr}
                  onChange={(e) => setEstimatedCostStr(e.target.value)}
                  placeholder="VD: 12000000"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums"
                />
              </div>
            </div>
          </section>

          {/* ───── Luồng duyệt gợi ý (READ-ONLY) ───── */}
          <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Workflow size={14} className="text-emerald-700" />
              <p className="text-xs font-semibold text-emerald-800">
                Hệ thống đề xuất luồng duyệt
              </p>
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
                {reasonSummary && (
                  <p className="text-[11px] text-emerald-700 mt-2">
                    Lý do: {reasonSummary}
                  </p>
                )}
                <p className="text-[11px] text-slate-500 mt-1.5 italic">
                  Anh có thể đề nghị thay đổi luồng duyệt sau khi gửi nếu cần.
                </p>
              </>
            )}
          </section>

          {/* ───── BLOCK 2 — Hiện trạng & Vấn đề (câu hỏi 1) ───── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              2. Hiện trạng & Vấn đề
              <span className="ml-2 text-[10px] normal-case text-slate-400 font-normal">
                (Câu hỏi 1: Đang có vấn đề gì?)
              </span>
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Hiện trạng <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={currentSituation}
                  onChange={(e) => setCurrentSituation(e.target.value)}
                  rows={2}
                  placeholder="Đang làm như thế nào, kết quả hiện tại ra sao..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Vấn đề cần xử lý <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={problemStatement}
                  onChange={(e) => setProblemStatement(e.target.value)}
                  rows={2}
                  placeholder="Điểm nghẽn, rủi ro, thiệt hại nếu không xử lý..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Bằng chứng / Dữ liệu
                </label>
                <textarea
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  rows={2}
                  placeholder="Số liệu, link sheet, screenshot, báo cáo..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center">
                <Paperclip size={18} className="mx-auto text-slate-400 mb-1.5" />
                <p className="text-xs text-slate-500">
                  Đính kèm ảnh / PDF / Excel / Word / Video sẽ có ở phiên bản tiếp theo.
                  Tạm thời dán link tài liệu vào ô &quot;Bằng chứng&quot;.
                </p>
              </div>
            </div>
          </section>

          {/* ───── BLOCK 3 — Giải pháp đề xuất (câu hỏi 2, 3, 4) ───── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              3. Giải pháp đề xuất
              <span className="ml-2 text-[10px] normal-case text-slate-400 font-normal">
                (Câu hỏi 2, 3, 4)
              </span>
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nội dung đề xuất <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={proposedSolution}
                  onChange={(e) => setProposedSolution(e.target.value)}
                  rows={3}
                  placeholder="Phương án cụ thể, các bước thực hiện..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>

              {/* Phạm vi ảnh hưởng — MULTI-SELECT */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Phạm vi ảnh hưởng <span className="text-rose-500">*</span>
                    <span className="ml-1 text-[10px] text-slate-400">
                      (chọn nhiều)
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setScopeExpanded((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-emerald-700"
                  >
                    {scopeExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {scopeExpanded ? 'Thu gọn' : 'Mở rộng'}
                  </button>
                </div>

                {scopeExpanded && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
                    <ScopeGroup
                      title="Trưởng phòng (TP)"
                      items={SCOPE_TARGETS_TP}
                      isChecked={isScopeChecked}
                      onToggle={toggleScopeTarget}
                    />
                    <ScopeGroup
                      title="Quản lý cơ sở (QLCS)"
                      items={SCOPE_TARGETS_QLCS}
                      isChecked={isScopeChecked}
                      onToggle={toggleScopeTarget}
                    />
                    <ScopeGroup
                      title="Cơ sở"
                      items={SCOPE_TARGETS_CO_SO}
                      isChecked={isScopeChecked}
                      onToggle={toggleScopeTarget}
                    />
                    <ScopeGroup
                      title="Khối / Giám đốc"
                      items={SCOPE_TARGETS_KHOI}
                      isChecked={isScopeChecked}
                      onToggle={toggleScopeTarget}
                    />
                  </div>
                )}

                {/* Auto-suy luận khối liên quan (read-only tag) */}
                {scopeTargets.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Hệ thống suy luận:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md bg-violet-50 text-violet-700 border border-violet-200">
                      Khối liên quan: {resolvedBlock === 'cross' ? 'Cả 2 khối' : resolvedBlock === 'VP' ? 'Văn phòng' : 'Kinh doanh'}
                    </span>
                    {isCrossBlock && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                        Có liên khối
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Quyết định cần xin <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={decisionRequested}
                  onChange={(e) => setDecisionRequested(e.target.value)}
                  rows={2}
                  placeholder="VD: Phê duyệt ngân sách 12 triệu để mua máy lọc nước..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
            </div>
          </section>

          {/* ───── BLOCK 4 — Hiệu quả kỳ vọng (câu hỏi 5) ───── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold flex items-center gap-1.5">
              <TrendingUp size={13} className="text-emerald-600" />
              4. Hiệu quả kỳ vọng
              <span className="ml-1 text-[10px] normal-case text-slate-400 font-normal">
                (Câu hỏi 5: Nếu được duyệt thì kỳ vọng đạt gì?)
              </span>
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Lợi ích kỳ vọng <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={expectedBenefit}
                  onChange={(e) => setExpectedBenefit(e.target.value)}
                  rows={2}
                  placeholder="Tăng doanh thu, giảm chi phí, nâng cao chất lượng dịch vụ..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Rủi ro nếu không thực hiện <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={riskIfNot}
                  onChange={(e) => setRiskIfNot(e.target.value)}
                  rows={2}
                  placeholder="Hậu quả của việc trì hoãn..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Kết quả kỳ vọng
                </label>
                <textarea
                  value={expectedResult}
                  onChange={(e) => setExpectedResult(e.target.value)}
                  rows={2}
                  placeholder="VD: Mở thêm 2 lớp hè / Tăng khả năng phục vụ HV / Giảm rủi ro kỹ thuật..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
            </div>
          </section>

          {/* ───── BLOCK 5 — Sau khi duyệt (accordion thu gọn) ───── */}
          <section className="rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setAfterExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 rounded-lg"
            >
              <span className="text-xs uppercase tracking-wider text-slate-600 font-semibold flex items-center gap-1.5">
                <CheckSquare size={13} className="text-emerald-600" />
                5. Sau khi duyệt
                <span className="ml-1 text-[10px] normal-case text-slate-400 font-normal">
                  (tuỳ chọn — mặc định thu gọn)
                </span>
              </span>
              {afterExpanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
            </button>

            {afterExpanded && (
              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
                <div className="space-y-1.5">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="afterApproval"
                      checked={afterApproval === 'chi_phe_duyet'}
                      onChange={() => setAfterApproval('chi_phe_duyet')}
                      className="mt-0.5 w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-700">
                      Chỉ phê duyệt
                      <span className="block text-[11px] text-slate-500">
                        Đề xuất được phê duyệt, không tự động tạo điều phối.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="afterApproval"
                      checked={afterApproval === 'de_nghi_tao_dieu_phoi'}
                      onChange={() => setAfterApproval('de_nghi_tao_dieu_phoi')}
                      className="mt-0.5 w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-700">
                      Đề nghị tạo điều phối sau khi duyệt
                      <span className="block text-[11px] text-slate-500">
                        Hệ thống sẽ gợi ý tạo nhanh điều phối. Người duyệt vẫn có quyền chỉnh sửa.
                      </span>
                    </span>
                  </label>
                </div>

                {afterApproval === 'de_nghi_tao_dieu_phoi' && (
                  <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Owner đề xuất
                          <span className="ml-1 text-[10px] text-slate-400">(tuỳ chọn)</span>
                        </label>
                        <input
                          type="text"
                          value={suggestedOwnerName}
                          onChange={(e) => setSuggestedOwnerName(e.target.value)}
                          placeholder="Tên người chịu trách nhiệm"
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                        <p className="text-[10px] text-slate-500 mt-1 italic">
                          Người duyệt vẫn có thể chỉnh sửa.
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Deadline đề xuất
                          <span className="ml-1 text-[10px] text-slate-400">(tuỳ chọn)</span>
                        </label>
                        <input
                          type="date"
                          value={suggestedDeadline}
                          onChange={(e) => setSuggestedDeadline(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Ghi chú triển khai
                        <span className="ml-1 text-[10px] text-slate-400">(tuỳ chọn)</span>
                      </label>
                      <textarea
                        value={deploymentNote}
                        onChange={(e) => setDeploymentNote(e.target.value)}
                        rows={2}
                        placeholder="Gợi ý cách triển khai, mốc thời gian quan trọng..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Footer — 3 action */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50 rounded-b-xl sticky bottom-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
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
            Gửi đề xuất
          </button>
          {/* keep imports referenced */}
          <FileText className="hidden" size={0} />
          <Plus className="hidden" size={0} />
          <Trash2 className="hidden" size={0} />
          <Users className="hidden" size={0} />
          <Megaphone className="hidden" size={0} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ScopeGroup sub-component (multi-select chip list)
// ─────────────────────────────────────────────────────────────────────────────

interface ScopeGroupProps {
  title: string;
  items: ScopeTarget[];
  isChecked: (id: string) => boolean;
  onToggle: (t: ScopeTarget) => void;
}

function ScopeGroup({ title, items, isChecked, onToggle }: ScopeGroupProps) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => {
          const checked = isChecked(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onToggle(t)}
              className={`px-2.5 py-1 text-[11px] rounded-md border transition ${
                checked
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
              }`}
            >
              {checked ? '✓ ' : ''}{t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
