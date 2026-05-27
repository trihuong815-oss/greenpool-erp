// Scope check cho checklist mutations.
// Phản chiếu firestore.rules — dùng ở API routes để verify quyền trước khi
// ghi qua Admin SDK (Admin bypass rules, phải tự check thủ công).
// Pure logic — không touch DB/auth, an toàn dùng cả server lẫn client/test.

export interface CallerProfile {
  uid: string;
  role_code: string;
  facility_id: string | null;
  department_id: string | null;
  shift_assignment: string | null;
  is_shared_shift_account: boolean;
  /** Chỉ áp dụng KT_XLN_CTT — bể phụ trách trong cơ sở (indoor/outdoor/kid). */
  sub_areas?: string[];
}

export interface InstanceForScope {
  facility_id: string | null;
  department_id: string | null;
  shift_type: string | null;
  assigned_to: string | null;
  status: string;
}

// ADMIN_ROLES (read-all): tất cả role thấy toàn hệ thống.
// WRITE_ADMIN_ROLES: subset có quyền ghi (CEO bị loại — view-only theo spec 2026-05-27).
const ADMIN_ROLES = new Set(['ADMIN', 'CEO', 'GD_KD', 'GD_VP']);
const WRITE_ADMIN_ROLES = new Set(['ADMIN', 'GD_KD', 'GD_VP']);
const TERMINAL_STATUSES = new Set(['submitted', 'approved', 'failed']);

/** Read-all admin: CEO + ADMIN + GD_KD + GD_VP. Bao gồm CEO (view-only top). */
export function isAdmin(p: CallerProfile): boolean {
  return ADMIN_ROLES.has(p.role_code);
}

/** Write admin: ADMIN + GD_KD + GD_VP. CEO bị loại (view-only — không CRUD). */
export function isWriteAdmin(p: CallerProfile): boolean {
  return WRITE_ADMIN_ROLES.has(p.role_code);
}

/** CEO/chủ đầu tư — view-only, chỉ giao việc cho GD Khối. */
export function isCEORole(p: CallerProfile): boolean {
  return p.role_code === 'CEO';
}

export function isQLCS(p: CallerProfile): boolean {
  return /^QLCS_/.test(p.role_code);
}

export function isTP(p: CallerProfile): boolean {
  return /^TP_/.test(p.role_code) || p.role_code === 'TIBAN_TT';
}

export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function matchesScope(p: CallerProfile, inst: InstanceForScope): boolean {
  if (isAdmin(p)) return true;
  if (isQLCS(p) && inst.facility_id === p.facility_id) return true;
  if (isTP(p) && inst.department_id === p.department_id) return true;
  if (inst.assigned_to === p.uid) return true;
  if (
    p.is_shared_shift_account &&
    inst.facility_id === p.facility_id &&
    inst.department_id === p.department_id &&
    inst.shift_type === p.shift_assignment
  ) {
    return true;
  }
  return false;
}

export function canApproveInstance(p: CallerProfile, inst: InstanceForScope): boolean {
  // CEO không có quyền duyệt (view-only) — dùng isWriteAdmin thay isAdmin.
  if (isWriteAdmin(p)) return true;
  if (isQLCS(p) && inst.facility_id === p.facility_id) return true;
  if (isTP(p) && inst.department_id === p.department_id) return true;
  return false;
}
