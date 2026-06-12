// Đề xuất V6 — types theo SPEC chốt 2026-06-12
// ──────────────────────────────────────────────────────────────────────────
// MINIMAL: form CreateProposalModal V6 chỉ còn 5 trường nhập
//   title / kind / reason / estimatedCost? (khi kind='dau_tu') / attachments?
// BỎ khỏi UI form: priority / source / scopeTargets / currentSituation /
// problemStatement / evidence / proposedSolution / decisionRequested /
// expectedBenefit / riskIfNot / expectedResult / afterApproval /
// suggestedOwner* / deploymentNote / relatedBlocks / relatedDepts /
// relatedFacilities / isCrossBlock.
//
// LƯU Ý BACKWARD COMPAT: các sibling V5 (DexuatTable / DexuatDashboard /
// ProposalDetailDrawer / CreateProposalModal / DeXuatClient) chưa migrate
// sang V6. Để KHÔNG vỡ build:
//   - giữ alias type: Priority / ProposalSource / ScopeTarget /
//     ScopeTargetType / AfterApproval / ProposalAttachment / ApproverStep
//   - giữ field V5 trên ProposalV6 với CÙNG cardinality cũ (required /
//     optional) để adapter Task→ProposalV5 trong DeXuatClient compile được
//   - giữ alias ProposalV5 / ProposalV3 / Proposal = ProposalV6
//   - giữ storage status `'chuyen_dieu_phoi'` (label V6 hiển thị
//     "Đã tạo điều phối"). Constant STATUS_DA_TAO_DIEU_PHOI cho code mới.
//
// Quy ước: Tiếng Việt CÓ DẤU. Default tone đồng bộ /dieu-phoi.

// ────────────────────────────────────────────────────────────────────────────
// V6 STATUS — 7 trạng thái chính + 'tu_choi' = 8 literal
// ────────────────────────────────────────────────────────────────────────────
// SPEC V6: Nháp · Đã gửi · Đang xem xét · Yêu cầu bổ sung · Đã phê duyệt ·
//          Đã tạo điều phối · Đóng hồ sơ (+ Từ chối).
// Storage value vẫn 'chuyen_dieu_phoi' để tương thích data cũ + sibling V5.
// UI label đã đổi sang "Đã tạo điều phối" theo SPEC V6 (xem PROPOSAL_STATUS_LABEL).
export type ProposalStatus =
  | 'nhap'
  | 'da_gui'
  | 'dang_xem_xet'
  | 'yeu_cau_bo_sung'
  | 'da_phe_duyet'
  | 'tu_choi'
  | 'chuyen_dieu_phoi' // SPEC V6 label: "Đã tạo điều phối"
  | 'dong_ho_so';

/** SPEC V6: tên trạng thái "Đã tạo điều phối" cho code V6 mới reference.
 *  Runtime value vẫn = 'chuyen_dieu_phoi' để tương thích storage + sibling V5. */
export const STATUS_DA_TAO_DIEU_PHOI: ProposalStatus = 'chuyen_dieu_phoi';

// ────────────────────────────────────────────────────────────────────────────
// V6 KIND — 5 loại mặc định, Admin có thể thêm/sửa/xoá qua Cài đặt
// ────────────────────────────────────────────────────────────────────────────
export type ProposalKind =
  | 'van_hanh'
  | 'cai_tien'
  | 'dau_tu'
  | 'chien_luoc'
  | 'khan_cap';

// ────────────────────────────────────────────────────────────────────────────
// Legacy V5 type aliases — giữ để sibling V5 chưa migrate vẫn import được
// ────────────────────────────────────────────────────────────────────────────
/** @deprecated V6 form không còn dùng priority */
export type Priority = 'binh_thuong' | 'quan_trong' | 'khan_cap';

/** @deprecated V6 form không còn dùng source */
export type ProposalSource =
  | 'phat_sinh'
  | 'kpi'
  | 'hop'
  | 'ceo_giao'
  | 'khach_hang_phan_anh'
  | 'khac';

/** @deprecated V6 form không còn multi-select scope */
export type ScopeTargetType = 'dept' | 'facility' | 'role' | 'block';

/** @deprecated V6 form không còn multi-select scope */
export interface ScopeTarget {
  type: ScopeTargetType;
  id: string;
  label: string;
}

/** @deprecated V6 thay bằng nút "Duyệt & Tạo điều phối" trong drawer */
export type AfterApproval = 'chi_phe_duyet' | 'de_nghi_tao_dieu_phoi';

