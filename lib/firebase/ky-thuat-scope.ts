// Permission scope cho module Kỹ thuật vận hành.
// - Admin (CEO/GD_KD/GD_VP/TP_KT) → toàn 5 cơ sở.
// - PP_HT / PP_XLN → toàn 5 cơ sở (xem hết, scope chuyên môn ở UI).
// - QLCS_* → 1 cơ sở của mình (xem + giao việc, KHÔNG nhập số liệu thay KTV).
// - KT_HT_* / KT_XLN_* → 1 cơ sở của mình (xem + nhập số liệu chuyên môn của mình).
//
// Permission lookup based on roleCode + branchId/facility_id của profile.

import { isAdmin, isWriteAdmin, isTP, type CallerProfile } from './checklist-scope';

const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;
type Specialization = 'HT' | 'XLN';

/** Sub-area trong cơ sở CTT (bể trong nhà / ngoài trời / bể vầy). Chỉ CTT có. */
export type CttSubArea = 'indoor' | 'outdoor' | 'kid';
export const CTT_SUB_AREAS: readonly CttSubArea[] = ['indoor', 'outdoor', 'kid'];
const CTT_SUB_AREA_SET: ReadonlySet<string> = new Set(CTT_SUB_AREAS);

export function isValidCttSubArea(v: unknown): v is CttSubArea {
  return typeof v === 'string' && CTT_SUB_AREA_SET.has(v);
}

/** TP_KT + PP_HT + PP_XLN — phòng KT cấp quản lý. */
function isTechBoss(roleCode: string): boolean {
  return roleCode === 'TP_KT' || roleCode === 'PP_HT' || roleCode === 'PP_XLN';
}

/** KT viên cơ sở (KT_HT_* hoặc KT_XLN_*). */
function isTechFieldStaff(roleCode: string): boolean {
  return /^KT_(HT|XLN)_/.test(roleCode);
}

/** Tech specialization từ role code. PP/KT viên có specialization; admin null. */
export function getTechSpecialization(roleCode: string): Specialization | null {
  if (roleCode === 'PP_HT' || /^KT_HT_/.test(roleCode)) return 'HT';
  if (roleCode === 'PP_XLN' || /^KT_XLN_/.test(roleCode)) return 'XLN';
  return null;
}

/** Read scope — branch nào user được xem. */
export function kyThuatReadScope(p: CallerProfile): { branchIds: string[] | null } {
  if (!p.uid) return { branchIds: [] };
  if (isAdmin(p) || isTP(p) || isTechBoss(p.role_code)) return { branchIds: null }; // all
  // QLCS + KT viên cơ sở → chỉ branch của họ
  if (p.facility_id) return { branchIds: [p.facility_id] };
  return { branchIds: [] };
}

/** Write chemical entry — chỉ KT_XLN viên (xử lý nước) + admin được nhập.
 *  KT_HT không nhập hoá chất; QLCS không nhập thay KTV.
 *
 *  CTT có 3 bể (indoor / outdoor / kid). KT_XLN_CTT chỉ nhập đúng bể mình phụ trách (user.sub_areas).
 *  Truyền `entrySubArea` khi check 1 entry cụ thể; bỏ trống chỉ check "có quyền nào không".
 */
export function canWriteChemical(
  p: CallerProfile,
  branchId: string,
  entrySubArea?: CttSubArea | null,
): boolean {
  if (!p.uid) return false;
  if (!(ALL_BRANCHES as readonly string[]).includes(branchId)) return false;
  if (isWriteAdmin(p)) return true; // ADMIN/GD — CEO loại trừ (view-only)
  if (p.role_code === 'TP_KT' || p.role_code === 'PP_XLN') return true;
  if (/^KT_XLN_/.test(p.role_code) && p.facility_id === branchId) {
    // CTT-only: nếu user có sub_areas (phân vùng) và entry có subArea → phải khớp.
    if (branchId === 'CTT' && entrySubArea && Array.isArray(p.sub_areas) && p.sub_areas.length > 0) {
      return p.sub_areas.includes(entrySubArea);
    }
    return true;
  }
  return false;
}

/** Read chemical entry — KT_XLN_CTT chỉ thấy entry trong sub_areas của mình.
 *  TP/PP/admin xem hết. KT_XLN ở branch khác xem theo branch scope thông thường. */
export function canReadChemicalEntry(
  p: CallerProfile,
  entryBranchId: string,
  entrySubArea: CttSubArea | null,
): boolean {
  if (!p.uid) return false;
  if (isAdmin(p) || p.role_code === 'TP_KT' || p.role_code === 'PP_HT' || p.role_code === 'PP_XLN') return true;
  if (/^QLCS_/.test(p.role_code) && p.facility_id === entryBranchId) return true;
  // KT_XLN_CTT subArea filter: nếu user có sub_areas, entry subArea phải nằm trong.
  // Backward compat: entry KHÔNG có subArea (data cũ pre-subArea feature) → visible cho tất cả KT_XLN_CTT
  // (vì không xác định được chủ bể; tránh data loss).
  if (/^KT_XLN_CTT$/.test(p.role_code) && p.facility_id === 'CTT' && entryBranchId === 'CTT') {
    if (Array.isArray(p.sub_areas) && p.sub_areas.length > 0) {
      if (entrySubArea === null) return true; // legacy — visible to all CTT viewers
      return p.sub_areas.includes(entrySubArea);
    }
    return true;
  }
  if (/^KT_(HT|XLN)_/.test(p.role_code) && p.facility_id === entryBranchId) return true;
  return false;
}

