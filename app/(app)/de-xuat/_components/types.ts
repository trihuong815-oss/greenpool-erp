// Đề xuất V2 — types theo SPEC nghiệp vụ
// Workflow 7 trạng thái: Nháp → Đã gửi → Đang xem xét → Yêu cầu bổ sung → Đã phê duyệt → Từ chối → Chuyển điều phối

export type ProposalStatus =
  | 'nhap'
  | 'da_gui'
  | 'dang_xem_xet'
  | 'yeu_cau_bo_sung'
  | 'da_phe_duyet'
  | 'tu_choi'
  | 'chuyen_dieu_phoi';

export type ProposalKind = 'tai_chinh' | 'nhan_su' | 'van_hanh' | 'co_so' | 'khac';

export interface ApproverStep {
  uid?: string;            // hoặc role
  roleCode?: string;
  name: string;
  decidedAt?: string;
  decision?: 'approved' | 'rejected' | 'requested_revision';
  notes?: string;
}

export interface Proposal {
  id: string;
  code: string;            // DX-2026-XXXX
  title: string;
  description: string;
  kind: ProposalKind;
  status: ProposalStatus;
  creatorUid: string;
  creatorName: string;
  creatorRole: string;
  creatorBlock: 'KD' | 'VP' | 'all';
  approverChain: string[];      // ['user:UID', 'role:GD_KD', 'role:CEO']
  approverIdx: number;          // 0..n bước hiện tại
  approverHistory: ApproverStep[];
  linkedCoordTaskId?: string;   // sau khi click "Chuyển điều phối"
  estimatedCost?: number;
  deadline?: string;            // YYYY-MM-DD
  attachments?: { name: string; url: string }[];
  createdAt: string;
  updatedAt: string;
}

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  nhap: 'Nháp',
  da_gui: 'Đã gửi',
  dang_xem_xet: 'Đang xem xét',
  yeu_cau_bo_sung: 'Yêu cầu bổ sung',
  da_phe_duyet: 'Đã phê duyệt',
  tu_choi: 'Từ chối',
  chuyen_dieu_phoi: 'Đã chuyển điều phối',
};

export const PROPOSAL_STATUS_COLOR: Record<ProposalStatus, string> = {
  nhap: 'bg-slate-100 text-slate-700',
  da_gui: 'bg-sky-100 text-sky-700',
  dang_xem_xet: 'bg-amber-100 text-amber-800',
  yeu_cau_bo_sung: 'bg-orange-100 text-orange-800',
  da_phe_duyet: 'bg-emerald-100 text-emerald-800',
  tu_choi: 'bg-rose-100 text-rose-700',
  chuyen_dieu_phoi: 'bg-violet-100 text-violet-800',
};

export const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = {
  tai_chinh: 'Tài chính',
  nhan_su: 'Nhân sự',
  van_hanh: 'Vận hành',
  co_so: 'Cơ sở',
  khac: 'Khác',
};
