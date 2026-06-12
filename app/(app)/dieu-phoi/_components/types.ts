// ============================================================
// /dieu-phoi types — V4 spec (Điều phối)
// Nguồn duy nhất: schema CoordTask, Collaborator, labels, SLA.
// Tiếng Việt CÓ DẤU đầy đủ — không mojibake.
// ------------------------------------------------------------
// Backward compat: giữ các giá trị V3 (tiep_nhan / cho_phan_hoi /
// cho_phe_duyet) + các loại V3 (dieu_phoi / ho_tro / de_xuat /
// phe_duyet / canh_bao) trong union để các component V3 chưa
// refactor (KpiBar, CoordinationTable, DetailDrawer, BottleneckTable,
// TopWatchList, ImportantNotiPanel, BlockDonut, DeptBarChart,
// BranchBarChart, CreateModal, adapter) vẫn compile.
// Code MỚI phải dùng các giá trị V4 (cho_owner_xac_nhan,
// cho_duyet_ket_qua, van_hanh, marketing, dao_tao, nhan_su,
// ky_thuat, tai_chinh, du_an).
// ============================================================

// ----- Enums chính (V4) -----

/**
 * 7 loại điều phối V4 — theo SPEC.
 * Backward compat: union thêm 5 loại V3 (dieu_phoi/ho_tro/de_xuat/
 * phe_duyet/canh_bao) để CreateModal V3 + adapter V3 chưa refactor
 * vẫn dùng được.
 */
export type CoordTypeV4 =
  | 'van_hanh'   // Vận hành
  | 'marketing'  // Marketing
  | 'dao_tao'    // Đào tạo
  | 'nhan_su'    // Nhân sự
  | 'ky_thuat'   // Kỹ thuật
  | 'tai_chinh'  // Tài chính
  | 'du_an';     // Dự án / chiến lược

export type CoordTypeV3 =
  | 'dieu_phoi'
  | 'ho_tro'
  | 'de_xuat'
  | 'phe_duyet'
  | 'canh_bao';

export type CoordType = CoordTypeV4 | CoordTypeV3;

/**
 * 7 trạng thái điều phối V4 — theo SPEC:
 *   khoi_tao            — Vừa tạo, Owner chưa bắt đầu
 *   dang_xu_ly          — Owner đang triển khai phần của mình
 *   dang_phoi_hop       — Có collaborator đã tiếp nhận / đang làm / chờ
 *   cho_owner_xac_nhan  — Tất cả collab hoan_thanh → chờ Owner xác nhận
 *   cho_duyet_ket_qua   — Owner đã xác nhận → chờ Người duyệt cuối
 *   hoan_thanh          — Đã xác nhận / duyệt xong, chưa close
 *   dong_ho_so          — Khóa, archive
 *
 * Backward compat: giữ thêm 3 trạng thái V3 (tiep_nhan, cho_phan_hoi,
 * cho_phe_duyet) cho UI/adapter V3. Khi refactor V4, thay:
 *   tiep_nhan      → khoi_tao
 *   cho_phan_hoi   → dang_phoi_hop
 *   cho_phe_duyet  → cho_duyet_ket_qua
 */
export type CoordStatusV4 =
  | 'khoi_tao'
  | 'dang_xu_ly'
  | 'dang_phoi_hop'
  | 'cho_owner_xac_nhan'
  | 'cho_duyet_ket_qua'
  | 'hoan_thanh'
  | 'dong_ho_so';

export type CoordStatusV3Legacy =
  | 'tiep_nhan'
  | 'cho_phan_hoi'
  | 'cho_phe_duyet';

export type CoordStatus = CoordStatusV4 | CoordStatusV3Legacy;

/**
 * 6 trạng thái V4 cho từng đơn vị phối hợp (Collaborator):
 *   chua_tiep_nhan   — vừa được giao
 *   da_tiep_nhan     — đã bấm tiếp nhận
 *   dang_thuc_hien   — đang làm
 *   gui_hoan_thanh   — đã bấm "Gửi hoàn thành" + kèm kết quả/note/file
 *   hoan_thanh       — Owner đã Chấp nhận kết quả
 *   bi_tra_lai       — Owner Trả lại (kèm lý do) — collab phải làm lại
 */
export type CollabStatus =
  | 'chua_tiep_nhan'
  | 'da_tiep_nhan'
  | 'dang_thuc_hien'
  | 'gui_hoan_thanh'
  | 'hoan_thanh'
  | 'bi_tra_lai';

/** Mức độ ưu tiên (V3 legacy — vẫn dùng song song với Severity V4). */
export type Priority = 'low' | 'normal' | 'high';

/** Mức độ khẩn V4 — 2 chip. */
export type Severity = 'binh_thuong' | 'khan_cap';

