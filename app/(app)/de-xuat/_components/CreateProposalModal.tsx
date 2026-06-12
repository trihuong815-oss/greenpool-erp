'use client';

// Modal tạo đề xuất V3 — theo SPEC anh chốt 2026-06-12:
//   - 5 loại CHỐT V3: van_hanh · nhan_su · mkt_kd · tai_chinh · chien_luoc
//   - 9 trạng thái CHỐT V3 (modal chỉ phát: 'nhap' | 'da_gui')
//   - 6 SECTION:
//       S1 Thông tin chung (tiêu đề · loại · ưu tiên · khối · phòng ban · cơ sở)
//       S2 Hiện trạng / Vấn đề (hiện trạng · vấn đề · bằng chứng · attachments)
//       S3 Nội dung đề xuất (giải pháp · phạm vi · thời gian · đơn vị liên quan)
//       S4 Tác động dự kiến (lợi ích · rủi ro nếu không / nếu có · chi phí · nhân sự)
//       S5 Luồng duyệt (auto-suggest theo loại + khối + chi phí — có thể chỉnh)
//       S6 Sau duyệt (checkbox: cần tạo điều phối → owner + collab + deadline + deliverable)
//   - Footer: "Lưu nháp" (nhap) · "Gửi duyệt" (da_gui)
//   - Backward-compat prop `onCreate` + alias `onSubmit` cho callsite cũ.

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
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
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
  uid: string;       // user id (rỗng nếu chưa chọn)
  name: string;      // tên hiển thị
  roleCode: string;  // mã vai trò (TP_NS, GD_VP, CEO...)
  reason: string;    // lý do bước duyệt (auto-suggest điền giúp)
  slaHours: number;  // SLA cho bước này
}

export interface CollaboratorDraftV3 {
  id: string;
  unit: string;     // tên đơn vị / phòng ban / cá nhân
  support: string;  // nội dung hỗ trợ ngắn
}

export interface CreateProposalPayloadV3 {
  status: 'nhap' | 'da_gui';
  // S1 — Thông tin chung
  title: string;
  kind: ProposalKindV3;
  priority: ProposalPriorityV3;
  relatedBlock: ProposalBlockV3;
  relatedDeptId?: string;
  relatedBranchId?: string;
  // S2 — Hiện trạng / Vấn đề
  currentSituation: string;
  problemStatement: string;
  evidence?: string;
  attachments: string[];
  // S3 — Nội dung đề xuất
  proposedSolution: string;
  scope: string;
  expectedStartDate?: string;     // YYYY-MM-DD
  involvedUnits: string;
  // S4 — Tác động dự kiến
  expectedBenefit: string;
  riskIfNot: string;
  riskIfDo: string;
  estimatedCost: number | null;
  neededHeadcount?: number | null;
  // S5 — Luồng duyệt
  approverChain: ApproverDraftV3[];
  // S6 — Sau duyệt
  createCoordAfter: boolean;
  expectedOwnerName?: string;
  expectedCollaborators?: CollaboratorDraftV3[];
  expectedDeadline?: string;       // YYYY-MM-DD
  expectedDeliverable?: string;
}

// Backward-compat alias — V2 callsite (DeXuatClient) đang dùng tên này.
export type CreateProposalPayload = CreateProposalPayloadV3 & {
  // Các field V2 cũ mà DeXuatClient đọc trực tiếp:
  description: string;
  deadline: string;
};