/** Read machine — KT_XLN_CTT chỉ thấy machine có subArea ∈ sub_areas của mình.
 *  KT_HT/TP/PP/admin/QLCS xem hết (theo branch scope thông thường). */
export function canReadMachine(
  p: CallerProfile,
  machineBranchId: string,
  machineSubArea: CttSubArea | null,
): boolean {
  if (!p.uid) return false;
  if (isAdmin(p) || p.role_code === 'TP_KT' || p.role_code === 'PP_HT' || p.role_code === 'PP_XLN') return true;
  if (/^QLCS_/.test(p.role_code) && p.facility_id === machineBranchId) return true;
  if (/^KT_HT_/.test(p.role_code) && p.facility_id === machineBranchId) return true;
  if (/^KT_XLN_CTT$/.test(p.role_code) && p.facility_id === 'CTT' && machineBranchId === 'CTT') {
    if (Array.isArray(p.sub_areas) && p.sub_areas.length > 0) {
      // Backward compat: machineSubArea null (data cũ) → visible cho tất cả CTT viewers
      if (machineSubArea === null) return true;
      return p.sub_areas.includes(machineSubArea);
    }
    return true;
  }
  if (/^KT_XLN_/.test(p.role_code) && p.facility_id === machineBranchId) return true;
  return false;
}

/** Delete chemical entry — ADMIN/GD/TP/PP_XLN. CEO loại trừ. KT_XLN chỉ entry của chính mình (check ở route). */
export function canDeleteChemicalAsBoss(p: CallerProfile): boolean {
  if (!p.uid) return false;
  return isWriteAdmin(p) || p.role_code === 'TP_KT' || p.role_code === 'PP_XLN';
}

// ─────── Vận hành máy ───────
// Setup máy (CRUD config): chỉ admin/TP_KT/PP_HT. KTV không setup máy.
// Nhập giờ chạy: KT_HT (máy lọc + nhiệt) + admin + TP_KT + PP_HT (KT_XLN không nhập).

export function canSetupMachines(p: CallerProfile): boolean {
  if (!p.uid) return false;
  return isWriteAdmin(p) || p.role_code === 'TP_KT' || p.role_code === 'PP_HT';
}

export function canWriteMachineRun(p: CallerProfile, branchId: string): boolean {
  if (!p.uid) return false;
  if (!(ALL_BRANCHES as readonly string[]).includes(branchId)) return false;
  if (isWriteAdmin(p)) return true;
  if (p.role_code === 'TP_KT' || p.role_code === 'PP_HT') return true;
  if (/^KT_HT_/.test(p.role_code) && p.facility_id === branchId) return true;
  return false;
}

export function canDeleteMachineRunAsBoss(p: CallerProfile): boolean {
  if (!p.uid) return false;
  return isWriteAdmin(p) || p.role_code === 'TP_KT' || p.role_code === 'PP_HT';
}

// ─────── Work (tasks / reports / proposals) ───────

function isQLCSRole(roleCode: string): boolean {
  return /^QLCS_/.test(roleCode);
}
function isPP(roleCode: string): boolean {
  return roleCode === 'PP_HT' || roleCode === 'PP_XLN';
}
function isKT(roleCode: string): boolean {
  return /^KT_(HT|XLN)_/.test(roleCode);
}

/** Tạo task — QLCS / TP_KT / PP_HT / PP_XLN / ADMIN/GD được giao việc. CEO loại trừ (chỉ giao việc cấp GD Khối qua module Tasks chung). */
export function canCreateTask(p: CallerProfile): boolean {
  if (!p.uid) return false;
  return isWriteAdmin(p) || p.role_code === 'TP_KT' || isPP(p.role_code) || isQLCSRole(p.role_code);
}

/** Tạo report — chỉ KTV. */
export function canCreateReport(p: CallerProfile): boolean {
  return isKT(p.role_code);
}

/** Tạo proposal — chỉ KTV. */
export function canCreateProposal(p: CallerProfile): boolean {
  return isKT(p.role_code);
}

/** Duyệt proposal type 'expense' (duyệt chi) — QLCS cơ sở + GD/TP_KT.
 *  ADMIN system bypass; người tạo proposal KHÔNG được tự duyệt (kể cả khi role match).
 *  CEO loại trừ vì view-only. */
export function canApproveExpenseProposal(p: CallerProfile, branchId: string, createdBy?: string): boolean {
  if (!p.uid) return false;
  if (p.role_code === 'ADMIN') return true;
  if (createdBy && createdBy === p.uid) return false;
  if (isWriteAdmin(p) || p.role_code === 'TP_KT') return true;
  if (isQLCSRole(p.role_code) && p.facility_id === branchId) return true;
  return false;
}

/** Duyệt proposal type 'professional' (chuyên môn) — TP_KT / PP cùng specialization + GD.
 *  ADMIN system bypass; người tạo proposal KHÔNG được tự duyệt.
 *  CEO loại trừ vì view-only. */
export function canApproveProfessionalProposal(p: CallerProfile, specialization: 'HT' | 'XLN' | null, createdBy?: string): boolean {
  if (!p.uid) return false;
  if (p.role_code === 'ADMIN') return true;
  if (createdBy && createdBy === p.uid) return false;
  if (isWriteAdmin(p) || p.role_code === 'TP_KT') return true;
  if (specialization === 'HT' && p.role_code === 'PP_HT') return true;
  if (specialization === 'XLN' && p.role_code === 'PP_XLN') return true;
  return false;
}
