// ============================================================
// /dieu-phoi types — V2 spec (Điều phối)
// Nguồn duy nhất cho schema CoordTask, Collaborator, labels, SLA.
// Tiếng Việt CÓ DẤU đầy đủ — không mojibake.
// ============================================================

// ----- Enums chính -----

export type CoordType =
  | 'dieu_phoi' // Điều phối triển khai (mặc định)
  | 'ho_tro'    // Hỗ trợ liên phòng / liên cơ sở
  | 'de_xuat'   // Đề xuất chuyển sang điều phối
  | 'phe_duyet' // Cần phê duyệt cuối
  | 'canh_bao'; // Cảnh báo / xử lý sự cố

export type CoordScope =
  | 'noi_bo_phong' // Trong cùng 1 phòng ban
  | 'lien_phong'   // Giữa các phòng ban cùng khối
  | 'lien_co_so'   // Giữa các cơ sở
  | 'lien_khoi'    // Liên khối KD ↔ VP
  | 'chien_luoc';  // Chiến lược cấp công ty (CEO/Chủ tịch)

export type CoordStatus =
  | 'khoi_tao'      // Người khởi tạo vừa lưu, Owner chưa tiếp nhận
  | 'tiep_nhan'     // Owner đã tiếp nhận, chưa bắt đầu
  | 'dang_xu_ly'    // Owner đang triển khai phần của mình
  | 'dang_phoi_hop' // ≥1 collaborator đã tiếp nhận / đang thực hiện
  | 'cho_phan_hoi'  // Owner đang chờ collaborator phản hồi
  | 'cho_phe_duyet' // Đang chờ TP/GĐ duyệt kết quả (optional gate)
  | 'hoan_thanh'    // Tất cả collaborator + Owner xong, chưa close
  | 'dong_ho_so';   // Khóa, archive

export type CollabStatus =
  | 'chua_tiep_nhan'
  | 'da_tiep_nhan'
  | 'dang_thuc_hien'
  | 'hoan_thanh';

export type Priority = 'low' | 'normal' | 'high';

export type Block = 'KD' | 'VP';

export type BranchId = 'HM' | 'NCT24' | 'LD' | 'TT' | 'TK' | 'CG';

export type DeptId = 'MKT' | 'DT' | 'KT' | 'QLCS' | 'NS' | 'KE' | 'GS';

// ----- Interfaces -----

/**
 * Đơn vị phối hợp — 5 FIELD BẮT BUỘC theo SPEC:
 *   1. unitName        (Đơn vị / Người phụ trách — denormalized)
 *   2. supportContent  (Nội dung cần hỗ trợ)
 *   3. deliverable     (Kết quả cần bàn giao)
 *   4. deadline        (Deadline riêng — YYYY-MM-DD)
 *   5. status          (Trạng thái riêng — 4 trạng thái CollabStatus)
 *
 * Thêm responsibleUid + responsibleName (BẮT BUỘC) để định danh
 * TP/QLCS cụ thể chịu trách nhiệm — phục vụ RBAC Tiếp nhận/Từ chối.
 *
 * ownerName giữ lại làm alias hiển thị tương thích phần UI cũ
 * (= responsibleName của đơn vị phối hợp, không phải Owner điều phối).
 */
export interface Collaborator {
  id: string;
  // 5 field bắt buộc
  unitName: string;
  supportContent: string;
  deliverable: string;
  deadline: string; // YYYY-MM-DD
  status: CollabStatus;
  // Người phụ trách cụ thể của đơn vị phối hợp (bắt buộc)
  responsibleUid: string;
  responsibleName: string;
  // Alias hiển thị (giữ tương thích phần UI render Collaborator cũ)
  ownerName?: string;
  // Optional — workflow timestamps + audit
  acceptedAt?: string;     // ISO khi chuyển sang da_tiep_nhan
  startedAt?: string;      // ISO khi chuyển sang dang_thuc_hien
  rejectedAt?: string;     // ISO khi từ chối
  rejectionReason?: string; // bắt buộc nếu rejectedAt được set
  completedAt?: string;    // ISO khi chuyển sang hoan_thanh
  completionNote?: string;
}

export interface CoordTask {
  id: string;
  code: string;
  title: string;
  type: CoordType;
  scope: CoordScope;
  status: CoordStatus;
  priority: Priority;
  // OWNER — duy nhất 1 người chịu KPI cuối cùng
  ownerUid: string;
  ownerName: string;
  ownerDeptId?: DeptId;
  ownerBlock: Block;
  // Cơ sở liên quan (nếu có)
  branch?: BranchId;
  // Phối hợp
  collaborators: Collaborator[];
  collaboratorUnits: string[]; // ví dụ ['MKT','QLCS'] — phục vụ bảng list
  // Waiting-For Engine — 3 field BẮT BUỘC
  waitingForPerson: string;
  waitingForContent: string;
  waitingSince: string; // ISO datetime — bắt đầu chờ từ khi nào
  // Deadline chung (Owner end-to-end)
  dueDate: string; // YYYY-MM-DD
  // Liên kết Đề xuất (nếu sinh từ đề xuất đã phê duyệt)
  fromProposalId?: string;
  // Audit cơ bản
  createdAt: string;
  createdByName: string;
}

