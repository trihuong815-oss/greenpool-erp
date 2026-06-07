// Phase B.2 (2026-06-07): Canonical User types.
// Schema CHÍNH THỨC từ Phase 4 (Supabase → Firebase): camelCase, roleId, branchId, departmentId.
// Trước đây Profile interface có 3 nơi: lib/types.ts (legacy snake_case), inline ở 3 file giao-viec.

import type { BranchId } from '../branches';

/** UserDoc canonical — schema Firestore `users/{uid}`. */
export interface UserDoc {
  id: string;                                  // = Firebase Auth uid
  email: string;
  displayName: string;
  phone?: string;
  roleId: string;                              // canonical role code (vd 'GD_KD', 'NV_SALE')
  roleName?: string;                           // tên tiếng Việt (denormalized cho display)
  branchId?: BranchId | null;
  departmentId?: string | null;
  shiftAssignment?: string | null;             // 'morning' | 'afternoon' | 'evening'
  isSharedShiftAccount?: boolean;              // shared account dùng cho mọi ca
  status: 'active' | 'inactive';
  disabled?: boolean;
  createdAt?: string;                          // ISO
  updatedAt?: string;
  // FCM device management (Phase 13.9+)
  fcmDevices?: FcmDevice[];
  fcmTokens?: string[];                        // LEGACY — sẽ drop Phase B
  fcmTokensUpdatedAt?: string;
}

export interface FcmDevice {
  token: string;
  userAgent: string;
  label: string;
  createdAt: number;                           // ms epoch
  lastSeen: number;
  enabled: boolean;
}

/** Public user info (cho client list, avatar, mention) — KHÔNG include sensitive fields. */
export interface UserPublic {
  id: string;
  displayName: string;
  email: string;
  roleId: string;
  roleName?: string;
  branchId?: BranchId | null;
  departmentId?: string | null;
  status: 'active' | 'inactive';
}

/** Caller profile cho server-side scope check (đọc từ session cookie + Firestore). */
export interface CallerProfile {
  uid: string;
  email: string;
  displayName?: string;
  role_code: string;                           // snake_case backward compat (Phase B sẽ rename → roleCode)
  branch_id?: BranchId | null;
  department_id?: string | null;
  facility_id?: BranchId | null;               // alias = branch_id
  shift_assignment?: string | null;
  is_shared_shift_account?: boolean;
}