// ────────────────────────────────────────────────────────────────────────────
// Attachment + Approver chain
// ────────────────────────────────────────────────────────────────────────────
export interface ProposalAttachment {
  name: string;
  url?: string;
  size?: number;
}

export interface ApproverStep {
  uid?: string;
  roleCode?: string;
  name: string;
  reason?: string; // V6: lý do hệ thống gán bước này (rule match)
  decidedAt?: string;
  decision?: 'approved' | 'rejected' | 'requested_revision';
  notes?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// V6 Workflow Engine — Cài đặt → Workflow Đề xuất
// ────────────────────────────────────────────────────────────────────────────
// 4 tầng tài chính theo SPEC V6
//   nho 0-50M · tb 50-200M · lon 200-500M · dac_biet >500M
export type BudgetTier = 'nho' | 'tb' | 'lon' | 'dac_biet';

// 3 luồng duyệt mặc định
//   A: GĐ khối
//   B: GĐ khối → CEO
//   C: GĐ khối → CEO → Chủ tịch
export type ChainTemplateKey = 'A' | 'B' | 'C';

// Rule IF...THEN tối giản (V6)
export interface WorkflowRule {
  id: string;
  // điều kiện
  ifKind?: ProposalKind[];
  ifBudgetTier?: BudgetTier[];
  ifCreatorBlock?: ('KD' | 'VP')[];
  // hành động
  thenChain: ChainTemplateKey;
  thenNote?: string;
  priority: number; // rule có priority cao hơn match trước
  enabled: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
// V6+ Đơn vị liên quan (multi-select) — auto detect Trong khối / Liên khối
// ────────────────────────────────────────────────────────────────────────────

/** Đơn vị liên quan trong đề xuất — multi-select trong form. */
export interface RelatedUnit {
  id: string;          // 'TP_MKT' | 'QLCS_HM' | 'GD_KD' | ...
  label: string;       // 'TP Marketing' | 'QLCS Hoàng Mai' | ...
  block: 'KD' | 'VP';  // khối của đơn vị
}

export type UnitsScope = 'trong_khoi' | 'lien_khoi';

/** Danh sách đơn vị có thể chọn (lookup table). */
export const AVAILABLE_RELATED_UNITS: RelatedUnit[] = [
  // Khối Kinh doanh
  { id: 'GD_KD',     label: 'GĐ Kinh doanh',  block: 'KD' },
  { id: 'TP_MKT',    label: 'TP Marketing',   block: 'KD' },
  { id: 'TP_DT',     label: 'TP Đào tạo',     block: 'KD' },
  { id: 'TP_KT',     label: 'TP Kỹ thuật',    block: 'KD' },
  // V6.3: 5 cơ sở chuẩn — anh chốt 2026-06-12
  { id: 'QLCS_HM',    label: 'QLCS Hoàng Mai',              block: 'KD' },
  { id: 'QLCS_24NCT', label: 'QLCS 24 Nguyễn Cơ Thạch',     block: 'KD' },
  { id: 'QLCS_TK',    label: 'QLCS 20 Thuỵ Khuê',           block: 'KD' },
  { id: 'QLCS_TT',    label: 'QLCS Thanh Trì',              block: 'KD' },
  { id: 'QLCS_CTT',   label: 'QLCS Cung Thể Thao Mỹ Đình',  block: 'KD' },
  // Khối Văn phòng
  { id: 'GD_VP',     label: 'GĐ Văn phòng',   block: 'VP' },
  { id: 'TP_NS',     label: 'TP Nhân sự',     block: 'VP' },
  { id: 'TP_KE',     label: 'TP Kế toán',     block: 'VP' },
  { id: 'TP_GS',     label: 'TP Giám sát',    block: 'VP' },
];

/** Lookup khối từ roleCode (cho creatorBlock auto). */
export const ROLE_TO_BLOCK: Record<string, 'KD' | 'VP'> = {
  GD_KD: 'KD', TP_MKT: 'KD', TP_DT: 'KD', TP_KT: 'KD',
  QLCS_HM: 'KD', QLCS_TK: 'KD', QLCS_CTT: 'KD', QLCS_24NCT: 'KD', QLCS_TT: 'KD',
  GD_VP: 'VP', TP_NS: 'VP', TP_KE: 'VP', TP_GS: 'VP',
};

/**
 * Auto detect Trong khối / Liên khối.
 * - 'lien_khoi' nếu có ≥1 đơn vị KD VÀ ≥1 đơn vị VP (kể cả creator).
 * - 'trong_khoi' nếu tất cả (creator + units) thuộc CÙNG 1 khối.
 */
export function detectUnitsScope(
  creatorBlock: 'KD' | 'VP',
  relatedUnits: RelatedUnit[],
): UnitsScope {
  const blocks = new Set<'KD' | 'VP'>([creatorBlock]);
  for (const u of relatedUnits) blocks.add(u.block);
  return blocks.size > 1 ? 'lien_khoi' : 'trong_khoi';
}

export const UNITS_SCOPE_LABEL: Record<UnitsScope, string> = {
  trong_khoi: 'Trong khối',
  lien_khoi: 'Liên khối',
};
export const UNITS_SCOPE_COLOR: Record<UnitsScope, string> = {
  trong_khoi: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  lien_khoi: 'bg-violet-50 text-violet-700 ring-violet-200',
};

// ────────────────────────────────────────────────────────────────────────────
// V6 ProposalV6 — 5 trường nhập V6 + standard meta + legacy V5 (giữ shape)
// ────────────────────────────────────────────────────────────────────────────
// Cardinality của các field LEGACY V5 giữ NGUYÊN như V5 cũ (required /
// optional) để adapter Task→ProposalV5 trong DeXuatClient compile được mà
// không phải sửa sibling. Form V6 đơn giản chỉ KHÔNG nhập các field này nữa.
export interface ProposalV6 {
  // ───── Standard meta ─────
  id: string;
  code: string; // DX-YYYY-XXXX
  status: ProposalStatus;
  creatorUid: string;
  creatorName: string;
  creatorRole: string;
  creatorBlock: 'KD' | 'VP';
  createdAt: string;
  updatedAt?: string;

