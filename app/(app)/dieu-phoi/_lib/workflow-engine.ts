// ============================================================
// /dieu-phoi/_lib/workflow-engine.ts — V4 Workflow Engine
// Helper thuần (pure functions) cho luồng nghiệp vụ Điều phối V4.
//
// QUY TẮC quan trọng:
//   - Tiếng Việt CÓ DẤU đầy đủ (không mojibake).
//   - Mọi so sánh ngày sử dụng `Date.parse(iso)` HOẶC `iso.slice(0,10)`
//     so sánh chuỗi — KHÔNG khởi tạo `new Date()` mới ngẫu nhiên.
//   - Khi cần "now", caller TRUYỀN tham số `nowIso` vào (testable, no
//     hidden global Date instance).
//   - File này chỉ chứa logic — không I/O, không Firestore, không React.
// ============================================================

import type {
  CoordTask,
  Collaborator,
  CoordStatus,
  CollabStatus,
  Block,
  CoordType,
} from '../_components/types';

// ============================================================
// V4-EXTENSION TYPES (forward-compat — types.ts sẽ refactor sau)
// ============================================================

/** V4 Severity — 2 mức. */
export type Severity = 'binh_thuong' | 'khan_cap';

/** V4 CoordLevel — 3 mức. */
export type CoordLevel = 'thong_thuong' | 'quan_trong' | 'trong_diem';

/** V4 CoordSource — 6 nguồn. */
export type CoordSource =
  | 'de_xuat'
  | 'hop'
  | 'kpi'
  | 'chi_dao_ceo'
  | 'phat_sinh'
  | 'khac';

/** V4 Scope auto-detect — 2 giá trị (trong khối / liên khối). */
export type AutoScope = 'trong_khoi' | 'lien_khoi';

/** Block của Owner (nếu Collaborator có block riêng). */
export interface CollaboratorV4 extends Collaborator {
  block?: Block;
}

/**
 * Mở rộng CoordTask cho V4. Các field mới đều OPTIONAL để giữ
 * backward-compat với V3 schema cho đến khi types.ts refactor.
 */
export interface CoordTaskV4 extends CoordTask {
  severity?: Severity;
  level?: CoordLevel;
  source?: CoordSource;
  resultApproverUid?: string;
  resultApproverName?: string;
  autoScope?: AutoScope;
}

/** Khối Owner — input cho computeScope. */
export interface OwnerBlockInput {
  uid: string;
  name: string;
  block: Block;
}

/** Khối Collaborator — input cho computeScope. */
export interface CollaboratorBlockInput {
  unitName: string;
  responsibleUid: string;
  responsibleName: string;
  block: Block;
}

/** Waiting-For per collab — output của computeWaitingFor. */
export interface WaitingForInfo {
  unit: string;
  person: string;
  content: string;
  since?: string;
  deadline?: string;
}

// ============================================================
// 1. computeProgress
// ============================================================

/**
 * % collaborator có status='hoan_thanh'.
 * - Không có collaborator → 0.
 * - Làm tròn xuống integer (0-100).
 */
export function computeProgress(collaborators: Collaborator[]): number {
  if (!collaborators || collaborators.length === 0) return 0;
  const total = collaborators.length;
  let done = 0;
  for (let i = 0; i < total; i++) {
    if (collaborators[i]?.status === 'hoan_thanh') done++;
  }
  return Math.floor((done / total) * 100);
}

// ============================================================
// 2. computeScope — auto-detect 'trong_khoi' / 'lien_khoi'
// ============================================================

/**
 * Nếu BẤT KỲ collaborator block !== ownerBlock → 'lien_khoi'.
 * Mặc định 'trong_khoi'.
 */
export function computeScope(
  ownerBlock: OwnerBlockInput,
  collaboratorBlocks: CollaboratorBlockInput[],
): AutoScope {
  if (!ownerBlock?.block) return 'trong_khoi';
  if (!collaboratorBlocks || collaboratorBlocks.length === 0) return 'trong_khoi';
  for (let i = 0; i < collaboratorBlocks.length; i++) {
    const cb = collaboratorBlocks[i];
    if (cb?.block && cb.block !== ownerBlock.block) return 'lien_khoi';
  }
  return 'trong_khoi';
}

// ============================================================
// 3. computeWaitingFor
// ============================================================

/**
 * - Nếu progress >= 100 → chờ Owner xác nhận (unit=Owner, person=ownerName).
 * - Ngược lại → collaborator ĐẦU TIÊN chưa 'hoan_thanh'.
 *   Ưu tiên: chua_tiep_nhan > da_tiep_nhan > dang_thuc_hien > bi_tra_lai > gui_hoan_thanh.
 */
