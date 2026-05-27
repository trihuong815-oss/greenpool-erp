// GET  /api/personal/profile — đọc profile của chính mình (không hiển thị field nhạy cảm của user khác)
// PATCH /api/personal/profile — sửa avatarUrl, workSlogan, positionTitle (3 field user tự sửa)
//
// PRIVACY: chỉ trả/sửa cho ownerId === auth.uid. KHÔNG cho admin override.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getCurrentProfile } from '@/lib/firebase/current-profile';

export async function GET() {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const p = ctx.profile;
  return NextResponse.json({
    id: p.id,
    email: p.email,
    displayName: p.displayName,
    roleCode: p.roleCode,
    roleName: p.roleName,
    branchId: p.branchId,
    branchName: p.branchName,
    departmentId: p.departmentId,
    departmentName: p.departmentName,
    avatarUrl: p.avatarUrl,
    workSlogan: p.workSlogan,
    positionTitle: p.positionTitle,
  });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
  }

  // Chỉ cho sửa 3 field user-owned. Không nhận roleId/branchId/email — chống privilege escalation.
  const patch: Record<string, unknown> = {};
  if (body.avatarUrl !== undefined) {
    if (body.avatarUrl !== null && typeof body.avatarUrl !== 'string') {
      return NextResponse.json({ error: 'avatarUrl phải là string hoặc null' }, { status: 400 });
    }
    patch.avatarUrl = body.avatarUrl || null;
  }
  if (body.workSlogan !== undefined) {
    if (body.workSlogan !== null && typeof body.workSlogan !== 'string') {
      return NextResponse.json({ error: 'workSlogan phải là string hoặc null' }, { status: 400 });
    }
    patch.workSlogan = body.workSlogan ? String(body.workSlogan).trim().slice(0, 300) : null;
  }
  if (body.positionTitle !== undefined) {
    if (body.positionTitle !== null && typeof body.positionTitle !== 'string') {
      return NextResponse.json({ error: 'positionTitle phải là string hoặc null' }, { status: 400 });
    }
    patch.positionTitle = body.positionTitle ? String(body.positionTitle).trim().slice(0, 100) : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Không có field hợp lệ' }, { status: 400 });
  }
  patch.updatedAt = new Date();
  patch.updatedBy = ctx.profile.id;

  const db = getFirebaseAdminDb();
  await db.collection(COLLECTIONS.USERS).doc(ctx.profile.id).update(patch);

  await writeAuditLog({
    action: 'self_update_profile',
    module: 'users',
    userId: ctx.profile.id,
    branchId: ctx.profile.branchId ?? null,
    before: null,
    after: { id: ctx.profile.id, fields: Object.keys(patch).filter((k) => k !== 'updatedAt' && k !== 'updatedBy') },
    actorName: ctx.profile.displayName,
    actorRole: ctx.profile.roleName ?? ctx.profile.roleCode,
    source: 'api',
  });

  return NextResponse.json({ ok: true });
}
