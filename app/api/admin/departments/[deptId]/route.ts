// DELETE /api/admin/departments/[deptId]
// Chỉ admin. Chặn xóa nếu còn template đang gắn department này.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canDeleteDepartment } from '@/lib/firebase/template-scope';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ deptId: string }> },
) {
  try {
    const { deptId } = await ctx.params;
    const caller = await getAuthedCaller();
    if (!canDeleteDepartment(caller.profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    const deptRef = db.collection('departments').doc(deptId);
    const deptSnap = await deptRef.get();
    if (!deptSnap.exists) return NextResponse.json({ error: 'Department not found' }, { status: 404 });

    // Block nếu còn template đang gắn
    const tplCheck = await db.collection(COLLECTIONS.TEMPLATES)
      .where('department_id', '==', deptId).count().get();
    if (tplCheck.data().count > 0) {
      return NextResponse.json({
        error: `Không thể xoá: còn ${tplCheck.data().count} template đang gắn bộ phận này.`,
      }, { status: 409 });
    }

    const data = deptSnap.data()!;
    await deptRef.delete();

    await writeAuditLog({
      action: 'delete_department',
      module: 'templates',
      userId: caller.profile.uid,
      branchId: null,
      before: { id: deptId, ...data },
      after: null,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[dept DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