// Backward-compat alias kind (V2 tên cũ giữ tương thích import)
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
  /** V3 callback. Sẽ dùng nếu callsite truyền cờ này. */
  onSubmit?: (payload: CreateProposalPayloadV3) => void;
  /** V2 backward-compat — DeXuatClient hiện hành dùng tên này. */
  onCreate?: (payload: CreateProposalPayload) => void;
  users?: UserOption[];
  currentUserRole?: string;
  currentUserName?: string;
  /** Optional list phòng ban / cơ sở để render select */
  departments?: { id: string; name: string }[];
  branches?: { id: string; name: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels & helpers
// ─────────────────────────────────────────────────────────────────────────────

const KIND_OPTIONS: { key: ProposalKindV3; label: string; icon: any }[] = [
  { key: 'van_hanh',   label: 'Vận hành',              icon: Sparkles },
  { key: 'nhan_su',    label: 'Nhân sự',               icon: Users },
  { key: 'mkt_kd',     label: 'Marketing / Kinh doanh', icon: Megaphone },
  { key: 'tai_chinh',  label: 'Tài chính / Mua sắm',   icon: Coins },
  { key: 'chien_luoc', label: 'Chiến lược',            icon: Target },
];

const PRIORITY_OPTIONS: { key: ProposalPriorityV3; label: string; tone: string }[] = [
  { key: 'thap',    label: 'Thấp',       tone: 'bg-slate-100 text-slate-700 border-slate-300' },
  { key: 'thuong',  label: 'Bình thường', tone: 'bg-sky-50 text-sky-700 border-sky-300' },
  { key: 'cao',     label: 'Cao',         tone: 'bg-amber-50 text-amber-800 border-amber-300' },
  { key: 'khan',    label: 'Khẩn',        tone: 'bg-rose-50 text-rose-700 border-rose-300' },
];

const BLOCK_OPTIONS: { key: ProposalBlockV3; label: string }[] = [
  { key: 'KD',         label: 'Khối Kinh doanh' },
  { key: 'VP',         label: 'Khối Văn phòng' },
  { key: 'lien_khoi',  label: 'Liên khối' },
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

// ─────────────────────────────────────────────────────────────────────────────
// suggestApproverChain — preset engine theo SPEC V3
// Input: (kind + creatorBlock + estimatedCost) → output chuỗi duyệt gợi ý.
// Hạn mức ngân sách CHỐT (VND): < 10tr · 10–50tr · > 50tr.
// ─────────────────────────────────────────────────────────────────────────────

const COST_TIER_SMALL = 10_000_000;
const COST_TIER_MID = 50_000_000;

interface SuggestInput {
  kind: ProposalKindV3 | '';
  creatorBlock?: ProposalBlockV3;
  estimatedCost: number | null;
}

interface SuggestStep {
  roleCode: string;
  reason: string;
  slaHours: number;
}

function suggestApproverChain(input: SuggestInput): SuggestStep[] {
  const { kind, creatorBlock, estimatedCost } = input;
  const cost = estimatedCost ?? 0;
  if (!kind) return [];

  switch (kind) {
    case 'van_hanh': {
      // Owner nghiệp vụ liên quan — VD: QLCS → TP Đào tạo (mở lớp) / TP Giám sát hoặc GĐ VP (SOP cơ sở)
      const steps: SuggestStep[] = [
        { roleCode: 'TP_DT', reason: 'Phụ trách nghiệp vụ liên quan', slaHours: 48 },
      ];
      if (cost > COST_TIER_SMALL) steps.push({ roleCode: 'GD_VP', reason: 'Phê duyệt khối Văn phòng', slaHours: 72 });
      if (cost > COST_TIER_MID) steps.push({ roleCode: 'CEO', reason: 'Phê duyệt cấp CEO (chi phí lớn)', slaHours: 96 });
      return steps;
    }
    case 'nhan_su': {
      const steps: SuggestStep[] = [
        { roleCode: 'TP_DT', reason: 'Xác nhận nhu cầu đào tạo / vị trí', slaHours: 48 },
        { roleCode: 'TP_NS', reason: 'Đánh giá nguồn lực nhân sự', slaHours: 48 },
      ];
      const blockGd = creatorBlock === 'VP' ? 'GD_VP' : 'GD_KD';
      steps.push({ roleCode: blockGd, reason: 'Phê duyệt cấp Giám đốc khối', slaHours: 72 });
      if (cost > COST_TIER_MID) steps.push({ roleCode: 'CEO', reason: 'Vượt định biên / chi phí lớn', slaHours: 96 });
      return steps;
    }
    case 'mkt_kd': {
      const steps: SuggestStep[] = [
        { roleCode: 'TP_MKT', reason: 'Phụ trách Marketing', slaHours: 48 },
        { roleCode: 'GD_KD', reason: 'Phê duyệt khối Kinh doanh', slaHours: 72 },
      ];
      if (cost > COST_TIER_MID) steps.push({ roleCode: 'CEO', reason: 'Vượt hạn mức ngân sách', slaHours: 96 });
      return steps;
    }
    case 'tai_chinh': {
      const steps: SuggestStep[] = [];
      if (cost <= 0) {
        // 0 đ: TP / GĐ khối duyệt
        steps.push({ roleCode: 'TP_KE', reason: 'Kiểm tra hồ sơ', slaHours: 48 });
        steps.push({ roleCode: creatorBlock === 'KD' ? 'GD_KD' : 'GD_VP', reason: 'Phê duyệt cấp Giám đốc khối', slaHours: 72 });
      } else if (cost < COST_TIER_SMALL) {
        steps.push({ roleCode: 'TP_KE', reason: 'Kiểm tra ngân sách', slaHours: 48 });
        steps.push({ roleCode: 'GD_VP', reason: 'Phê duyệt < 10 triệu', slaHours: 72 });
      } else if (cost <= COST_TIER_MID) {
        steps.push({ roleCode: 'TP_KE', reason: 'Kiểm tra ngân sách', slaHours: 48 });
        steps.push({ roleCode: 'GD_VP', reason: 'Phê duyệt khối Văn phòng', slaHours: 72 });
        steps.push({ roleCode: creatorBlock === 'KD' ? 'GD_KD' : 'GD_VP', reason: 'Phê duyệt khối liên quan', slaHours: 72 });
      } else {
        steps.push({ roleCode: creatorBlock === 'KD' ? 'GD_KD' : 'GD_VP', reason: 'Phê duyệt Giám đốc khối', slaHours: 72 });
        steps.push({ roleCode: 'GD_VP', reason: 'Phê duyệt Giám đốc Văn phòng', slaHours: 72 });
        steps.push({ roleCode: 'CEO', reason: 'Vượt 50 triệu — phê duyệt CEO', slaHours: 96 });
      }
      return steps;
    }
    case 'chien_luoc': {
      const steps: SuggestStep[] = [
        { roleCode: creatorBlock === 'KD' ? 'GD_KD' : 'GD_VP', reason: 'Phê duyệt Giám đốc khối', slaHours: 72 },
        { roleCode: 'CEO', reason: 'Phê duyệt cấp CEO', slaHours: 96 },
      ];
      if (cost > COST_TIER_MID) steps.push({ roleCode: 'CT', reason: 'Quy mô lớn — cần Chủ tịch', slaHours: 96 });
      return steps;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CreateProposalModal({
  open,
  onClose,
  onSubmit,
  onCreate,
  users = [],
  currentUserRole,
  currentUserName,
  departments = [],
  branches = [],
}: CreateProposalModalProps) {
  // S1 — Thông tin chung
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ProposalKindV3 | ''>('');
  const [priority, setPriority] = useState<ProposalPriorityV3>('thuong');
  const [relatedBlock, setRelatedBlock] = useState<ProposalBlockV3>('KD');
  const [relatedDeptId, setRelatedDeptId] = useState<string>('');
  const [relatedBranchId, setRelatedBranchId] = useState<string>('');

  // S2 — Hiện trạng / Vấn đề
  const [currentSituation, setCurrentSituation] = useState('');
  const [problemStatement, setProblemStatement] = useState('');
  const [evidence, setEvidence] = useState('');

  // S3 — Nội dung đề xuất
  const [proposedSolution, setProposedSolution] = useState('');
  const [scope, setScope] = useState('');
  const [expectedStartDate, setExpectedStartDate] = useState('');
  const [involvedUnits, setInvolvedUnits] = useState('');

  // S4 — Tác động dự kiến
  const [expectedBenefit, setExpectedBenefit] = useState('');
  const [riskIfNot, setRiskIfNot] = useState('');
  const [riskIfDo, setRiskIfDo] = useState('');
  const [estimatedCostStr, setEstimatedCostStr] = useState('');
  const [neededHeadcountStr, setNeededHeadcountStr] = useState('');

  // S5 — Luồng duyệt (custom override). Khi rỗng → dùng suggestion.
  const [approverOverride, setApproverOverride] = useState<ApproverDraftV3[] | null>(null);

  // S6 — Sau duyệt
  const [createCoordAfter, setCreateCoordAfter] = useState(false);
  const [expectedOwnerName, setExpectedOwnerName] = useState('');
  const [expectedCollaborators, setExpectedCollaborators] = useState<CollaboratorDraftV3[]>([]);
  const [expectedDeadline, setExpectedDeadline] = useState('');
  const [expectedDeliverable, setExpectedDeliverable] = useState('');

  // ── Suggestion engine ─────────────────────────────────────────────────────
  const estimatedCostNum = useMemo(() => {
    const trimmed = estimatedCostStr.trim();
    if (!trimmed) return null;
    const n = Number(trimmed.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }, [estimatedCostStr]);

  const suggested: ApproverDraftV3[] = useMemo(() => {
    const steps = suggestApproverChain({
      kind,
      creatorBlock: relatedBlock,
      estimatedCost: estimatedCostNum,
    });
    return steps.map((s, idx) => {
      const u = users.find((x) => x.roleId === s.roleCode);
      return {
        id: `sg-${idx}-${s.roleCode}`,
        uid: u?.id ?? '',
        name: u?.name ?? '',
        roleCode: s.roleCode,
        reason: s.reason,
        slaHours: s.slaHours,
      };
    });
  }, [kind, relatedBlock, estimatedCostNum, users]);

  // Hiển thị chuỗi duyệt: override (nếu user đã chỉnh) HOẶC suggestion.
  const approversShown: ApproverDraftV3[] = approverOverride ?? suggested;

  if (!open) return null;

  // ── Approver helpers ──────────────────────────────────────────────────────
  function ensureOverride(): ApproverDraftV3[] {
    if (approverOverride) return approverOverride;
    const cloned = suggested.map((s) => ({ ...s }));
    setApproverOverride(cloned);
    return cloned;
  }

  function addApproverStep() {
    const base = ensureOverride();
    const next: ApproverDraftV3[] = [
      ...base,
      {
        id: `a-${Date.now()}-${base.length}`,
        uid: '',
        name: '',
        roleCode: '',
        reason: '',
        slaHours: 48,
      },
    ];
    setApproverOverride(next);
  }

  function updateApproverStep(id: string, patch: Partial<ApproverDraftV3>) {
    const base = ensureOverride();
    setApproverOverride(base.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeApproverStep(id: string) {
    const base = ensureOverride();
    setApproverOverride(base.filter((a) => a.id !== id));
  }

  function resetToSuggestion() {
    setApproverOverride(null);
  }

  function selectApproverUser(stepId: string, userId: string) {
    const u = users.find((x) => x.id === userId);
    if (!u) {
      updateApproverStep(stepId, { uid: '', name: '' });
      return;
    }
    updateApproverStep(stepId, {
      uid: u.id,
      name: u.name,
      roleCode: u.roleId,
    });
  }

  // ── Collaborator helpers ──────────────────────────────────────────────────
  function addCollaborator() {
    setExpectedCollaborators((prev) => [
      ...prev,
      { id: `c-${Date.now()}-${prev.length}`, unit: '', support: '' },
    ]);
  }

  function updateCollaborator(id: string, patch: Partial<CollaboratorDraftV3>) {
    setExpectedCollaborators((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCollaborator(id: string) {
    setExpectedCollaborators((prev) => prev.filter((c) => c.id !== id));
  }

  // ── Reset / Close ─────────────────────────────────────────────────────────
  function resetForm() {
    setTitle('');
    setKind('');
    setPriority('thuong');
    setRelatedBlock('KD');
    setRelatedDeptId('');
    setRelatedBranchId('');
    setCurrentSituation('');
    setProblemStatement('');
    setEvidence('');
    setProposedSolution('');
    setScope('');
    setExpectedStartDate('');
    setInvolvedUnits('');
    setExpectedBenefit('');
    setRiskIfNot('');
    setRiskIfDo('');
    setEstimatedCostStr('');
    setNeededHeadcountStr('');
    setApproverOverride(null);
    setCreateCoordAfter(false);
    setExpectedOwnerName('');
    setExpectedCollaborators([]);
    setExpectedDeadline('');
    setExpectedDeliverable('');
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  // ── Validate & build payload ──────────────────────────────────────────────
  function validateForSubmit(): string | null {
    if (!title.trim()) return 'Vui lòng nhập tiêu đề đề xuất.';
    if (!kind) return 'Vui lòng chọn loại đề xuất.';
    if (!relatedBlock) return 'Vui lòng chọn khối liên quan.';
    if (!proposedSolution.trim()) return 'Vui lòng nhập giải pháp đề xuất.';
    if (approversShown.length === 0) return 'Chuỗi duyệt đang rỗng. Vui lòng chọn loại đề xuất hoặc thêm cấp duyệt thủ công.';
    const hasEmpty = approversShown.some((a) => !a.uid && !a.name.trim() && !a.roleCode.trim());
    if (hasEmpty) return 'Có cấp duyệt chưa chọn người hoặc vai trò. Vui lòng kiểm tra lại chuỗi duyệt.';
    if (createCoordAfter) {
      if (!expectedOwnerName.trim()) return 'Vui lòng nhập Owner dự kiến cho điều phối sau duyệt.';
      if (!expectedDeadline) return 'Vui lòng chọn Deadline dự kiến cho điều phối sau duyệt.';
      if (!expectedDeliverable.trim()) return 'Vui lòng nhập Kết quả cần bàn giao.';
    }
    return null;
  }

  function buildPayload(status: 'nhap' | 'da_gui'): CreateProposalPayloadV3 {
    const neededHeadcountNum = neededHeadcountStr.trim()
      ? Number(neededHeadcountStr.replace(/[^\d]/g, ''))
      : null;

    return {
      status,
      // S1
      title: title.trim(),
      kind: kind as ProposalKindV3,
      priority,
      relatedBlock,
      relatedDeptId: relatedDeptId || undefined,
      relatedBranchId: relatedBranchId || undefined,
      // S2
      currentSituation: currentSituation.trim(),
      problemStatement: problemStatement.trim(),
      evidence: evidence.trim() || undefined,
      attachments: [],
      // S3
      proposedSolution: proposedSolution.trim(),
      scope: scope.trim(),
      expectedStartDate: expectedStartDate || undefined,
      involvedUnits: involvedUnits.trim(),
      // S4
      expectedBenefit: expectedBenefit.trim(),
      riskIfNot: riskIfNot.trim(),
      riskIfDo: riskIfDo.trim(),
      estimatedCost: estimatedCostNum,
      neededHeadcount: Number.isFinite(neededHeadcountNum) ? neededHeadcountNum : null,
      // S5
      approverChain: approversShown.map((a) => ({
        ...a,
        name: a.name.trim(),
        roleCode: a.roleCode.trim(),
        reason: a.reason.trim(),
      })),
      // S6
      createCoordAfter,
      expectedOwnerName: createCoordAfter ? expectedOwnerName.trim() : undefined,
      expectedCollaborators: createCoordAfter
        ? expectedCollaborators
            .map((c) => ({ ...c, unit: c.unit.trim(), support: c.support.trim() }))
            .filter((c) => c.unit)
        : undefined,
      expectedDeadline: createCoordAfter ? expectedDeadline : undefined,
      expectedDeliverable: createCoordAfter ? expectedDeliverable.trim() : undefined,
    };
  }

  function emit(payload: CreateProposalPayloadV3) {
    // Phát V3 cho callsite mới.
    onSubmit?.(payload);
    // Backward-compat: bổ sung field V2 cho callsite cũ.
    if (onCreate) {
      const legacy: CreateProposalPayload = {
        ...payload,
        description: payload.proposedSolution || payload.problemStatement,
        deadline: payload.expectedStartDate ?? '',
      };
      onCreate(legacy);
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
    emit(buildPayload('nhap'));
    resetForm();
    onClose();
  }

  function handleSubmit() {
    const err = validateForSubmit();
    if (err) {
      alert(err);
      return;
    }
    emit(buildPayload('da_gui'));
    resetForm();
    onClose();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-8"
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
        <div className="px-5 py-4 space-y-7 max-h-[72vh] overflow-y-auto">
          {/* ──────────────── S1 — Thông tin chung ──────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              1. Thông tin chung
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
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

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Loại đề xuất <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {KIND_OPTIONS.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setKind(key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
                        kind === key
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Mức ưu tiên <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITY_OPTIONS.map(({ key, label, tone }) => (
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

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Khối liên quan <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {BLOCK_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRelatedBlock(key)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                        relatedBlock === key
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
                  Phòng ban liên quan
                </label>
                <select
                  value={relatedDeptId}
                  onChange={(e) => setRelatedDeptId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                >
                  <option value="">— Không chọn —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Cơ sở liên quan
                </label>
                <select
                  value={relatedBranchId}
                  onChange={(e) => setRelatedBranchId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                >
                  <option value="">— Toàn cộng đồng —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* ──────────────── S2 — Hiện trạng / Vấn đề ──────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              2. Hiện trạng / Vấn đề
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Mô tả hiện trạng
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
                  Vấn đề đang gặp
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
                  Bằng chứng / Dữ liệu tham chiếu
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
                  Đính kèm file sẽ có ở phiên bản tiếp theo. Tạm thời dán link tài liệu vào ô &quot;Bằng chứng&quot;.
                </p>
              </div>
            </div>
          </section>

          {/* ──────────────── S3 — Nội dung đề xuất ──────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              3. Nội dung đề xuất
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Giải pháp đề xuất <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={proposedSolution}
                  onChange={(e) => setProposedSolution(e.target.value)}
                  rows={3}
                  placeholder="Phương án cụ thể, các bước thực hiện..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Phạm vi áp dụng
                  </label>
                  <input
                    type="text"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    placeholder="VD: Toàn hệ thống / Cơ sở 24 NCT"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Thời gian mong muốn triển khai
                  </label>
                  <input
                    type="date"
                    value={expectedStartDate}
                    onChange={(e) => setExpectedStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Người / đơn vị liên quan
                </label>
                <textarea
                  value={involvedUnits}
                  onChange={(e) => setInvolvedUnits(e.target.value)}
                  rows={2}
                  placeholder="Ai cần tham gia, ai cần hỗ trợ..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
            </div>
          </section>

          {/* ──────────────── S4 — Tác động dự kiến ──────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              4. Tác động dự kiến
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Lợi ích kỳ vọng
                </label>
                <textarea
                  value={expectedBenefit}
                  onChange={(e) => setExpectedBenefit(e.target.value)}
                  rows={2}
                  placeholder="Tăng doanh thu, giảm chi phí, nâng cao chất lượng dịch vụ..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Rủi ro nếu KHÔNG làm
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
                    Rủi ro nếu THỰC HIỆN
                  </label>
                  <textarea
                    value={riskIfDo}
                    onChange={(e) => setRiskIfDo(e.target.value)}
                    rows={2}
                    placeholder="Vấn đề có thể phát sinh, biện pháp giảm thiểu..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Chi phí dự kiến (VNĐ)
                    <span className="ml-1 text-[10px] text-slate-400">(ảnh hưởng chuỗi duyệt)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={estimatedCostStr}
                    onChange={(e) => {
                      setEstimatedCostStr(e.target.value);
                      // Khi đổi chi phí → reset override để re-suggest.
                      setApproverOverride(null);
                    }}
                    placeholder="VD: 12000000"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Nhân sự cần tham gia
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={neededHeadcountStr}
                    onChange={(e) => setNeededHeadcountStr(e.target.value)}
                    placeholder="VD: 3 nhân sự"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ──────────────── S5 — Luồng duyệt ──────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
                <Workflow size={13} className="text-emerald-600" />
                5. Luồng duyệt
              </h3>
              <div className="flex items-center gap-1.5">
                {approverOverride && (
                  <button
                    type="button"
                    onClick={resetToSuggestion}
                    className="px-2.5 py-1.5 text-[11px] font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg border border-violet-200"
                  >
                    Dùng lại gợi ý
                  </button>
                )}
                <button
                  type="button"
                  onClick={addApproverStep}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200"
                >
                  <Plus size={14} /> Thêm cấp duyệt
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              Hệ thống đã gợi ý chuỗi duyệt theo loại + khối + chi phí. Bạn có thể chỉnh thêm/bớt nếu cần.
            </p>

            {approversShown.length === 0 ? (
              <div className="text-xs text-slate-500 italic px-3 py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                Chọn loại đề xuất ở Section 1 để hệ thống gợi ý chuỗi duyệt, hoặc bấm &quot;+ Thêm cấp duyệt&quot;.
              </div>
            ) : (
              <ol className="space-y-2">
                {approversShown.map((a, idx) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5"
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Vai trò
                        </label>
                        <input
                          type="text"
                          value={ROLE_LABEL[a.roleCode] ?? a.roleCode}
                          onChange={(e) => updateApproverStep(a.id, { roleCode: e.target.value })}
                          placeholder="VD: TP Đào tạo"
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                          readOnly={!!a.uid}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Người duyệt
                        </label>
                        {users.length > 0 ? (
                          <select
                            value={a.uid}
                            onChange={(e) => selectApproverUser(a.id, e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                          >
                            <option value="">
                              {a.roleCode ? `-- Chọn người (gợi ý: ${ROLE_LABEL[a.roleCode] ?? a.roleCode}) --` : '-- Chọn người --'}
                            </option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} · {ROLE_LABEL[u.roleId] ?? u.roleId}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={a.name}
                            onChange={(e) => updateApproverStep(a.id, { name: e.target.value })}
                            placeholder="Nhập tên người duyệt"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Lý do · SLA
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={a.reason}
                            onChange={(e) => updateApproverStep(a.id, { reason: e.target.value })}
                            placeholder="Lý do bước duyệt"
                            className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                          />
                          <input
                            type="number"
                            min={1}
                            value={a.slaHours}
                            onChange={(e) =>
                              updateApproverStep(a.id, { slaHours: Number(e.target.value) || 48 })
                            }
                            className="w-14 px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums"
                            title="SLA (giờ)"
                          />
                          <span className="text-[10px] text-slate-400">h</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeApproverStep(a.id)}
                      className="flex-shrink-0 p-1.5 rounded text-rose-600 hover:bg-rose-50 mt-4"
                      aria-label="Xoá"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ──────────────── S6 — Sau duyệt ──────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold flex items-center gap-1.5">
              <CheckSquare size={13} className="text-emerald-600" />
              6. Sau duyệt
            </h3>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={createCoordAfter}
                onChange={(e) => setCreateCoordAfter(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-700">
                Cần tạo điều phối sau khi được duyệt
              </span>
            </label>
            <p className="text-[11px] text-slate-500 ml-6 mt-0.5">
              Nếu chọn, sau khi đề xuất được phê duyệt, có thể tạo nhanh điều phối từ thông tin bên dưới.
            </p>

            {createCoordAfter && (
              <div className="mt-3 ml-6 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Owner dự kiến <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={expectedOwnerName}
                      onChange={(e) => setExpectedOwnerName(e.target.value)}
                      placeholder="Tên người chịu trách nhiệm chính"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Deadline dự kiến <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={expectedDeadline}
                      onChange={(e) => setExpectedDeadline(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-600">
                      Đơn vị phối hợp dự kiến
                    </label>
                    <button
                      type="button"
                      onClick={addCollaborator}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-700 bg-white hover:bg-emerald-100 rounded border border-emerald-200"
                    >
                      <Plus size={12} /> Thêm
                    </button>
                  </div>
                  {expectedCollaborators.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic px-2 py-2 bg-white rounded border border-dashed border-slate-200 text-center">
                      Chưa có đơn vị phối hợp.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {expectedCollaborators.map((c) => (
                        <li key={c.id} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={c.unit}
                            onChange={(e) => updateCollaborator(c.id, { unit: e.target.value })}
                            placeholder="Đơn vị / Người"
                            className="w-1/3 px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                          />
                          <input
                            type="text"
                            value={c.support}
                            onChange={(e) => updateCollaborator(c.id, { support: e.target.value })}
                            placeholder="Nội dung hỗ trợ ngắn"
                            className="flex-1 px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeCollaborator(c.id)}
                            className="p-1.5 rounded text-rose-600 hover:bg-rose-50"
                            aria-label="Xoá"
                          >
                            <Trash2 size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Kết quả cần bàn giao <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={expectedDeliverable}
                    onChange={(e) => setExpectedDeliverable(e.target.value)}
                    rows={2}
                    placeholder="Sản phẩm cuối cùng, tiêu chí nghiệm thu..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer — 2 action */}
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
            Gửi duyệt
          </button>
          {/* placeholder để TS không phàn nàn FileText unused */}
          <FileText className="hidden" size={0} />
        </div>
      </div>
    </div>
  );
}
