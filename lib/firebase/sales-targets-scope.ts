// Scope cho salesTargets:
//
// PR-TK3B (2026-06-21) — Refactor permission để match nghiệp vụ anh chốt cho module
// chỉ tiêu doanh số:
//   - ADMIN/CEO/CHU_TICH/GD_KD: sửa monthTargets + staffTargets tất cả branches
//   - GD_VP/TP_KE: VIEW ONLY trong giai đoạn này (anh chốt "chưa sửa")
//   - TP_GS: VIEW ONLY (giám sát)
//   - QLCS_*: sửa staffTargets branch mình, KHÔNG sửa monthTargets
//   - NV_KE/NV_SALE/NV_SALE_PT: VIEW ONLY
//
// TRƯỚC PR-TK3B helper dùng isWriteAdmin = [ADMIN, GD_KD, GD_VP] (đã loại CEO).
// Sau PR-TK3B: dùng SALES_TARGET_WRITE_ROLES riêng = [ADMIN, CEO, CHU_TICH, GD_KD].
// → Đảm bảo target permission KHÔNG bị ảnh hưởng nếu sau này isWriteAdmin thay đổi
//   (vd cho module khác mở rộng).

import { isQLCS, type CallerProfile } from './checklist-scope';
import { isAdmin, isTP } from './checklist-scope';

// Phase B.1: BRANCH_IDS single source of truth.
import { BRANCH_IDS } from '@/lib/branches';
const ALL_BRANCHES = BRANCH_IDS;

/** Role được sửa monthTargets/yearTarget/leadTargets cấp cơ sở. */
const SALES_TARGET_WRITE_ROLES = new Set(['ADMIN', 'CEO', 'CHU_TICH', 'GD_KD']);

/** PR-TK3B: helper riêng cho sales target — KHÔNG delegate isWriteAdmin để tránh
 *  thay đổi vô tình ảnh hưởng module khác. CEO + CHU_TICH explicit có quyền per spec. */
function isSalesTargetWriter(p: CallerProfile): boolean {
  return SALES_TARGET_WRITE_ROLES.has(p.role_code);
}

export function canReadTargets(p: CallerProfile): boolean {
  return !!p.uid;
}

export function targetsFilterForList(p: CallerProfile): { branchIds: string[] | null } {
  if (isAdmin(p) || isTP(p)) return { branchIds: null };
  if (p.facility_id) return { branchIds: [p.facility_id] };
  return { branchIds: [] };
}

/** Write full target (yearTarget, monthTargets, leadTargets).
 *  PR-TK3B (2026-06-21): ADMIN + CEO + CHU_TICH + GD_KD (per nghiệp vụ chốt).
 *  GD_VP/TP_KE/TP_GS: VIEW ONLY giai đoạn này. */
export function canWriteTarget(p: CallerProfile, branchId: string): boolean {
  return isSalesTargetWriter(p) && (ALL_BRANCHES as readonly string[]).includes(branchId);
}

/** Write staffTargets only (per-sale per-month).
 *  PR-TK3B: same writer set + QLCS for own branch. */
export function canWriteStaffTargets(p: CallerProfile, branchId: string): boolean {
  if (!(ALL_BRANCHES as readonly string[]).includes(branchId)) return false;
  if (isSalesTargetWriter(p)) return true;
  if (isQLCS(p) && p.facility_id === branchId) return true;
  return false;
}
