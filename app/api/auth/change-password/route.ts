// POST /api/auth/change-password
// Body: { newPassword: string }
// Auth: session cookie (đã đăng nhập). User tự đổi mật khẩu của chính mình.
// Audit log đầy đủ.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getCurrentProfile } from '@/lib/firebase/current-profile';

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'Mật khẩu mới phải ≥ 6 ký tự' }, { status: 400 });
  }
  if (newPassword.length > 128) {
    return NextResponse.json({ error: 'Mật khẩu mới quá dài (≤ 128 ký tự)' }, { status: 400 });
  }

  try {
    await getFirebaseAdminAuth().updateUser(ctx.profile.id, { password: newPassword });
  } catch (e: any) {
    console.error('[change-password]', e?.message);
    return NextResponse.json({ error: 'Lỗi cập nhật mật khẩu: ' + (e?.message ?? '') }, { status: 500 });
  }

  await writeAuditLog({
    action: 'self_change_password',
    module: 'users',
    userId: ctx.profile.id,
    branchId: ctx.profile.branchId ?? null,
    before: null,
    after: { id: ctx.profile.id, email: ctx.profile.email },
    actorName: ctx.profile.displayName,
    actorRole: ctx.profile.roleName ?? ctx.profile.roleCode,
    source: 'api',
  });

  return NextResponse.json({ ok: true });
}
