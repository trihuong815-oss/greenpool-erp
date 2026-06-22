// PR-PROMO1A (2026-06-22) — UI permission helpers cho /chuong-trinh.
//
// MIRROR server-side rules (lib/permissions.ts + app/api/sales-v2/programs/*).
// UI helper KHÔNG thay thế server check — chỉ ẩn/hiện nút đúng để user không
// click nhầm. Server endpoint vẫn enforce qua getAuthedCaller + canConfigure/
// currentApprover/createdBy === uid.
//
// Read-only roles: CEO, CHU_TICH, TP_GS — luôn trả false cho mọi mutation.
// ADMIN: KHÔNG nằm trong read-only nhưng cũng KHÔNG match QLCS/approver/accountant
// → các helper trả false → UI không hiện nút workflow. ADMIN giữ quyền kỹ thuật
// qua trang khác (vd Audit History, override flow tương lai).

import type { SalesProgram } from '@/lib/types/sales-program';

/** Top role chỉ xem, KHÔNG thao tác workflow nghiệp vụ. */
const READ_ONLY_ROLES: ReadonlySet<string> = new Set([
  'CEO',
  'CHU_TICH',
  'TP_GS',
]);

/** True nếu role chỉ xem — block mọi mutation UI button. */
export function isPromoReadOnlyRole(roleCode: string | null | undefined): boolean {
  if (!roleCode) return false;
  return READ_ONLY_ROLES.has(roleCode);
}

/** QLCS_HM, QLCS_TK,... — quy ước prefix khớp role-block KD scope (xem permissions.ts). */
function isQLCS(roleCode: string): boolean {
  return roleCode.startsWith('QLCS_');
}

/** TP_KE (toàn hệ thống) hoặc NV_KE cùng branch với program. */
function isAccountantForBranch(roleCode: string, callerBranch: string | null, programBranch: string): boolean {
  if (roleCode === 'TP_KE') return true;
  if (roleCode === 'NV_KE') return callerBranch === programBranch;
  return false;
}

// ─── Mutation capability checks ─────────────────────────────────────────────

/** Chỉ QLCS được tạo. CEO/CHU_TICH/TP_GS read-only → false. */
export function canCreateProgram(roleCode: string | null | undefined): boolean {
  if (!roleCode) return false;
  if (isPromoReadOnlyRole(roleCode)) return false;
  return isQLCS(roleCode);
}

/** Chỉ creator (QLCS) submit được. Status phải là draft hoặc rejected (gửi lại). */
export function canSubmitProgram(
  roleCode: string | null | undefined,
  callerUid: string,
  program: Pick<SalesProgram, 'createdBy' | 'status'>,
): boolean {
  if (!roleCode || !callerUid) return false;
  if (isPromoReadOnlyRole(roleCode)) return false;
  if (program.createdBy !== callerUid) return false;
  return program.status === 'draft' || program.status === 'rejected';
}

/** Chỉ creator được edit khi draft hoặc rejected. */
export function canEditProgram(
  roleCode: string | null | undefined,
  callerUid: string,
  program: Pick<SalesProgram, 'createdBy' | 'status'>,
): boolean {
  if (!roleCode || !callerUid) return false;
  if (isPromoReadOnlyRole(roleCode)) return false;
  if (program.createdBy !== callerUid) return false;
  return program.status === 'draft' || program.status === 'rejected';
}

/** Chỉ creator được xóa khi draft + chưa có tx áp dụng. */
export function canDeleteProgram(
  roleCode: string | null | undefined,
  callerUid: string,
  program: Pick<SalesProgram, 'createdBy' | 'status' | 'usageCount'>,
): boolean {
  if (!roleCode || !callerUid) return false;
  if (isPromoReadOnlyRole(roleCode)) return false;
  if (program.createdBy !== callerUid) return false;
  if (program.status !== 'draft') return false;
  return (program.usageCount ?? 0) === 0;
}

/** Chỉ currentApprover được duyệt khi status='pending_approval'. */
export function canApproveProgram(
  roleCode: string | null | undefined,
  callerUid: string,
  program: Pick<SalesProgram, 'status' | 'currentApprover'>,
): boolean {
  if (!roleCode || !callerUid) return false;
  if (isPromoReadOnlyRole(roleCode)) return false;
  if (program.status !== 'pending_approval') return false;
  return program.currentApprover === callerUid;
}

/** Cùng điều kiện approve — currentApprover được reject. */
export function canRejectProgram(
  roleCode: string | null | undefined,
  callerUid: string,
  program: Pick<SalesProgram, 'status' | 'currentApprover'>,
): boolean {
  return canApproveProgram(roleCode, callerUid, program);
}

/** TP_KE all branches OR NV_KE same branch — set promoCode khi status='approved'. */
export function canConfigureProgram(
  roleCode: string | null | undefined,
  callerBranch: string | null | undefined,
  program: Pick<SalesProgram, 'status' | 'branchId'>,
): boolean {
  if (!roleCode) return false;
  if (isPromoReadOnlyRole(roleCode)) return false;
  if (!isAccountantForBranch(roleCode, callerBranch ?? null, program.branchId)) return false;
  // Cho phép cấu hình khi approved (lần đầu) hoặc khi đã active/paused (đổi lại mã)
  return ['approved', 'active', 'paused'].includes(program.status);
}

/** Toggle active ↔ paused — chỉ accountant. Status phải active hoặc paused. */
export function canToggleProgram(
  roleCode: string | null | undefined,
  callerBranch: string | null | undefined,
  program: Pick<SalesProgram, 'status' | 'branchId'>,
): boolean {
  if (!roleCode) return false;
  if (isPromoReadOnlyRole(roleCode)) return false;
  if (!isAccountantForBranch(roleCode, callerBranch ?? null, program.branchId)) return false;
  return program.status === 'active' || program.status === 'paused';
}

// ─── Step computation (cho query param `?step=gd_kd|gd_vp`) ─────────────────

/** Bước duyệt hiện tại: 'gd_kd' (step 1) | 'gd_vp' (step 2) | null (không pending).
 *  approvalSteps.length = số bước ĐÃ duyệt. 0 = chưa ai duyệt → đang chờ GD_KD.
 *  1 = GD_KD đã duyệt → đang chờ GD_VP. 2+ = đã xong cả 2 bước. */
export function getCurrentApprovalStep(
  program: Pick<SalesProgram, 'status' | 'approvalSteps'>,
): 'gd_kd' | 'gd_vp' | null {
  if (program.status !== 'pending_approval') return null;
  // Chỉ count step 'approved' (reject không tăng step, nó kết thúc luôn).
  const approvedSteps = (program.approvalSteps ?? []).filter((s) => s.action === 'approved').length;
  if (approvedSteps === 0) return 'gd_kd';
  if (approvedSteps === 1) return 'gd_vp';
  return null;
}
