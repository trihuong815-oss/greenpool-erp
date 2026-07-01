// POST /api/admin/create-user
// Body: { email, full_name, phone?, role_code, facility_id?, is_probation?, password? }
//
// Phase 4.D: dùng Firebase Auth + Firestore `users` collection.
// - Auth: verify session cookie (đã set khi login).
// - Tạo Firebase Auth user (giữ uid mới sinh ra), set custom claims (role, branchId, departmentId).
// - Upsert Firestore `users/{uid}` với schema chuẩn.
// - Ghi audit log module='users'.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminAuth, getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
// PR-USER-HEALTH-VALIDATION (2026-07-01) — canonical role gate
import { validateUserConfig, UserConfigInvalidError } from '@/lib/auth/canonical-roles';

interface RoleRow {
  code: string;
  name: string;
  tier: number;
  block_id: string | null;
  dept_id: string | null;
}

interface RequestBody {
  email: string;
  full_name: string;
  phone?: string;
  role_code: string;
  facility_id?: string | null;
  is_probation?: boolean;
  password?: string;
}

function canCreateUsers(roleCode: string): boolean {
  // CEO loại trừ — view-only theo spec 2026-05-27.
  if (roleCode === 'ADMIN' || roleCode === 'GD_KD' || roleCode === 'GD_VP') return true;
  if (roleCode.startsWith('QLCS_')) return true;
  if (roleCode.startsWith('TP_') || roleCode === 'TIBAN_TT') return true;
  return false;
}

function isInScope(
  caller: RoleRow,
  callerFacilityId: string | null,
  target: RoleRow,
  targetFacilityId: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (caller.code === 'ADMIN') return { ok: true };
  if (target.tier <= caller.tier) {
    return { ok: false, reason: 'Không được tạo user cấp ngang hoặc cao hơn mình.' };
  }
  if (caller.code === 'GD_KD') {
    if (target.block_id !== 'KD') return { ok: false, reason: 'GĐ KD chỉ tạo user khối KD.' };
    return { ok: true };
  }
  if (caller.code === 'GD_VP') {
    if (target.block_id !== 'VP') return { ok: false, reason: 'GĐ VP chỉ tạo user khối VP.' };
    return { ok: true };
  }
  if (caller.code.startsWith('QLCS_')) {
    if (!callerFacilityId) return { ok: false, reason: 'QLCS chưa gắn cơ sở.' };
    if (targetFacilityId !== callerFacilityId) return { ok: false, reason: 'QLCS chỉ tạo user thuộc cơ sở mình.' };
    if (target.block_id !== 'KD') return { ok: false, reason: 'QLCS chỉ tạo user khối KD.' };
    return { ok: true };
  }
  if (caller.code.startsWith('TP_') || caller.code === 'TIBAN_TT') {
    if (!caller.dept_id) return { ok: false, reason: 'TP chưa gắn phòng.' };
    if (target.dept_id !== caller.dept_id) return { ok: false, reason: 'TP chỉ tạo user thuộc phòng mình.' };
    return { ok: true };
  }
  return { ok: false, reason: 'Vai trò không có quyền tạo user.' };
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'GP@' + s;
}