/** Cấp độ V4 — 3 chip (dùng cho scoring + bảng "Mức độ"). */
export type CoordLevel = 'thong_thuong' | 'quan_trong' | 'trong_diem';

/** Nguồn phát sinh V4 — 6 chip. */
export type CoordSource =
  | 'de_xuat'
  | 'hop'
  | 'kpi'
  | 'chi_dao_ceo'
  | 'phat_sinh'
  | 'khac';

/** Phạm vi — V4 auto-detect từ Owner block vs Collab blocks. */
export type CoordScope =
  | 'noi_bo_phong' // Trong cùng 1 phòng ban
  | 'lien_phong'   // Giữa các phòng ban cùng khối
  | 'lien_co_so'   // Giữa các cơ sở
  | 'trong_khoi'   // V4 — Owner + collab cùng khối (KD-KD hoặc VP-VP)
  | 'lien_khoi'    // V4 — Owner + collab khác khối (KD ↔ VP)
  | 'chien_luoc';  // Chiến lược cấp công ty (CEO/Chủ tịch)

export type Block = 'KD' | 'VP';

export type BranchId = 'HM' | 'NCT24' | 'LD' | 'TT' | 'TK' | 'CG';

export type DeptId = 'MKT' | 'DT' | 'KT' | 'QLCS' | 'NS' | 'KE' | 'GS';

// ============================================================
// KPI dòng — Form khối "Kết quả" (V4)
// ============================================================

export interface KpiRow {
  /** Tên chỉ số — vd "Tỷ lệ chốt", "Doanh thu", "Số lead". */
  name: string;
  /** Mục tiêu — chuỗi để hỗ trợ %, VND, số nguyên. */
  target: string;
  /** Optional id — UI list cần stable key (DetailDrawer V3). */
  id?: string;
  /** Alias hiển thị của `name` — V3 UI cũ dùng `label`. */
  label?: string;
  /** Kết quả thực tế (nếu đã cập nhật) — V3 UI hiển thị "actual/target". */
  actual?: string;
}

// ============================================================
// Collaborator V4 — 1 đơn vị phối hợp
// ============================================================