export function computeWaitingFor(coord: CoordTaskV4): WaitingForInfo {
  const collabs = coord.collaborators ?? [];
  const pct = computeProgress(collabs);

  if (pct >= 100) {
    return {
      unit: 'Owner',
      person: coord.ownerName,
      content: 'Xác nhận hoàn thành tổng thể',
      since: coord.waitingSince,
      deadline: coord.dueDate,
    };
  }

  const priority: CollabStatus[] = [
    'chua_tiep_nhan',
    'da_tiep_nhan',
    'dang_thuc_hien',
    'bi_tra_lai' as CollabStatus,
    'gui_hoan_thanh' as CollabStatus,
  ];

  for (let p = 0; p < priority.length; p++) {
    const want = priority[p];
    for (let i = 0; i < collabs.length; i++) {
      const c = collabs[i];
      if (c?.status === want) {
        return {
          unit: c.unitName,
          person: c.responsibleName || c.ownerName || '',
          content: c.supportContent,
          since: coord.waitingSince,
          deadline: c.deadline,
        };
      }
    }
  }

  // Fallback — không tìm thấy collab nào (toàn bộ status lạ).
  return {
    unit: coord.ownerName,
    person: coord.ownerName,
    content: 'Đang chờ cập nhật',
    since: coord.waitingSince,
    deadline: coord.dueDate,
  };
}

// ============================================================
// 4. nextStatusAfterCollabUpdate
// ============================================================

/**
 * Tính CoordStatus mới sau khi 1 collaborator vừa update status.
 * - pct >= 100 → 'cho_owner_xac_nhan'
 * - status hiện tại === 'khoi_tao' → 'dang_xu_ly'
 * - mặc định → 'dang_phoi_hop'
 *
 * LƯU Ý: V3 enum chưa có 'cho_owner_xac_nhan'; ép kiểu CoordStatus
 * để backward-compat với types.ts cho đến khi refactor.
 */
export function nextStatusAfterCollabUpdate(coord: CoordTaskV4): CoordStatus {
  const pct = computeProgress(coord.collaborators ?? []);
  if (pct >= 100) return 'cho_owner_xac_nhan' as CoordStatus;
  if (coord.status === 'khoi_tao') return 'dang_xu_ly';
  return 'dang_phoi_hop';
}

// ============================================================
// 5-10. Permission helpers (per-user, per-collab)
// ============================================================

/** Collaborator có thể TIẾP NHẬN khi: responsibleUid===userUid && status='chua_tiep_nhan'. */
export function canCollabAccept(
  _coord: CoordTaskV4,
  collab: Collaborator,
  userUid: string,
): boolean {
  if (!collab || !userUid) return false;
  if (collab.responsibleUid !== userUid) return false;
  return collab.status === 'chua_tiep_nhan';
}

/**
 * Collaborator có thể GỬI HOÀN THÀNH khi:
 *   - responsibleUid===userUid
 *   - status ∈ [da_tiep_nhan, dang_thuc_hien, bi_tra_lai]
 */
export function canCollabSubmit(
  _coord: CoordTaskV4,
  collab: Collaborator,
  userUid: string,
): boolean {
  if (!collab || !userUid) return false;
  if (collab.responsibleUid !== userUid) return false;
  const s = collab.status as CollabStatus;
  return (
    s === 'da_tiep_nhan' ||
    s === 'dang_thuc_hien' ||
    (s as string) === 'bi_tra_lai'
  );
}

/**
 * Owner có thể Chấp nhận / Trả lại trên collab khi:
 *   - ownerUid===userUid
 *   - collab.status === 'gui_hoan_thanh'
 */
export function canOwnerActOnCollab(
  coord: CoordTaskV4,
  collab: Collaborator,
  userUid: string,
): boolean {
  if (!coord || !collab || !userUid) return false;
  if (coord.ownerUid !== userUid) return false;
  return (collab.status as string) === 'gui_hoan_thanh';
}

/**
 * Owner XÁC NHẬN HOÀN THÀNH tổng thể khi:
 *   - ownerUid===userUid
 *   - coord.status === 'cho_owner_xac_nhan'
 */
export function canOwnerConfirmOverall(
  coord: CoordTaskV4,
  userUid: string,
): boolean {
  if (!coord || !userUid) return false;
  if (coord.ownerUid !== userUid) return false;
  return (coord.status as string) === 'cho_owner_xac_nhan';
}

/**
 * Người DUYỆT KẾT QUẢ (optional gate) khi:
 *   - resultApproverUid===userUid
 *   - coord.status === 'cho_duyet_ket_qua'
 */
export function canResultApprove(coord: CoordTaskV4, userUid: string): boolean {
  if (!coord || !userUid) return false;
  if (!coord.resultApproverUid) return false;
  if (coord.resultApproverUid !== userUid) return false;
  return (coord.status as string) === 'cho_duyet_ket_qua';
}

