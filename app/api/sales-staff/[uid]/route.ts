// PATCH /api/sales-staff/[uid]  body: { status?: 'active'|'inactive', displayName?: string }
//   Admin only. Hỗ trợ:
//     - Toggle status (kèm Firebase Auth disabled flag)
//     - Đổi displayName (kèm Firebase Auth displayName để Authentication console hiển thị đúng)
//   Cho phép gửi 1 trong 2 hoặc cả 2 trong cùng request.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb, getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isAdmin } from '@/lib/firebase/checklist-scope';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  try {
    const caller = await getAuthedCaller();
    if (!isAdmin(caller.profile)) {
      return NextResponse.json({ error: 'Chỉ admin được sửa sale' }, { status: 403 });
    }

    const { uid } = await ctx.params;
    const body = await req.json();

    // Parse + validate input
    const hasStatus = body?.status !== undefined;
    const hasName = body?.displayName !== undefined;
    if (!hasStatus && !hasName) {
      return NextResponse.json({ error: 'Phải gửi status hoặc displayName' }, { status: 400 });
    }

    let status: 'active' | 'inactive' | null = null;
    if (hasStatus) {
      const s = String(body.status ?? '').trim();
      if (s !== 'active' && s !== 'inactive') {
        return NextResponse.json({ error: 'status phải là active hoặc inactive' }, { status: 400 });
      }
      status = s;
    }

    let displayName: string | null = null;
    if (hasName) {
      const n = String(body.displayName ?? '').trim();
      if (n.length < 2 || n.length > 100) {
        return NextResponse.json({ error: 'Họ tên 2-100 ký tự' }, { status: 400 });
      }
      displayName = n;
    }

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.USERS).doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy user' }, { status: 404 });
    const data = snap.data()!;
    if (data.roleId !== 'NV_SALE') {
      return NextResponse.json({ error: 'Endpoint này chỉ cho NV_SALE' }, { status: 400 });
    }

    // Firebase Auth update — gộp cả disabled + displayName trong 1 call
    const auth = getFirebaseAdminAuth();
    const authPatch: { disabled?: boolean; displayName?: string } = {};
    if (status !== null) authPatch.disabled = status === 'inactive';
    if (displayName !== null) authPatch.displayName = displayName;
    try {
      await auth.updateUser(uid, authPatch);
    } catch (e: any) {
      console.warn('[sales-staff PATCH] auth update fail:', e?.message);
    }

    // Firestore patch
    const now = new Date();
    const patch: Record<string, unknown> = {
      updatedAt: now,
      updatedBy: caller.profile.uid,
    };
    if (status !== null) {
      patch.status = status;
      if (status === 'inactive') {
        patch.deactivatedAt = now;
        patch.deactivatedBy = caller.profile.uid;
      } else {
        patch.reactivatedAt = now;
        patch.reactivatedBy = caller.profile.uid;
      }
    }
    if (displayName !== null) {
      patch.displayName = displayName;
      patch.renamedAt = now;
      patch.renamedBy = caller.profile.uid;
    }
    await ref.update(patch);

    // Audit log — viết 1 hoặc 2 entry tuỳ payload
    if (status !== null) {
      await writeAuditLog({
        action: status === 'inactive' ? 'deactivate_sales_staff' : 'reactivate_sales_staff',
        module: 'sales',
        userId: caller.profile.uid,
        branchId: data.branchId ?? null,
        before: { status: data.status },
        after: { status, uid },
        actorName: caller.actorName,
        actorRole: caller.actorRole,
        source: 'api',
      });
    }
    if (displayName !== null && displayName !== data.displayName) {
      await writeAuditLog({
        action: 'rename_sales_staff',
        module: 'sales',
        userId: caller.profile.uid,
        branchId: data.branchId ?? null,
        before: { displayName: data.displayName },
        after: { displayName, uid },
        actorName: caller.actorName,
        actorRole: caller.actorRole,
        source: 'api',
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[sales-staff PATCH]', e?.code, e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? 'unknown'), code: e?.code }, { status: 500 });
  }
}
