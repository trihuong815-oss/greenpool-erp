export type CoordType = 'dieu_phoi' | 'ho_tro' | 'de_xuat' | 'phe_duyet' | 'canh_bao';
export type CoordScope = 'noi_bo_phong' | 'noi_bo_khoi' | 'lien_khoi' | 'lien_co_so' | 'du_an';
export type CoordStatus =
  | 'khoi_tao'
  | 'tiep_nhan'
  | 'dang_xu_ly'
  | 'dang_phoi_hop'
  | 'cho_phan_hoi'
  | 'cho_phe_duyet'
  | 'hoan_thanh'
  | 'dong_ho_so';
export type Priority = 'low' | 'normal' | 'high';
export type Block = 'KD' | 'VP';
export type BranchId = 'HM' | 'NCT24' | 'LD' | 'TT' | 'TK' | 'CG';
export type DeptId = 'MKT' | 'DT' | 'KT' | 'QLCS' | 'NS' | 'KE' | 'GS';

export interface Collaborator {
  id: string;
  unitName: string;
  ownerName: string;
  supportContent: string;
  deliverable: string;
  deadline: string; // YYYY-MM-DD
  status: 'chua_tiep_nhan' | 'dang_thuc_hien' | 'hoan_thanh';
}

export interface CoordTask {
  id: string;
  code: string;
  title: string;
  type: CoordType;
  scope: CoordScope;
  status: CoordStatus;
  priority: Priority;
  ownerUid: string;
  ownerName: string;
  ownerDeptId?: DeptId;
  ownerBlock: Block;
  branch?: BranchId;
  collaborators: Collaborator[];
  collaboratorUnits: string[]; // ['MKT', 'QLCS'] for table display
  waitingForPerson: string;
  waitingForContent: string;
  waitingSince: string; // ISO
  dueDate: string;
  createdAt: string;
  createdByName: string;
}

// Labels
export const COORD_TYPE_LABEL: Record<CoordType, string> = {
  dieu_phoi: 'Điều phối',
  ho_tro: 'Hỗ trợ',
  de_xuat: 'Đề xuất',
  phe_duyet: 'Phê duyệt',
  canh_bao: 'Cảnh báo',
};
export const COORD_TYPE_COLOR: Record<CoordType, string> = {
  dieu_phoi: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ho_tro: 'bg-sky-50 text-sky-700 ring-sky-200',
  de_xuat: 'bg-violet-50 text-violet-700 ring-violet-200',
  phe_duyet: 'bg-amber-50 text-amber-700 ring-amber-200',
  canh_bao: 'bg-rose-50 text-rose-700 ring-rose-200',
};
export const COORD_SCOPE_LABEL: Record<CoordScope, string> = {
  noi_bo_phong: 'Nội bộ phòng',
  noi_bo_khoi: 'Nội bộ khối',
  lien_khoi: 'Liên khối',
  lien_co_so: 'Liên cơ sở',
  du_an: 'Dự án',
};
export const COORD_STATUS_LABEL: Record<CoordStatus, string> = {
  khoi_tao: 'Khởi tạo',
  tiep_nhan: 'Tiếp nhận',
  dang_xu_ly: 'Đang xử lý',
  dang_phoi_hop: 'Đang phối hợp',
  cho_phan_hoi: 'Chờ phản hồi',
  cho_phe_duyet: 'Chờ duyệt',
  hoan_thanh: 'Hoàn thành',
  dong_ho_so: 'Đóng hồ sơ',
};
export const COORD_STATUS_COLOR: Record<CoordStatus, string> = {
  khoi_tao: 'bg-slate-100 text-slate-700',
  tiep_nhan: 'bg-slate-100 text-slate-700',
  dang_xu_ly: 'bg-sky-100 text-sky-800',
  dang_phoi_hop: 'bg-violet-100 text-violet-800',
  cho_phan_hoi: 'bg-amber-100 text-amber-800',
  cho_phe_duyet: 'bg-amber-100 text-amber-800',
  hoan_thanh: 'bg-emerald-100 text-emerald-800',
  dong_ho_so: 'bg-slate-100 text-slate-600',
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Thấp',
  normal: 'Trung bình',
  high: 'Cao',
};
export const PRIORITY_COLOR: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-sky-100 text-sky-700',
  high: 'bg-rose-100 text-rose-700',
};
export const BLOCK_LABEL: Record<Block, string> = {
  KD: 'Kinh doanh',
  VP: 'Văn phòng',
};
export const BRANCH_LABEL: Record<BranchId, string> = {
  HM: 'Green Pool Hoàng Mai',
  NCT24: 'Green Pool 24 NCT',
  LD: 'Green Pool Linh Đàm',
  TT: 'Green Pool Thanh Trì',
  TK: 'Green Pool Thụy Khuê',
  CG: 'Green Pool Cầu Giấy',
};
export const DEPT_LABEL: Record<DeptId, string> = {
  MKT: 'Marketing',
  DT: 'TP Đào tạo',
  KT: 'Kỹ thuật',
  QLCS: 'QLCS',
  NS: 'Nhân sự',
  KE: 'Kế toán',
  GS: 'Giám sát',
};