// ============================================================
// Labels + Colors (Tailwind) — Tiếng Việt CÓ DẤU
// ============================================================

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
  lien_phong: 'Liên phòng',
  lien_co_so: 'Liên cơ sở',
  lien_khoi: 'Liên khối',
  chien_luoc: 'Chiến lược',
};

export const COORD_STATUS_LABEL: Record<CoordStatus, string> = {
  khoi_tao: 'Khởi tạo',
  tiep_nhan: 'Tiếp nhận',
  dang_xu_ly: 'Đang xử lý',
  dang_phoi_hop: 'Đang phối hợp',
  cho_phan_hoi: 'Chờ phản hồi',
  cho_phe_duyet: 'Chờ phê duyệt',
  hoan_thanh: 'Hoàn thành',
  dong_ho_so: 'Đóng hồ sơ',
};

export const COORD_STATUS_COLOR: Record<CoordStatus, string> = {
  khoi_tao: 'bg-slate-100 text-slate-700',
  tiep_nhan: 'bg-sky-100 text-sky-800',
  dang_xu_ly: 'bg-sky-100 text-sky-800',
  dang_phoi_hop: 'bg-violet-100 text-violet-800',
  cho_phan_hoi: 'bg-amber-100 text-amber-800',
  cho_phe_duyet: 'bg-amber-100 text-amber-800',
  hoan_thanh: 'bg-emerald-100 text-emerald-800',
  dong_ho_so: 'bg-slate-100 text-slate-600',
};

export const COLLAB_STATUS_LABEL: Record<CollabStatus, string> = {
  chua_tiep_nhan: 'Chưa tiếp nhận',
  da_tiep_nhan: 'Đã tiếp nhận',
  dang_thuc_hien: 'Đang thực hiện',
  hoan_thanh: 'Hoàn thành',
};

export const COLLAB_STATUS_COLOR: Record<CollabStatus, string> = {
  chua_tiep_nhan: 'bg-slate-100 text-slate-700',
  da_tiep_nhan: 'bg-sky-100 text-sky-800',
  dang_thuc_hien: 'bg-violet-100 text-violet-800',
  hoan_thanh: 'bg-emerald-100 text-emerald-800',
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

// Tên TẮT cho UI bảng theo SPEC: "GP HM/24NCT/LĐ/TT/TK/CG"
export const BRANCH_LABEL: Record<BranchId, string> = {
  HM: 'GP HM',
  NCT24: 'GP 24NCT',
  LD: 'GP LĐ',
  TT: 'GP TT',
  TK: 'GP TK',
  CG: 'GP CG',
};

export const DEPT_LABEL: Record<DeptId, string> = {
  MKT: 'Marketing',
  DT: 'Đào tạo',
  KT: 'Kỹ thuật',
  QLCS: 'QLCS',
  NS: 'Nhân sự',
  KE: 'Kế toán',
  GS: 'Giám sát',
};

// ============================================================
// SLA + Escalation (theo SPEC)
// ============================================================

/**
 * SLA mặc định (giờ):
 *   - tiep_nhan     : 24h  Owner tiếp nhận điều phối
 *   - cho_phan_hoi  : 24h  chờ collaborator phản hồi
 *   - lien_phong    : 72h  hỗ trợ liên phòng
 *   - cho_duyet_tp  : 48h  chờ duyệt Trưởng phòng
 *   - cho_duyet_gd  : 72h  chờ duyệt Giám đốc
 */
export const SLA_HOURS = {
  tiep_nhan: 24,
  cho_phan_hoi: 24,
  lien_phong: 72,
  cho_duyet_tp: 48,
  cho_duyet_gd: 72,
} as const;

/**
 * Escalation 4 cấp (giờ kể từ waitingSince):
 *   24h  → nhắc người phụ trách
 *   48h  → nhắc trưởng phòng
 *   72h  → nhắc giám đốc khối
 *   96h  → báo CEO
 */
export const ESCALATION_HOURS = {
  level1_person: 24,
  level2_dept: 48,
  level3_director: 72,
  level4_ceo: 96,
} as const;

/**
 * Gợi ý lý do từ chối khi Owner / Collaborator reject (theo SPEC).
 */
export const REJECTION_REASONS = [
  'Không thuộc phạm vi trách nhiệm',
  'Đang quá tải',
  'Thiếu thông tin triển khai',
] as const;