export async function POST(req: NextRequest) {
  // 1. Authenticate caller
  const callerCtx = await getCurrentProfile();
  if (!callerCtx) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  const callerProfile = callerCtx.profile;

  if (!canCreateUsers(callerProfile.roleCode)) {
    return NextResponse.json({ error: 'Vai trò của bạn không có quyền tạo user.' }, { status: 403 });
  }

  const db = getFirebaseAdminDb();

  // 2. Caller role detail
  const callerRoleSnap = await db.collection(COLLECTIONS.ROLES).doc(callerProfile.roleCode).get();
  if (!callerRoleSnap.exists) return NextResponse.json({ error: 'Vai trò caller không hợp lệ.' }, { status: 403 });
  const callerRoleData = callerRoleSnap.data()!;
  const callerRole: RoleRow = {
    code: callerRoleData.code ?? callerRoleSnap.id,
    name: callerRoleData.name ?? '',
    tier: callerRoleData.tier ?? 99,
    block_id: callerRoleData.block_id ?? null,
    dept_id: callerRoleData.dept_id ?? null,
  };

  // 3. Body
  let body: RequestBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Body không hợp lệ.' }, { status: 400 }); }

  const { email, full_name, phone, role_code, facility_id, is_probation, password } = body;
  if (!email || !full_name || !role_code) {
    return NextResponse.json({ error: 'Thiếu email, họ tên hoặc vai trò.' }, { status: 400 });
  }
  const normalizedEmail = email.trim().toLowerCase();

  // PR-USER-HEALTH-VALIDATION (2026-07-01): CANONICAL role + branch gate.
  // Prevents accidental "QLCS_24" (missing NCT suffix) and similar typos —
  // root cause of the 2026-06-30 "QLCS không vào được /tong-ket" bug.
  const validationCreate = validateUserConfig({
    roleCode: role_code,
    branchId: facility_id ?? null,
    status: 'active',
  });
  if (!validationCreate.ok) {
    return NextResponse.json(
      {
        error: 'Cấu hình role/branch không hợp lệ — không tạo được user.',
        issues: validationCreate.issues,
        hints: validationCreate.hints,
      },
      { status: 400 },
    );
  }

  // 4. Target role
  const targetRoleSnap = await db.collection(COLLECTIONS.ROLES).doc(role_code).get();
  if (!targetRoleSnap.exists) return NextResponse.json({ error: 'Vai trò đích không hợp lệ.' }, { status: 400 });
  const trd = targetRoleSnap.data()!;
  const targetRole: RoleRow = {
    code: trd.code ?? targetRoleSnap.id,
    name: trd.name ?? '',
    tier: trd.tier ?? 99,
    block_id: trd.block_id ?? null,
    dept_id: trd.dept_id ?? null,
  };

  // 5. Scope check
  const scope = isInScope(callerRole, callerProfile.branchId, targetRole, facility_id ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.reason }, { status: 403 });

  // 6. Denorm names
  const [deptSnap, branchSnap] = await Promise.all([
    targetRole.dept_id ? db.collection(COLLECTIONS.DEPARTMENTS).doc(targetRole.dept_id).get() : Promise.resolve(null),
    facility_id ? db.collection(COLLECTIONS.BRANCHES).doc(facility_id).get() : Promise.resolve(null),
  ]);
  const deptName = deptSnap?.exists ? (deptSnap.data()?.name ?? null) : null;
  const branchName = branchSnap?.exists ? (branchSnap.data()?.name ?? null) : null;

  // 7. Create or fetch Firebase Auth user
  const auth = getFirebaseAdminAuth();
  let userId: string;
  let isNew = false;
  let tempPassword: string | null = null;

  try {
    const existing = await auth.getUserByEmail(normalizedEmail);
    userId = existing.uid;
    const updateFields: { displayName?: string; password?: string } = { displayName: full_name };
    if (password) {
      updateFields.password = password;
      tempPassword = password;
    }
    await auth.updateUser(userId, updateFields);
  } catch {
    tempPassword = password || generateTempPassword();
    const created = await auth.createUser({
      email: normalizedEmail,
      password: tempPassword,
      displayName: full_name,
      emailVerified: true,
    });
    userId = created.uid;
    isNew = true;
  }

  // 8. Custom claims (for fast Firestore rules check)
  await auth.setCustomUserClaims(userId, {
    role: role_code,
    branchId: facility_id ?? null,
    departmentId: targetRole.dept_id,
  });

  // 9. Upsert users/{uid}
  const userDocRef = db.collection(COLLECTIONS.USERS).doc(userId);
  const existingSnap = await userDocRef.get();
  const now = new Date();
  const userDoc: Record<string, unknown> = {
    email: normalizedEmail,
    displayName: full_name,
    roleId: role_code,
    branchId: facility_id ?? null,
    departmentId: targetRole.dept_id,
    phone: phone?.trim() || null,
    status: 'active',
    isProbation: !!is_probation,
    branchName,
    departmentName: deptName,
    blockId: targetRole.block_id,
    roleLevel: targetRole.tier,
    updatedAt: now,
    updatedBy: callerProfile.id,
  };
  if (!existingSnap.exists) {
    userDoc.createdAt = now;
    userDoc.createdBy = callerProfile.id;
  }
  await userDocRef.set(userDoc, { merge: true });

  // 10. Audit log
  await writeAuditLog({
    action: isNew ? 'create_user' : 'update_user',
    module: 'users',
    userId: callerProfile.id,
    branchId: facility_id ?? null,
    before: existingSnap.exists ? (existingSnap.data() ?? null) : null,
    after: { id: userId, ...userDoc },
    actorName: callerProfile.displayName,
    actorRole: callerProfile.roleName ?? callerProfile.roleCode,
    source: 'api',
  });

  return NextResponse.json({
    success: true,
    user_id: userId,
    email: normalizedEmail,
    is_new: isNew,
    temp_password: tempPassword,
  });
}