/**
 * Đơn vị phối hợp — 5 FIELD BẮT BUỘC (V3):
 *   1. unitName        (Đơn vị / Người phụ trách — denormalized)
 *   2. supportContent  (Nội dung cần hỗ trợ)
 *   3. deliverable     (Kết quả cần bàn giao)
 *   4. deadline        (Deadline riêng — YYYY-MM-DD)
 *   5. status          (Trạng thái riêng — 6 trạng thái CollabStatus)
 *
 * V4 thêm:
 *   - responsibleUid/Name (BẮT BUỘC) — định danh TP/QLCS cụ thể
 *   - submittedAt/submittedResult/submittedNote/submittedFiles
 *     khi collab bấm "Gửi hoàn thành"
 *   - acceptedAt — Owner Chấp nhận → status='hoan_thanh'
 *   - rejectedAt/rejectionReason — Owner Trả lại → status='bi_tra_lai'
 *   - completedAt — alias của acceptedAt (UI cũ vẫn dùng)
 *   - waitingFor block riêng cho collab (unit/person/content/since/deadline)
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
  // Khối / phòng / cơ sở của collaborator — phục vụ auto-detect scope
  block?: Block;
  deptId?: DeptId;
  branch?: BranchId;
  // Workflow V3 timestamps + audit
  acceptedAt?: string;      // ISO khi chuyển sang da_tiep_nhan
  startedAt?: string;       // ISO khi chuyển sang dang_thuc_hien
  rejectedAt?: string;      // ISO khi từ chối / bị trả lại
  rejectionReason?: string; // bắt buộc nếu rejectedAt được set
  completedAt?: string;     // ISO khi chuyển sang hoan_thanh
  completionNote?: string;
  // V4 — Gửi hoàn thành
  submittedAt?: string;       // ISO khi collab bấm "Gửi hoàn thành"
  submittedResult?: string;   // Kết quả cụ thể
  submittedNote?: string;     // Ghi chú thêm
  submittedFiles?: string[];  // URL/storage path các file đính kèm
  // V4 — Waiting-For per collab
  waitingForUnit?: string;
  waitingForPerson?: string;
  waitingForContent?: string;
  waitingSince?: string;      // ISO datetime
  waitingDeadline?: string;   // YYYY-MM-DD
}

// ============================================================
// CoordTask V4 — Task điều phối
// ============================================================

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
  ownerRole?: string;      // V4 — role label hiển thị (TP_DT, QLCS, GD_KD, ...)
  ownerDeptId?: DeptId;
  ownerBlock: Block;
  ownerUnitId?: string;    // V4 — dept id (VP) hoặc branch id (KD)
  ownerUnitName?: string;  // V4 — label denormalized
  // Cơ sở liên quan (nếu có)
  branch?: BranchId;
  // Phối hợp
  collaborators: Collaborator[];
  collaboratorUnits: string[]; // ['MKT','QLCS',...] — phục vụ bảng list
  // V4 — Waiting-For Engine (task-level, đồng bộ collab đang chờ lâu nhất)
  waitingForUnit?: string;
  waitingForPerson: string;
  waitingForContent: string;
  waitingSince: string;        // ISO datetime — bắt đầu chờ từ khi nào
  waitingDeadline?: string;    // YYYY-MM-DD
  // Deadline chung (Owner end-to-end)
  dueDate: string; // YYYY-MM-DD
  // V4 — Khối "Thông tin"
  severity?: Severity;
  level?: CoordLevel;
  source?: CoordSource;
  // V4 — Khối "Kết quả"
  objective?: string;
  finalDeliverable?: string;
  kpis?: KpiRow[];
  // V4 — Khối "Tùy chọn"
  attachments?: string[];
  tags?: string[];
  needResultApproval?: boolean;
  resultApproverUid?: string;
  resultApproverName?: string;
  // Liên kết Đề xuất (nếu sinh từ đề xuất đã phê duyệt)
  fromProposalId?: string;
  // Audit cơ bản
  createdAt: string;
  createdByUid?: string;
  createdByName: string;
  updatedAt?: string;
}

// ============================================================
// Backward compat aliases — DetailDrawer V3 dùng pattern
//   `task as CoordTask & TaskV4Ext`
//   `c as Collaborator & CollabV4Ext`
// để truy cập field V4. Vì Collaborator/CoordTask V4 đã gộp đầy đủ
// field V4 + V3 vào base interface, các alias dưới đây = chính
// interface gốc (giữ tên cũ để file V3 chưa refactor compile được).
// ============================================================

export type TaskV4Ext = CoordTask;
export type CollabV4Ext = Collaborator;

// ============================================================
// Labels + Colors (Tailwind) — Tiếng Việt CÓ DẤU
// ============================================================

export const COORD_TYPE_LABEL: Record<CoordType, string> = {
  // V4
  van_hanh: 'Vận hành',
  marketing: 'Marketing',
  dao_tao: 'Đào tạo',
  nhan_su: 'Nhân sự',
  ky_thuat: 'Kỹ thuật',
  tai_chinh: 'Tài chính',
  du_an: 'Dự án',
  // V3 legacy
  dieu_phoi: 'Điều phối',
  ho_tro: 'Hỗ trợ',
  de_xuat: 'Đề xuất',
  phe_duyet: 'Phê duyệt',
  canh_bao: 'Cảnh báo',
};

export const COORD_TYPE_COLOR: Record<CoordType, string> = {
  // V4
  van_hanh: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  marketing: 'bg-pink-50 text-pink-700 ring-pink-200',
  dao_tao: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  nhan_su: 'bg-amber-50 text-amber-700 ring-amber-200',
  ky_thuat: 'bg-sky-50 text-sky-700 ring-sky-200',
  tai_chinh: 'bg-teal-50 text-teal-700 ring-teal-200',
  du_an: 'bg-violet-50 text-violet-700 ring-violet-200',
  // V3 legacy
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
  trong_khoi: 'Trong khối',
  lien_khoi: 'Liên khối',
  chien_luoc: 'Chiến lược',
};

export const COORD_STATUS_LABEL: Record<CoordStatus, string> = {
  // V4
  khoi_tao: 'Khởi tạo',
  dang_xu_ly: 'Đang xử lý',
  dang_phoi_hop: 'Đang phối hợp',
  cho_owner_xac_nhan: 'Chờ Owner xác nhận',
  cho_duyet_ket_qua: 'Chờ duyệt kết quả',
  hoan_thanh: 'Hoàn thành',
  dong_ho_so: 'Đóng hồ sơ',
  // V3 legacy
  tiep_nhan: 'Tiếp nhận',
  cho_phan_hoi: 'Chờ phản hồi',
  cho_phe_duyet: 'Chờ phê duyệt',
};

export const COORD_STATUS_COLOR: Record<CoordStatus, string> = {
  // V4
  khoi_tao: 'bg-slate-100 text-slate-700',
  dang_xu_ly: 'bg-sky-100 text-sky-800',
  dang_phoi_hop: 'bg-violet-100 text-violet-800',
  cho_owner_xac_nhan: 'bg-amber-100 text-amber-800',
  cho_duyet_ket_qua: 'bg-orange-100 text-orange-800',
  hoan_thanh: 'bg-emerald-100 text-emerald-800',
  dong_ho_so: 'bg-slate-100 text-slate-600',
  // V3 legacy
  tiep_nhan: 'bg-sky-100 text-sky-800',
  cho_phan_hoi: 'bg-amber-100 text-amber-800',
  cho_phe_duyet: 'bg-amber-100 text-amber-800',
};

export const COLLAB_STATUS_LABEL: Record<CollabStatus, string> = {
  chua_tiep_nhan: 'Chưa tiếp nhận',
  da_tiep_nhan: 'Đã tiếp nhận',
  dang_thuc_hien: 'Đang thực hiện',
  gui_hoan_thanh: 'Gửi hoàn thành',
  hoan_thanh: 'Hoàn thành',
  bi_tra_lai: 'Bị trả lại',
};

export const COLLAB_STATUS_COLOR: Record<CollabStatus, string> = {
  chua_tiep_nhan: 'bg-slate-100 text-slate-700',
  da_tiep_nhan: 'bg-sky-100 text-sky-800',
  dang_thuc_hien: 'bg-violet-100 text-violet-800',
  gui_hoan_thanh: 'bg-amber-100 text-amber-800',
  hoan_thanh: 'bg-emerald-100 text-emerald-800',
  bi_tra_lai: 'bg-rose-100 text-rose-700',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  binh_thuong: 'Bình thường',
  khan_cap: 'Khẩn cấp',
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  binh_thuong: 'bg-slate-100 text-slate-700 ring-slate-200',
  khan_cap: 'bg-rose-100 text-rose-700 ring-rose-200',
};

export const LEVEL_LABEL: Record<CoordLevel, string> = {
  thong_thuong: 'Thông thường',
  quan_trong: 'Quan trọng',
  trong_diem: 'Trọng điểm',
};

export const LEVEL_COLOR: Record<CoordLevel, string> = {
  thong_thuong: 'bg-slate-100 text-slate-700 ring-slate-200',
  quan_trong: 'bg-amber-100 text-amber-700 ring-amber-200',
  trong_diem: 'bg-rose-100 text-rose-700 ring-rose-200',
};

export const SOURCE_LABEL: Record<CoordSource, string> = {
  de_xuat: 'Đề xuất',
  hop: 'Cuộc họp',
  kpi: 'KPI',
  chi_dao_ceo: 'Chỉ đạo CEO',
  phat_sinh: 'Phát sinh',
  khac: 'Khác',
};

export const SOURCE_COLOR: Record<CoordSource, string> = {
  de_xuat: 'bg-violet-50 text-violet-700 ring-violet-200',
  hop: 'bg-sky-50 text-sky-700 ring-sky-200',
  kpi: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  chi_dao_ceo: 'bg-rose-50 text-rose-700 ring-rose-200',
  phat_sinh: 'bg-amber-50 text-amber-700 ring-amber-200',
  khac: 'bg-slate-50 text-slate-700 ring-slate-200',
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
// Role → Block (V4)
// ============================================================

/**
 * Map role hệ thống → khối. Dùng cho auto-detect scope:
 *   - Owner block + collaborator blocks cùng khối  → 'trong_khoi'
 *   - Owner block khác collaborator block          → 'lien_khoi'
 * Roles ngoài map mặc định 'KD' (khối Kinh doanh).
 */
