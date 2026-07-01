// Server helper: lấy current user + profile từ Firestore `users/{uid}` cho page server.
// Replace pattern cũ: supabase.auth.getUser() + supabase.from('profiles')...
//
// 2026-06-30 HOTFIX: structured logging cho mọi null-return path +
// requireAuthedProfile redirect cause. Trước đây mọi null silent → user bị kick
// `/login` không biết tại sao. Cloud Run logs giờ ghi rõ:
//   - 'no-session-cookie' — chưa login / cookie expired/revoked
//   - 'no-user-doc' — Auth có account nhưng users/{uid} doc missing
//   - 'status-inactive' — doc có nhưng status='inactive'
//   - 'firestore-throw' — exception từ Firestore read
// Để debug bug "vào /tong-ket bị out login" mà error.tsx 2026-06-19 chỉ wrap.

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

/**
 * 2026-06-30 HOTFIX: structured reason cho debug. Caller dùng để log + decide
 * UX (vd inactive → show "Tài khoản đã bị tắt" page thay vì silent /login redirect).
 */
export type ProfileFailReason =
  | 'no-session-cookie'        // getCurrentUser returned null (cookie missing/invalid/revoked)
  | 'no-user-doc'              // Firestore users/{uid} doc không tồn tại
  | 'status-inactive'          // doc tồn tại nhưng status='inactive'
  | 'firestore-throw';         // exception đọc Firestore (transient/permission)

export interface ProfileResult {
  user: CurrentUser;
  profile: UserProfile;
}

export interface ProfileFail {
  reason: ProfileFailReason;
  /** Email nếu biết — for log/UX (KHÔNG bao giờ leak ra response 200). */
  email?: string | null;
  /** UID nếu biết. */
  uid?: string | null;
  /** Chi tiết exception khi reason='firestore-throw' — sanitized. */
  errorMessage?: string;
}

/**
 * Internal helper. Trả về Result hoặc Fail. Caller có thể log/handle fail.
 * Public APIs giữ contract cũ (return null OR redirect) cho backward compat.
 */
async function loadProfileOrFail(): Promise<ProfileResult | ProfileFail> {
  const user = await getCurrentUser();
  if (!user) {
    return { reason: 'no-session-cookie' };
  }

  try {
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.USERS).doc(user.uid).get();
    if (!snap.exists) {
      return { reason: 'no-user-doc', uid: user.uid, email: user.email ?? null };
    }
    const d = snap.data()!;
    if (d.status === 'inactive') {
      return {
        reason: 'status-inactive',
        uid: user.uid,
        email: user.email ?? d.email ?? null,
      };
    }

    // Lookup role name từ roles collection (nếu có)
    let roleName: string | null = null;
    if (d.roleId) {
      try {
        const rSnap = await db.collection(COLLECTIONS.ROLES).doc(d.roleId).get();
        if (rSnap.exists) roleName = rSnap.data()?.name ?? null;
      } catch { /* ignore — non-critical */ }
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
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    return {
      reason: 'firestore-throw',
      uid: user.uid,
      email: user.email ?? null,
      errorMessage: msg.slice(0, 300),
    };
  }
}

function isFail(r: ProfileResult | ProfileFail): r is ProfileFail {
  return (r as ProfileFail).reason !== undefined;
}

/**
 * Backward-compat API: returns null hoặc result.
 *
 * 2026-06-30 HOTFIX: structured log mỗi lần null để debug ra Cloud Run.
 * KHÔNG đổi return type (callers vẫn check `if (!r)`).
 */
export async function getCurrentProfile(): Promise<ProfileResult | null> {
  const r = await loadProfileOrFail();
  if (isFail(r)) {
    // eslint-disable-next-line no-console
    console.warn(
      '[getCurrentProfile] FAIL — reason=' + r.reason
      + ' uid=' + (r.uid ?? 'none')
      + ' email=' + (r.email ?? 'none')
      + (r.errorMessage ? ' err=' + r.errorMessage : ''),
    );
    return null;
  }
  return r;
}

/**
 * Throws 'redirect /login' nếu profile load fail.
 *
 * 2026-06-30 HOTFIX: log redirect cause (email + reason) ngay trước redirect.
 * Trước đây silent → user kick to /login không debug được.
 */
export async function requireAuthedProfile(): Promise<ProfileResult> {
  const r = await loadProfileOrFail();
  if (isFail(r)) {
    // eslint-disable-next-line no-console
    console.warn(
      '[requireAuthedProfile] REDIRECT /login — reason=' + r.reason
      + ' uid=' + (r.uid ?? 'none')
      + ' email=' + (r.email ?? 'none')
      + (r.errorMessage ? ' err=' + r.errorMessage : ''),
    );
    // 2026-07-01 HOTFIX: pass reason to /login so user sees WHY they were kicked.
    // Login page renders friendly banner based on ?reason= query param.
    redirect('/login?reason=' + encodeURIComponent(r.reason));
  }
  return r;
}

/**
 * NEW 2026-06-30 HOTFIX: expose structured result cho caller cần custom UX.
 * Vd: layout có thể show "Tài khoản đã bị tắt" page thay vì /login loop.
 * Backward-compat: caller cũ KHÔNG bắt buộc dùng — chỉ dùng nếu cần handle
 * inactive status differently than 'no session'.
 */
export async function loadCurrentProfileResult(): Promise<ProfileResult | ProfileFail> {
  return loadProfileOrFail();
}
