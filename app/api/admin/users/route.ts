// GET /api/admin/users  → list users (caller phải có quyền users module)

import { NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { canAccessRoute } from '@/lib/permissions';
import { getCurrentProfile } from '@/lib/firebase/current-profile';

export async function GET() {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  if (!canAccessRoute(ctx.profile.roleCode, 'users', ctx.profile.menuOverrides)) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  }

  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTIONS.USERS).get();
  const rows = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      email: x.email ?? '',
      full_name: x.displayName ?? '',
      phone: x.phone ?? null,
      role_code: x.roleId ?? '',
      role_name: x.roleId ?? '',
      role_level: x.roleLevel ?? null,
      facility_id: x.branchId ?? null,
      facility_name: x.branchName ?? null,
      department_id: x.departmentId ?? null,
      department_name: x.departmentName ?? null,
      block_id: x.blockId ?? null,
      block_name: x.blockName ?? null,
      active: x.status !== 'inactive',
      status: x.status ?? 'active',
      is_probation: !!x.isProbation,
      // Có roleId = user đã được cấu hình đầy đủ (đã gán role). Mọi user trong collection `users` đều có.
      has_profile: !!x.roleId,
      menu_overrides: (x.menuOverrides && typeof x.menuOverrides === 'object') ? x.menuOverrides as Record<string, boolean> : {},
      created_at: x.createdAt?.toDate?.()?.toISOString() ?? x.createdAt ?? null,
      created_by: x.createdBy ?? null,
    };
  });
  return NextResponse.json({ rows });
}