export const ROLE_BLOCK: Record<string, Block> = {
  // Khối Văn phòng
  TP_MKT: 'VP',
  TP_DT: 'VP',
  TP_KT: 'VP',
  TP_NS: 'VP',
  TP_KE: 'VP',
  TP_GS: 'VP',
  GD_VP: 'VP',
  NV_VP: 'VP',
  // Khối Kinh doanh
  QLCS: 'KD',
  GD_KD: 'KD',
  NV_SALE: 'KD',
  NV_SALE_PT: 'KD',
  NV_LT: 'KD',
  NV_HLV: 'KD',
  // Cấp cao — không thuộc khối nào, mặc định coi như VP cho việc tính scope
  ADMIN: 'VP',
  CEO: 'VP',
  CT: 'VP',
};

// ============================================================
// SLA + Escalation (V4 theo SPEC)
// ============================================================

/**
 * SLA theo Severity (giờ) — cho 3 mốc chuẩn:
 *   - accept    : Collab phải tiếp nhận trong bao lâu
 *   - process   : Collab phải bắt đầu xử lý trong bao lâu
 *   - complete  : Toàn bộ task phải hoàn thành trong bao lâu
 *
 * Bình thường: 24 / 24 / 72h.
 * Khẩn cấp   :  4 /  8 / 24h.
 */
export const SLA_BY_SEVERITY: Record<Severity, { accept: number; process: number; complete: number }> = {
  binh_thuong: { accept: 24, process: 24, complete: 72 },
  khan_cap:    { accept: 4,  process: 8,  complete: 24 },
};

/**
 * SLA mặc định V3 (giờ) — giữ cho code cũ chưa migrate.
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
