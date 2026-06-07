// Phase B.4 (2026-06-07): Canonical role-check helpers.
// Audit MEDIUM #7: permission logic spread 4 layers — rules + scope helpers + API guard + UI.
// `isAdmin` defined với 3 semantic khác nhau ở 3 file → bug khi đổi quyền 1 role.
//
// Truth source ở đây. Mọi check role NEW dùng helper này.
// Existing helpers (checklist-scope.isAdmin, tasks-scope.isCEO, permissions.isQLCS, ...)
// sẽ migrate dần ở Phase B.4.1 — KHÔNG đổi semantic, chỉ alias re-export.
//
// Naming convention:
// - isXxx(roleCode: string)  — pure function, dùng cho UI client + server
// - hasRole(profile, ['X','Y']) — check profile có 1 trong N role
//
// ADMIN ≠ CEO (anh chốt Phase 12.9.1 2026-06-05):
// - ADMIN = quản trị IT/hệ thống. Trong cty business, ADMIN ≤ CEO/Chủ tịch.
// - CEO = lãnh đạo cao nhất business.
// - TOP_ADMIN = ADMIN + CEO (bypass mọi scope check ở data layer).

export type RoleCode = string;

/** ADMIN + CEO — bypass mọi scope check ở data layer (đọc/ghi mọi nơi). */
export function isTopAdmin(roleCode: string): boolean {
  return roleCode === 'CEO' || roleCode === 'ADMIN';
}

/** Lãnh đạo business cao nhất — KHÔNG bao gồm ADMIN IT. */
export function isCEO(roleCode: string): boolean {
  return roleCode === 'CEO';
}

/** ADMIN IT/hệ thống — bypass scope nhưng KHÔNG phải là lãnh đạo business. */
export function isAdminSystem(roleCode: string): boolean {
  return roleCode === 'ADMIN';
}

/** Giám đốc Khối — GD_KD hoặc GD_VP. KHÔNG bao gồm CEO/ADMIN. */
export function isGD(roleCode: string): boolean {
  return roleCode === 'GD_KD' || roleCode === 'GD_VP';
}

/** Trưởng phòng + tiểu ban tier 3. */
export function isTP(roleCode: string): boolean {
  return roleCode.startsWith('TP_') || roleCode === 'TIBAN_TT';
}

/** Quản lý cơ sở (QLCS_HM, QLCS_TK, ...). */
export function isQLCS(roleCode: string): boolean {
  return roleCode.startsWith('QLCS_');
}

/**
 * Quyền VIẾT cấp cao — TOP_ADMIN + GD Khối.
 * Dùng cho `canCreate*`, `canDelete*` ở scope helpers.
 */
export function isWriteAdmin(roleCode: string): boolean {
  return isTopAdmin(roleCode) || isGD(roleCode);
}

/**
 * Quyền ĐỌC business toàn cty — TOP_ADMIN + GD Khối + TP (cross-facility chuyên môn).
 */
export function canSeeAllFacilities(roleCode: string): boolean {
  return isWriteAdmin(roleCode) || isTP(roleCode);
}

/**
 * Check profile có 1 trong các role được phép.
 * Hữu ích cho permission matrix: hasRole(p, ['CEO','GD_KD','TP_KE']).
 */
export function hasRole(roleCode: string, allowedRoles: readonly string[]): boolean {
  return allowedRoles.includes(roleCode);
}
