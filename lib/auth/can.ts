// Phase B.4 (2026-06-07): Declarative permission matrix `can(role, action, resource?)`.
// Goal: tách permission declaration ra khỏi imperative code rải rác.
// Future migration: UI conditionals + API guards reference matrix duy nhất này.
//
// Áp dụng dần: New code dùng can(). Existing code giữ logic cũ, migrate khi đụng.

import { isTopAdmin, isCEO, isAdminSystem, isGD, isTP, isQLCS, isWriteAdmin, hasRole } from './roles';
import type { BranchId } from '../branches';

/** Action domain: liệt kê chính xác mọi mutation/read user có thể thực hiện. */
export type Action =
  // Tasks (Đề xuất + Giao việc)
  | 'task:create_proposal'
  | 'task:create_assignment'
  | 'task:approve'
  | 'task:reject'
  | 'task:cancel'
  | 'task:update_status'
  | 'task:request_revision'
  // Sales (Doanh số)
  | 'sales:create_entry'
  | 'sales:edit_entry'
  | 'sales:delete_entry'
  | 'sales:view_all_facilities'
  | 'sales:set_target'
  // Users
  | 'users:create'
  | 'users:edit_role'
  | 'users:disable'
  | 'users:reset_password'
  // Checklist
  | 'checklist:submit'
  | 'checklist:supervisor_view'
  | 'checklist:approve_run'
  // Settings
  | 'settings:edit_packages'
  | 'settings:edit_branches'
  | 'settings:view_audit_log'
  | 'settings:view_system_errors';

/** Resource context (optional) — vd branch, dept của resource bị action. */
export interface Resource {
  branchId?: BranchId | null;
  departmentId?: string | null;
  createdBy?: string | null;
}

interface User {
  roleCode: string;
  uid: string;
  branchId?: BranchId | null;
  departmentId?: string | null;
}

/**
 * Trung tâm permission matrix.
 * Return true nếu user được phép thực hiện action trên resource (nếu có).
 *
 * RULES (sorted by action category):
 * - task:* — chain Phase 12.5+ logic là chính (chain entry user:UID/role:RC); helper này
 *   chỉ check QUYỀN BAN ĐẦU để tạo/duyệt task (không thay thế chain).
 * - sales:* — branch-scoped; admin/GD/TP cross-facility.
 * - users:* — chỉ TopAdmin + GD.
 * - checklist:* — supervisor by role/scope; submitter là assigned_to user.
 * - settings:* — chủ yếu TopAdmin; vài action GD được phép.
 */
export function can(user: User, action: Action, resource?: Resource): boolean {
  const { roleCode } = user;

  switch (action) {
    // ─── TASKS ───
    case 'task:create_proposal':
      // Mọi role tier ≥3 có thể tạo đề xuất (TP/QLCS/GD/ADMIN). NV không.
      return isWriteAdmin(roleCode) || isTP(roleCode) || isQLCS(roleCode);

    case 'task:create_assignment':
      // Chỉ admin/GD tạo giao việc (top-down). TP/QLCS bị chặn (anh chốt Phase 12.8).
      return isWriteAdmin(roleCode);

    case 'task:approve':
    case 'task:reject':
      // Chỉ TopAdmin + GD + (chain entry user/role match). Chain check riêng ở canApproveTask.
      return isWriteAdmin(roleCode);

    case 'task:cancel':
      // Creator hoặc TopAdmin/GD.
      return resource?.createdBy === user.uid || isWriteAdmin(roleCode);

    case 'task:update_status':
      // Assignee hoặc creator hoặc top admin.
      return isTopAdmin(roleCode) || resource?.createdBy === user.uid; // assignee check riêng ở scope

    case 'task:request_revision':
      // Assignee gửi yêu cầu bổ sung. Top admin bypass.
      return isTopAdmin(roleCode); // assignee check riêng ở scope

    // ─── SALES ───
    case 'sales:create_entry':
    case 'sales:edit_entry':
      // QLCS chỉ branch mình; admin/GD any branch.
      if (isWriteAdmin(roleCode)) return true;
      if (isQLCS(roleCode) && resource?.branchId && resource.branchId === user.branchId) return true;
      return false;

    case 'sales:delete_entry':
      return isWriteAdmin(roleCode);

    case 'sales:view_all_facilities':
      return isWriteAdmin(roleCode) || isTP(roleCode);

    case 'sales:set_target':
      return isWriteAdmin(roleCode);

    // ─── USERS ───
    case 'users:create':
    case 'users:disable':
    case 'users:reset_password':
      return isWriteAdmin(roleCode);

    case 'users:edit_role':
      // Edit role là CRITICAL — chỉ TopAdmin (CEO + ADMIN), KHÔNG GD.
      return isTopAdmin(roleCode);

    // ─── CHECKLIST ───
    case 'checklist:submit':
      // Mọi user signed-in có thể submit checklist của ca mình (scope ở rules).
      return true;

    case 'checklist:supervisor_view':
      return isWriteAdmin(roleCode) || isTP(roleCode) || isQLCS(roleCode);

    case 'checklist:approve_run':
      return isWriteAdmin(roleCode) || isQLCS(roleCode);

    // ─── SETTINGS ───
    case 'settings:edit_packages':
      return isWriteAdmin(roleCode);

    case 'settings:edit_branches':
      return isTopAdmin(roleCode);

    case 'settings:view_audit_log':
    case 'settings:view_system_errors':
      return isTopAdmin(roleCode);

    default: {
      // Exhaustive check — TS sẽ báo error nếu thiếu case khi anh thêm Action mới.
      const _exhaustive: never = action;
      void _exhaustive;
      return false;
    }
  }
}

// Convenience: expose role helpers từ same module.
export { isTopAdmin, isCEO, isAdminSystem, isGD, isTP, isQLCS, isWriteAdmin, hasRole };