/**
 * ĐÓNG HỒ SƠ khi:
 *   - coord.status === 'hoan_thanh'
 *   - Quyền: Owner / CEO / ADMIN / GĐ khối tương ứng.
 */
export function canCloseDossier(
  coord: CoordTaskV4,
  userUid: string,
  userRole: string,
): boolean {
  if (!coord || !userUid || !userRole) return false;
  if ((coord.status as string) !== 'hoan_thanh') return false;
  if (coord.ownerUid === userUid) return true;
  if (userRole === 'CEO' || userRole === 'ADMIN') return true;
  if (userRole === 'GD_KD' && coord.ownerBlock === 'KD') return true;
  if (userRole === 'GD_VP' && coord.ownerBlock === 'VP') return true;
  return false;
}

// ============================================================
// 11. computeTags — auto-tag theo trạng thái + thuộc tính
// ============================================================

/**
 * Sinh danh sách nhãn (tag) hiển thị trên bảng/drawer.
 * Bao gồm: severity, level, source, scope, overdue, waiting-collab, type.
 */
export function computeTags(coord: CoordTaskV4): string[] {
  const tags: string[] = [];

  // Severity
  if (coord.severity === 'khan_cap') tags.push('Khẩn cấp');

  // Level
  if (coord.level === 'trong_diem') tags.push('Trọng điểm');
  else if (coord.level === 'quan_trong') tags.push('Quan trọng');

  // Source
  if (coord.source === 'chi_dao_ceo') tags.push('Chỉ đạo CEO');
  else if (coord.source === 'kpi') tags.push('KPI');
  else if (coord.source === 'de_xuat') tags.push('Từ đề xuất');

  // Scope auto-detect
  if (coord.autoScope === 'lien_khoi') tags.push('Liên khối');
  else if (coord.autoScope === 'trong_khoi') tags.push('Trong khối');

  // Waiting-for collab (nếu status đang phối hợp)
  const s = coord.status as string;
  if (s === 'dang_phoi_hop') tags.push('Đang chờ phối hợp');
  if (s === 'cho_owner_xac_nhan') tags.push('Chờ Owner xác nhận');
  if (s === 'cho_duyet_ket_qua') tags.push('Chờ duyệt kết quả');

  // Type
  const typeLabelMap: Partial<Record<CoordType, string>> = {
    dieu_phoi: 'Điều phối',
    ho_tro: 'Hỗ trợ',
    de_xuat: 'Đề xuất',
    phe_duyet: 'Phê duyệt',
    canh_bao: 'Cảnh báo',
  };
  const tLabel = typeLabelMap[coord.type];
  if (tLabel) tags.push(tLabel);

  return tags;
}

// ============================================================
// 12. getSLAHoursForSeverity — SLA theo độ khẩn (giờ)
// ============================================================

/**
 * Trả về 3 mốc SLA (giờ) theo Severity:
 *   - bình thường : tiếp nhận 24h / phối hợp 24h / hoàn thành 72h
 *   - khẩn cấp    : tiếp nhận  4h / phối hợp  8h / hoàn thành 24h
 */
export interface SLAHours {
  tiepNhanH: number;
  phoiHopH: number;
  hoanThanhH: number;
}

export function getSLAHoursForSeverity(severity?: Severity): SLAHours {
  if (severity === 'khan_cap') {
    return { tiepNhanH: 4, phoiHopH: 8, hoanThanhH: 24 };
  }
  return { tiepNhanH: 24, phoiHopH: 24, hoanThanhH: 72 };
}

// ============================================================
// 13. isOverdue — so sánh ngày bằng string YYYY-MM-DD (no new Date)
// ============================================================

/**
 * So sánh dueDate (YYYY-MM-DD) với nowIso (ISO datetime hoặc YYYY-MM-DD).
 * Dùng `slice(0,10)` so sánh chuỗi — KHÔNG khởi tạo Date object.
 *
 * @param coord  Điều phối cần kiểm tra
 * @param nowIso ISO của thời điểm hiện tại (caller truyền vào)
 */
export function isOverdue(coord: CoordTaskV4, nowIso: string): boolean {
  if (!coord?.dueDate) return false;
  const s = coord.status as string;
  // Đã hoàn thành / đã đóng → không tính quá hạn.
  if (s === 'hoan_thanh' || s === 'dong_ho_so') return false;

  const due = coord.dueDate.slice(0, 10);
  const now = (nowIso || '').slice(0, 10);
  if (!due || !now) return false;
  return due < now;
}

/**
 * Helper bổ sung: so sánh 2 ISO datetime an toàn (không new Date).
 * Dùng Date.parse — trả về diff (ms). NaN-safe (trả 0).
 */
export function diffMs(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return a - b;
}
