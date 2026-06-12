// Đề xuất V3 — types theo SPEC anh chốt 2026-05-31
// Workflow 9 trạng thái: Nháp → Đã gửi → Đang xem xét → Yêu cầu bổ sung
//   → Đồng ý nguyên tắc → Đã phê duyệt → Từ chối → Chuyển điều phối → Đóng hồ sơ
// 5 ProposalKind: van_hanh · nhan_su · mkt_kd · tai_chinh · chien_luoc
// Giữ backward-compat: `Proposal` là alias của `ProposalV3`.

// 9 ProposalStatus — THÊM dong_y_nguyen_tac + dong_ho_so
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

// 5 ProposalKind — ĐỔI co_so → mkt_kd, khac → chien_luoc
export type ProposalKind =
  | 'van_hanh'
  | 'nhan_su'
  | 'mkt_kd'
  | 'tai_chinh'
  | 'chien_luoc';

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface ProposalAttachment {
  name: string;
  url?: string;
  size?: number;
}

export interface ApproverStep {
  uid?: string;
  roleCode?: string;
  name: string;
  decidedAt?: string;
  decision?: 'approved' | 'rejected' | 'requested_revision' | 'agreed_in_principle';
  notes?: string;
}

export interface ExpectedCollaboratorDraft {
  unitId: string;       // 'dept:KE' | 'facility:HM' | 'role:TP_MKT'
  unitName: string;
  supportContent: string;
}

export interface ProposalV3 {
  id: string;
  code: string;

  // S1 — Thông tin chung
  title: string;
  description?: string;
  kind: ProposalKind;
  priority: Priority;
  relatedBlock: 'KD' | 'VP' | 'cross';
  relatedDeptId?: string;
  relatedBranchId?: string;
  creatorUid: string;
  creatorName: string;
  creatorRole: string;
  createdAt: string;

  // S2 — Hiện trạng / Vấn đề
  currentSituation?: string;
  problemStatement?: string;
  evidence?: string;
  attachments: ProposalAttachment[];

  // S3 — Nội dung đề xuất
  proposedSolution?: string;
  scope?: string;
  expectedStartDate?: string;
  involvedUnits?: string[];

  // S4 — Tác động dự kiến
  expectedBenefit?: string;
  riskIfNot?: string;
  riskIfDo?: string;
  estimatedCost?: number;
  neededHeadcount?: string;

  // S5 — Chuỗi duyệt
  approverChain: ApproverStep[];
  approverIdx: number;

  // S6 — Sau duyệt
  createCoordAfter: boolean;
  expectedOwnerUid?: string;
  expectedOwnerName?: string;
  expectedCollaborators?: ExpectedCollaboratorDraft[];
  expectedDeadline?: string;
  expectedDeliverable?: string;

  // Standard
  status: ProposalStatus;
  linkedCoordTaskId?: string;
  linkedCoordTaskCode?: string;
  updatedAt?: string;
}

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  nhap: 'Nháp',
  da_gui: 'Đã gửi',
  dang_xem_xet: 'Đang xem xét',
  yeu_cau_bo_sung: 'Yêu cầu bổ sung',
  dong_y_nguyen_tac: 'Đồng ý nguyên tắc',
  da_phe_duyet: 'Đã phê duyệt',
  tu_choi: 'Từ chối',
  chuyen_dieu_phoi: 'Đã chuyển điều phối',
  dong_ho_so: 'Đóng hồ sơ',
};

// Màu theo SPEC anh chốt:
//   - cam (amber): đang chờ duyệt
//   - xanh dương (sky): đang xem xét
//   - đỏ (rose): quá SLA / từ chối
//   - xanh lá (emerald): đã duyệt / đồng ý nguyên tắc
//   - tím (violet): chuyển điều phối
//   - xám (slate): nháp / đóng hồ sơ
export const PROPOSAL_STATUS_COLOR: Record<ProposalStatus, string> = {
  nhap: 'bg-slate-100 text-slate-700',
  da_gui: 'bg-amber-100 text-amber-700',
  dang_xem_xet: 'bg-sky-100 text-sky-700',
  yeu_cau_bo_sung: 'bg-orange-100 text-orange-700',
  dong_y_nguyen_tac: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  da_phe_duyet: 'bg-emerald-100 text-emerald-800',
  tu_choi: 'bg-rose-100 text-rose-700',
  chuyen_dieu_phoi: 'bg-violet-100 text-violet-800',
  dong_ho_so: 'bg-slate-200 text-slate-600',
};

export const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = {
  van_hanh: 'Vận hành',
  nhan_su: 'Nhân sự',
  mkt_kd: 'Marketing/Kinh doanh',
  tai_chinh: 'Tài chính/Mua sắm',
  chien_luoc: 'Chiến lược',
};

export const PROPOSAL_KIND_COLOR: Record<ProposalKind, string> = {
  van_hanh: 'bg-sky-50 text-sky-700 ring-sky-200',
  nhan_su: 'bg-violet-50 text-violet-700 ring-violet-200',
  mkt_kd: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  tai_chinh: 'bg-amber-50 text-amber-700 ring-amber-200',
  chien_luoc: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Thấp',
  normal: 'Bình thường',
  high: 'Cao',
  urgent: 'Khẩn',
};

// SLA theo cấp duyệt (giờ)
export const SLA_HOURS = {
  tp: 48,
  gd: 72,
  ceo: 96,
  bo_sung: 48,
  khan: 24,
};

// Backward compat alias (cho code V2 cũ vẫn import `Proposal`)
export type Proposal = ProposalV3;
