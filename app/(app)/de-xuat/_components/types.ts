// Đề xuất V5 — types theo SPEC anh chốt 2026-06-12
// Workflow 8 trạng thái: Nháp → Đã gửi → Đang xem xét → Yêu cầu bổ sung
//   → Đã phê duyệt / Từ chối → Chuyển điều phối → Đóng hồ sơ
// 5 ProposalKind mới: van_hanh · cai_tien · dau_tu · chien_luoc · khan_cap
// 3 Priority: binh_thuong · quan_trong · khan_cap
// 6 ProposalSource: phat_sinh · kpi · hop · ceo_giao · khach_hang_phan_anh · khac
// Phạm vi ảnh hưởng MULTI-SELECT (dept/facility/role/block) → AUTO suy luận liên khối
// Hiệu quả kỳ vọng = textarea expectedResult (KHÔNG dùng KPI multi-row)
// Sau duyệt = 2 option: chi_phe_duyet | de_nghi_tao_dieu_phoi
// Giữ alias `Proposal = ProposalV5` để code khác trong /de-xuat import được.

// ============ 8 ProposalStatus V5 (bỏ dong_y_nguyen_tac từ V3) ============
export type ProposalStatus =
  | 'nhap'
  | 'da_gui'
  | 'dang_xem_xet'
  | 'yeu_cau_bo_sung'
  | 'da_phe_duyet'
  | 'tu_choi'
  | 'chuyen_dieu_phoi'
  | 'dong_ho_so';

// ============ 5 ProposalKind V5 (đổi từ V3) ============
// V3 cũ: van_hanh / nhan_su / mkt_kd / tai_chinh / chien_luoc
// V5 mới: van_hanh / cai_tien / dau_tu / chien_luoc / khan_cap
export type ProposalKind =
  | 'van_hanh'
  | 'cai_tien'
  | 'dau_tu'
  | 'chien_luoc'
  | 'khan_cap';

// ============ 3 Priority V5 (V3 4 cấp low/normal/high/urgent → V5 3 cấp) ============
export type Priority = 'binh_thuong' | 'quan_trong' | 'khan_cap';

// ============ 6 ProposalSource V5 ============
export type ProposalSource =
  | 'phat_sinh'
  | 'kpi'
  | 'hop'
  | 'ceo_giao'
  | 'khach_hang_phan_anh'
  | 'khac';

// ============ Scope target — multi-select phạm vi ảnh hưởng ============
export type ScopeTargetType = 'dept' | 'facility' | 'role' | 'block';

export interface ScopeTarget {
  type: ScopeTargetType;
  // id chuẩn: 'MKT' | 'HM' | 'TP_DT' | 'KD' | 'VP' …
  id: string;
  // label hiển thị: 'TP Marketing' | 'GP HM' | …
  label: string;
}

// ============ After approval — 2 option accordion sau khi duyệt ============
export type AfterApproval = 'chi_phe_duyet' | 'de_nghi_tao_dieu_phoi';

// ============ Attachment ============
export interface ProposalAttachment {
  name: string;
  url?: string;
  size?: number;
}

// ============ Approver chain step ============
export interface ApproverStep {
  uid?: string;
  roleCode?: string;
  name: string;
  decidedAt?: string;
  decision?: 'approved' | 'rejected' | 'requested_revision';
  notes?: string;
}

// ============ ProposalV5 — 5 block ============
export interface ProposalV5 {
  // ----- Standard -----
  id: string;
  code: string;
  status: ProposalStatus;
  creatorUid: string;
  creatorName: string;
  creatorRole: string;
  creatorBlock: 'KD' | 'VP';
  createdAt: string;
  updatedAt?: string;

  // ----- Block 1: Thông tin chung -----
  title: string;
  kind: ProposalKind;
  priority: Priority;
  source: ProposalSource;
  estimatedCost?: number;

  // ----- Block 2: Hiện trạng / Vấn đề -----
  currentSituation?: string;
  problemStatement?: string;
  evidence?: string;
  attachments: ProposalAttachment[];