  // ───── 5 trường nhập V6 ─────
  title: string;            // BẮT BUỘC
  kind: ProposalKind;       // BẮT BUỘC
  /** V6: textarea "Lý do" — gộp hiện trạng + vấn đề + giải pháp.
   *  Optional ở type level để adapter Task→V5 legacy không phải set. */
  reason?: string;
  estimatedCost?: number;   // CHỈ hiện khi kind='dau_tu'
  attachments: ProposalAttachment[];
  /** V6+: Đơn vị liên quan (multi-select). Auto detect Trong/Liên khối. */
  relatedUnits?: RelatedUnit[];
  /** V6+ auto computed (KHÔNG cho user chọn). */
  unitsScope?: UnitsScope;

  // ───── Approver (auto từ Workflow Engine V6) ─────
  approverChain: ApproverStep[];
  approverIdx: number;

  // ───── Liên kết điều phối (sau khi convert) ─────
  linkedCoordTaskId?: string;
  linkedCoordTaskCode?: string;

  // ═══════════════════════════════════════════════════════════════════════
  // LEGACY V5 FIELDS — giữ cardinality như V5 cũ cho sibling chưa migrate.
  // V6 form CreateProposalModal sẽ KHÔNG ghi các field này nữa.
  // ═══════════════════════════════════════════════════════════════════════
  /** @deprecated V5 only */
  priority: Priority;
  /** @deprecated V5 only */
  source: ProposalSource;
  /** @deprecated V5 — gộp vào `reason` */
  currentSituation?: string;
  /** @deprecated V5 — gộp vào `reason` */
  problemStatement?: string;
  /** @deprecated V5 — file đính kèm thay textarea */
  evidence?: string;
  /** @deprecated V5 — gộp vào `reason` */
  proposedSolution?: string;
  /** @deprecated V5 — bỏ multi-select scope */
  scopeTargets: ScopeTarget[];
  /** @deprecated V5 only */
  decisionRequested?: string;
  /** @deprecated V5 only */
  expectedBenefit?: string;
  /** @deprecated V5 only */
  riskIfNot?: string;
  /** @deprecated V5 only */
  expectedResult?: string;
  /** @deprecated V5 — thay bằng nút "Duyệt & Tạo điều phối" */
  afterApproval?: AfterApproval;
  /** @deprecated V5 — xác định tại Điều phối */
  suggestedOwnerUid?: string;
  /** @deprecated V5 — xác định tại Điều phối */
  suggestedOwnerName?: string;
  /** @deprecated V5 — xác định tại Điều phối */
  suggestedDeadline?: string;
  /** @deprecated V5 — xác định tại Điều phối */
  deploymentNote?: string;
  /** @deprecated V5 — suy luận thay vì lưu */
  relatedBlocks: Array<'KD' | 'VP'>;
  /** @deprecated V5 — suy luận thay vì lưu */
  relatedDepts: string[];
  /** @deprecated V5 — suy luận thay vì lưu */
  relatedFacilities: string[];
  /** @deprecated V5 — suy luận thay vì lưu */
  isCrossBlock: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Backward compat alias — ProposalV5 / ProposalV3 / Proposal = ProposalV6
// ────────────────────────────────────────────────────────────────────────────
export type ProposalV5 = ProposalV6;
export type ProposalV3 = ProposalV6;
export type Proposal = ProposalV6;

// ────────────────────────────────────────────────────────────────────────────
// Labels CÓ DẤU + COLOR — đồng bộ /dieu-phoi
// ────────────────────────────────────────────────────────────────────────────
// SPEC V6: label "Đã tạo điều phối" (storage value vẫn 'chuyen_dieu_phoi').
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  nhap: 'Nháp',
  da_gui: 'Đã gửi',
  dang_xem_xet: 'Đang xem xét',
  yeu_cau_bo_sung: 'Yêu cầu bổ sung',
  da_phe_duyet: 'Đã phê duyệt',
  tu_choi: 'Từ chối',
  chuyen_dieu_phoi: 'Đã tạo điều phối',
  dong_ho_so: 'Đóng hồ sơ',
};

// Tone V6 đồng bộ /dieu-phoi:
//   slate: nháp / đóng hồ sơ
//   amber: đã gửi
//   sky: đang xem xét
//   orange: yêu cầu bổ sung
//   emerald: đã phê duyệt
//   violet: đã tạo điều phối / chiến lược
//   rose: từ chối / quá SLA
export const PROPOSAL_STATUS_COLOR: Record<ProposalStatus, string> = {
  nhap: 'bg-slate-100 text-slate-700 ring-slate-200',
  da_gui: 'bg-amber-50 text-amber-700 ring-amber-200',
  dang_xem_xet: 'bg-sky-50 text-sky-700 ring-sky-200',
  yeu_cau_bo_sung: 'bg-orange-50 text-orange-700 ring-orange-200',
  da_phe_duyet: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  tu_choi: 'bg-rose-50 text-rose-700 ring-rose-200',
  chuyen_dieu_phoi: 'bg-violet-50 text-violet-700 ring-violet-200',
  dong_ho_so: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = {
  van_hanh: 'Vận hành',
  cai_tien: 'Cải tiến',
  dau_tu: 'Đầu tư',
  chien_luoc: 'Chiến lược',
  khan_cap: 'Khẩn cấp',
};

export const PROPOSAL_KIND_COLOR: Record<ProposalKind, string> = {
  van_hanh: 'bg-sky-50 text-sky-700 ring-sky-200',
  cai_tien: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  dau_tu: 'bg-amber-50 text-amber-700 ring-amber-200',
  chien_luoc: 'bg-violet-50 text-violet-700 ring-violet-200',
  khan_cap: 'bg-rose-50 text-rose-700 ring-rose-200',
};

// ────────────────────────────────────────────────────────────────────────────
// Legacy V5 label maps — giữ cho sibling V5 chưa migrate
// ────────────────────────────────────────────────────────────────────────────
/** @deprecated V5 only */
export const PRIORITY_LABEL: Record<Priority, string> = {
  binh_thuong: 'Bình thường',
  quan_trong: 'Quan trọng',
  khan_cap: 'Khẩn cấp',
};

/** @deprecated V5 only */
export const PRIORITY_COLOR: Record<Priority, string> = {
  binh_thuong: 'bg-slate-100 text-slate-700 ring-slate-200',
  quan_trong: 'bg-amber-50 text-amber-700 ring-amber-200',
  khan_cap: 'bg-rose-50 text-rose-700 ring-rose-200',
};

/** @deprecated V5 only */
export const SOURCE_LABEL: Record<ProposalSource, string> = {
  phat_sinh: 'Phát sinh',
  kpi: 'KPI',
  hop: 'Họp',
  ceo_giao: 'CEO giao',
  khach_hang_phan_anh: 'Khách hàng phản ánh',
  khac: 'Khác',
};

/** @deprecated V5 only */
export const AFTER_APPROVAL_LABEL: Record<AfterApproval, string> = {
  chi_phe_duyet: 'Chỉ phê duyệt',
  de_nghi_tao_dieu_phoi: 'Đề nghị tạo điều phối',
};

// ────────────────────────────────────────────────────────────────────────────
// SLA per role (giờ) — đồng bộ /dieu-phoi
// V6 thêm chu_tich (cấp Chủ tịch) + ycbs. Giữ legacy bo_sung (= ycbs).
// ────────────────────────────────────────────────────────────────────────────
export const SLA_HOURS = {
  tp: 48,
  gd: 72,
  ceo: 96,
  chu_tich: 120,
  ycbs: 48,
  khan: 24,
  // legacy V5 alias (= ycbs)
  bo_sung: 48,
};
