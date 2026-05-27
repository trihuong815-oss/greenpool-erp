// PATCH /api/admin/users/[uid] — update user: status, email, displayName, role, branch, phone, isProbation, password
//
// Caller phải có quyền users module + scope-check role mới (chỉ tạo/sửa role thấp hơn mình).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminAuth, getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { canAccessRoute } from '@/lib/permissions';
import { getCurrentProfile } from '@/lib/firebase/current-profile';

const VALID_STATUS = new Set(['active', 'inactive']);

interface RoleRow {
  code: string;
  tier: number;
  block_id: string | null;
  dept_id: string | null;
}

async function loadRole(db: FirebaseFirestore.Firestore, code: string): Promise<RoleRow | null> {
  const s = await db.collection(COLLECTIONS.ROLES).doc(code).get();
  if (!s.exists) return null;
  const x = s.data()!;
  return { code: x.code ?? s.id, tier: x.tier ?? 99, block_id: x.block_id ?? null, dept_id: x.dept_id ?? null };
}

function canAssignRole(caller: RoleRow, target: RoleRow, callerFacilityId: string | null, targetFacilityId: string | null): { ok: true } | { ok: false; reason: string } {
  if (caller.code === 'ADMIN') return { ok: true };
  if (target.tier <= caller.tier) return { ok: false, reason: 'Không được gán vai trò ngang hoặc cao hơn mình.' };
  if (caller.code === 'GD_KD' && target.block_id !== 'KD') return { ok: false, reason: 'GĐ KD chỉ gán user khối KD.' };
  if (caller.code === 'GD_VP' && target.block_id !== 'VP') return { ok: false, reason: 'GĐ VP chỉ gán user khối VP.' };
  if (caller.code.startsWith('QLCS_')) {
    if (!callerFacilityId) return { ok: false, reason: 'QLCS chưa gắn cơ sở.' };
    if (targetFacilityId !== callerFacilityId) return { ok: false, reason: 'QLCS chỉ gán user cùng cơ sở.' };
    if (target.block_id !== 'KD') return { ok: false, reason: 'QLCS chỉ gán user khối KD.' };
  }
  if (caller.code.startsWith('TP_') || caller.code === 'TIBAN_TT') {
    if (target.dept_id !== caller.dept_id) return { ok: false, reason: 'TP chỉ gán user cùng phòng.' };
  }
  return { ok: true };
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ uid: string }> },
) {
  const callerCtx = await getCurrentProfile();
  if (!callerCtx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  if (!canAccessRoute(callerCtx.profile.roleCode, 'users')) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  }

  const { uid } = await ctx.params;
  const body = await req.json();

  const db = getFirebaseAdminDb();
  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) return NextResponse.json({ error: 'User không tồn tại' }, { status: 404 });
  const before = snap.data() ?? {};

  // Self-edit guard: không tự đổi status của mình.
  if (uid === callerCtx.profile.id && body.status !== undefined && body.status !== before.status) {
    return NextResponse.json({ error: 'Không thể tự đổi status của mình.' }, { status: 400 });
  }
  // Self-edit guard: không tự đổi role của mình.
  if (uid === callerCtx.profile.id && body.role_code !== undefined && body.role_code !== before.roleId) {
    return NextResponse.json({ error: 'Không thể tự đổi vai trò của mình.' }, { status: 400 });
  }

  // Caller role (scope check)
  const callerRole = await loadRole(db, callerCtx.profile.roleCode);
  if (!callerRole) return NextResponse.json({ error: 'Vai trò caller không hợp lệ.' }, { status: 403 });

  // Nếu có thay đổi role hoặc facility — scope check
  const newRoleCode = typeof body.role_code === 'string' ? body.role_code : undefined;
  const newFacilityRaw = body.facility_id;
  const newFacility = newFacilityRaw === undefined ? undefined : (newFacilityRaw === null || newFacilityRaw === '' ? null : String(newFacilityRaw));

  let newRole: RoleRow | null = null;
  if (newRoleCode && newRoleCode !== before.roleId) {
    newRole = await loadRole(db, newRoleCode);
    if (!newRole) return NextResponse.json({ error: 'Vai trò đích không tồn tại.' }, { status: 400 });
    const targetFac = newFacility !== undefined ? newFacility : (before.branchId ?? null);
    const scope = canAssignRole(callerRole, newRole, callerCtx.profile.branchId ?? null, targetFac);
    if (!scope.ok) return NextResponse.json({ error: scope.reason }, { status: 403 });
  }

  // Build Firestore patch
  const patch: Record<string, unknown> = {};

  if (typeof body.status === 'string') {
    if (!VALID_STATUS.has(body.status)) return NextResponse.json({ error: 'status không hợp lệ' }, { status: 400 });
    patch.status = body.status;
  }
  if (typeof body.full_name === 'string') {
    const name = body.full_name.trim();
    if (!name) return NextResponse.json({ error: 'Họ tên không được rỗng' }, { status: 400 });
    patch.displayName = name;
  }
  if (typeof body.phone === 'string' || body.phone === null) {
    patch.phone = body.phone ? String(body.phone).trim() : null;
  }
  if (typeof body.is_probation === 'boolean') patch.isProbation = body.is_probation;

  // menuOverrides — chỉ ADMIN cấp/thu hồi quyền truy cập module per-user.
  if (body.menuOverrides !== undefined) {
    if (callerCtx.profile.roleCode !== 'ADMIN') {
      return NextResponse.json({ error: 'Chỉ ADMIN được cấp/thu hồi quyền per-user' }, { status: 403 });
    }
    if (body.menuOverrides === null) {
      patch.menuOverrides = {};
    } else if (typeof body.menuOverrides === 'object') {
      const sanitized: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(body.menuOverrides)) {
        if (typeof v === 'boolean' && typeof k === 'string' && k.length > 0 && k.length <= 60) {
          sanitized[k] = v;
        }
      }
      patch.menuOverrides = sanitized;
    } else {
      return NextResponse.json({ error: 'menuOverrides phải là object { route: boolean }' }, { status: 400 });
    }
  }

  // Email change — verify available + update Firebase Auth
  let newEmailNormalized: string | null = null;
  if (typeof body.email === 'string') {
    const newEmail = body.email.trim().toLowerCase();
    if (!newEmail) return NextResponse.json({ error: 'Email không được rỗng' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 });
    if (newEmail !== (before.email ?? '')) {
      // Check trùng
      try {
        const other = await getFirebaseAdminAuth().getUserByEmail(newEmail);
        if (other.uid !== uid) return NextResponse.json({ error: 'Email đã được dùng bởi user khác' }, { status: 409 });
      } catch { /* not found → OK */ }
      newEmailNormalized = newEmail;
      patch.email = newEmail;
    }
  }

  // Role + facility patch
  if (newRole) {
    patch.roleId = newRole.code;
    patch.departmentId = newRole.dept_id;
    patch.blockId = newRole.block_id;
    patch.roleLevel = newRole.tier;
    // Denorm department name
    if (newRole.dept_id) {
      const dSnap = await db.collection(COLLECTIONS.DEPARTMENTS).doc(newRole.dept_id).get();
      patch.departmentName = dSnap.exists ? (dSnap.data()?.name ?? null) : null;
    } else {
      patch.departmentName = null;
    }
  }
  if (newFacility !== undefined && newFacility !== before.branchId) {
    patch.branchId = newFacility;
    if (newFacility) {
      const bSnap = await db.collection(COLLECTIONS.BRANCHES).doc(newFacility).get();
      patch.branchName = bSnap.exists ? (bSnap.data()?.name ?? null) : null;
    } else {
      patch.branchName = null;
    }
  }

  // Password change
  const newPassword = typeof body.password === 'string' && body.password.trim().length >= 6 ? body.password.trim() : null;

  if (Object.keys(patch).length === 0 && !newEmailNormalized && !newPassword) {
    return NextResponse.json({ error: 'Không có field hợp lệ để cập nhật' }, { status: 400 });
  }

  const now = new Date();
  await userRef.update({ ...patch, updatedAt: now, updatedBy: callerCtx.profile.id });

  // Firebase Auth side-effects
  const auth = getFirebaseAdminAuth();
  try {
    const updateAuth: { email?: string; password?: string; displayName?: string; disabled?: boolean } = {};
    if (newEmailNormalized) updateAuth.email = newEmailNormalized;
    if (newPassword) updateAuth.password = newPassword;
    if (typeof body.full_name === 'string') updateAuth.displayName = String(body.full_name).trim();
    if (typeof body.status === 'string') updateAuth.disabled = body.status === 'inactive';
    if (Object.keys(updateAuth).length > 0) await auth.updateUser(uid, updateAuth);
    // Re-set custom claims khi đổi role/facility
    if (newRole || newFacility !== undefined) {
      await auth.setCustomUserClaims(uid, {
        role: (patch.roleId as string | undefined) ?? before.roleId ?? null,
        branchId: (patch.branchId as string | null | undefined) ?? (before.branchId ?? null),
        departmentId: (patch.departmentId as string | null | undefined) ?? (before.departmentId ?? null),
      });
    }
  } catch (e: any) {
    console.error('[users PATCH] auth side-effect:', e?.message);
    return NextResponse.json({ error: 'Lỗi cập nhật Firebase Auth: ' + (e?.message ?? '') }, { status: 500 });
  }

  await writeAuditLog({
    action: 'update_user',
    module: 'users',
    userId: callerCtx.profile.id,
    branchId: ((patch.branchId as string | null) ?? (before.branchId as string | null) ?? null),
    before,
    after: { id: uid, ...patch, passwordReset: !!newPassword },
    actorName: callerCtx.profile.displayName,
    actorRole: callerCtx.profile.roleName ?? callerCtx.profile.roleCode,
    source: 'api',
  });

  return NextResponse.json({ ok: true });
}