  // ----- Block 3: Giải pháp đề xuất -----
  proposedSolution?: string;
  // Phạm vi ảnh hưởng (multi-select; có thể trống nếu nội bộ)
  scopeTargets: ScopeTarget[];
  decisionRequested?: string;

  // ----- Block 4: Hiệu quả & rủi ro -----
  expectedBenefit?: string;
  riskIfNot?: string;
  // textarea "Kết quả kỳ vọng" — KHÔNG dùng KPI multi-row
  expectedResult?: string;

  // ----- Block 5: Sau duyệt (accordion 2 option) -----
  afterApproval?: AfterApproval;
  suggestedOwnerUid?: string;
  suggestedOwnerName?: string;
  suggestedDeadline?: string;
  deploymentNote?: string;

  // ----- AUTO computed từ scopeTargets (server hoặc client adapter) -----
  relatedBlocks: Array<'KD' | 'VP'>;
  relatedDepts: string[];
  relatedFacilities: string[];
  isCrossBlock: boolean;

  // ----- Approver -----
  approverChain: ApproverStep[];
  approverIdx: number;

  // ----- Linked coordination task -----
  linkedCoordTaskId?: string;
  linkedCoordTaskCode?: string;
}

// ============ Labels CÓ DẤU ============

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  nhap: 'Nháp',
  da_gui: 'Đã gửi',
  dang_xem_xet: 'Đang xem xét',
  yeu_cau_bo_sung: 'Yêu cầu bổ sung',
  da_phe_duyet: 'Đã phê duyệt',
  tu_choi: 'Từ chối',
  chuyen_dieu_phoi: 'Đã chuyển điều phối',
  dong_ho_so: 'Đóng hồ sơ',
};

// Màu theo SPEC:
//   - cam (amber/orange): chờ duyệt / yêu cầu bổ sung
//   - xanh dương (sky): đang xử lý
//   - emerald: đã phê duyệt
//   - tím (violet): chuyển điều phối / chiến lược
//   - rose: từ chối / quá SLA
//   - slate: nháp / đóng hồ sơ
export const PROPOSAL_STATUS_COLOR: Record<ProposalStatus, string> = {
  nhap: 'bg-slate-100 text-slate-700',
  da_gui: 'bg-amber-100 text-amber-700',
  dang_xem_xet: 'bg-sky-100 text-sky-700',
  yeu_cau_bo_sung: 'bg-orange-100 text-orange-700',
  da_phe_duyet: 'bg-emerald-100 text-emerald-800',
  tu_choi: 'bg-rose-100 text-rose-700',
  chuyen_dieu_phoi: 'bg-violet-100 text-violet-800',
  dong_ho_so: 'bg-slate-200 text-slate-600',
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

export const PRIORITY_LABEL: Record<Priority, string> = {
  binh_thuong: 'Bình thường',
  quan_trong: 'Quan trọng',
  khan_cap: 'Khẩn cấp',
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  binh_thuong: 'bg-slate-100 text-slate-700',
  quan_trong: 'bg-amber-100 text-amber-700',
  khan_cap: 'bg-rose-100 text-rose-700',
};

export const SOURCE_LABEL: Record<ProposalSource, string> = {
  phat_sinh: 'Phát sinh',
  kpi: 'KPI',
  hop: 'Họp',
  ceo_giao: 'CEO giao',
  khach_hang_phan_anh: 'Khách hàng phản ánh',
  khac: 'Khác',
};

export const AFTER_APPROVAL_LABEL: Record<AfterApproval, string> = {
  chi_phe_duyet: 'Chỉ phê duyệt',
  de_nghi_tao_dieu_phoi: 'Đề nghị tạo điều phối',
};

// SLA theo cấp duyệt (giờ)
export const SLA_HOURS = {
  tp: 48,
  gd: 72,
  ceo: 96,
  bo_sung: 48,
  khan: 24,
};

// ============ Backward compat alias ============
// Các file CreateProposalModal/Drawer/Table/Dashboard/Client trong /de-xuat
// đã import `Proposal` / `ProposalV3` — giữ alias để build không vỡ
// trong khi các file còn lại đang được migrate sang V5.
export type Proposal = ProposalV5;
export type ProposalV3 = ProposalV5;
