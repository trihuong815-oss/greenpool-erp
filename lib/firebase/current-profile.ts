// Server helper: lấy current user + profile từ Firestore `users/{uid}` cho page server.
// Replace pattern cũ: supabase.auth.getUser() + supabase.from('profiles')...

import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from './session-auth';
import { getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';

export interface UserProfile {
  id: string;                                   // uid
  email: string;
  displayName: string;
  roleCode: string;                             // tương đương profile.role_code cũ
  branchId: string | null;                      // facility_id
  departmentId: string | null;
  shiftAssignment: string | null;
  isSharedShiftAccount: boolean;
  status: string;                               // 'active' | 'inactive'
  /** Chỉ áp dụng KT_XLN_CTT — danh sách bể phụ trách: 'indoor' | 'outdoor' | 'kid'. */
  subAreas: string[];
  /** ADMIN cấp/thu hồi quyền truy cập module per-user. `{ route: true | false }`.
   *  Missing key → fallback theo MENU_PERMISSIONS của role. */
  menuOverrides: Record<string, boolean>;
  // ─── Phase 9 — Không gian cá nhân (Quản lý công việc cá nhân) ───
  /** URL ảnh đại diện (Firebase Storage). Owner-only. */
  avatarUrl: string | null;
  /** Slogan động lực hiển thị ở header cá nhân. Owner-only. */
  workSlogan: string | null;
  /** Chức danh tự khai (vd. "Trưởng phòng Kỹ thuật"). Khác roleId — roleId admin set, positionTitle user tự ghi. */
  positionTitle: string | null;
  // Cosmetic denorm:
  branchName: string | null;
  departmentName: string | null;
  roleName: string | null;
}

export async function getCurrentProfile(): Promise<{ user: CurrentUser; profile: UserProfile } | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTIONS.USERS).doc(user.uid).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  if (d.status === 'inactive') return null;

  // Lookup role name từ roles collection (nếu có)
  let roleName: string | null = null;
  if (d.roleId) {
    try {
      const rSnap = await db.collection(COLLECTIONS.ROLES).doc(d.roleId).get();
      if (rSnap.exists) roleName = rSnap.data()?.name ?? null;
    } catch { /* ignore */ }
  }

  return {
    user,
    profile: {
      id: user.uid,
      email: d.email ?? user.email ?? '',
      displayName: d.displayName ?? '',
      roleCode: d.roleId ?? user.role ?? '',
      branchId: d.branchId ?? user.branchId ?? null,
      departmentId: d.departmentId ?? user.departmentId ?? null,
      shiftAssignment: d.shiftAssignment ?? null,
      isSharedShiftAccount: !!d.isSharedShiftAccount,
      status: d.status ?? 'active',
      subAreas: Array.isArray(d.subAreas)
        ? d.subAreas.filter((s: unknown): s is string => s === 'indoor' || s === 'outdoor' || s === 'kid')
        : [],
      menuOverrides: d.menuOverrides && typeof d.menuOverrides === 'object'
        ? Object.fromEntries(
            Object.entries(d.menuOverrides).filter(([, v]) => typeof v === 'boolean')
          ) as Record<string, boolean>
        : {},
      avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : null,
      workSlogan: typeof d.workSlogan === 'string' ? d.workSlogan : null,
      positionTitle: typeof d.positionTitle === 'string' ? d.positionTitle : null,
      branchName: d.branchName ?? null,
      departmentName: d.departmentName ?? null,
      roleName,
    },
  };
}

export async function requireAuthedProfile(): Promise<{ user: CurrentUser; profile: UserProfile }> {
  const r = await getCurrentProfile();
  if (!r) redirect('/login');
  return r;
}
