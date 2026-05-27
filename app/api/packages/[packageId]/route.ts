// PATCH  /api/packages/[id] — name, defaultPrice, sortOrder, active (branchId+groupId immutable)
// DELETE /api/packages/[id] — chặn nếu còn packageSales ref

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canDeletePackage, canUpdatePackage } from '@/lib/firebase/packages-scope';

const COL = COLLECTIONS.PACKAGES;
const PATCH_FIELDS = new Set(['name', 'defaultPrice', 'sortOrder', 'active']);

function sanitize(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!PATCH_FIELDS.has(k)) continue;
    if (k === 'defaultPrice') {
      const n = Number(v);
      if (n < 0 || !Number.isFinite(n)) continue;
      out[k] = n;
    } else out[k] = v;
  }
  return out;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ packageId: string }> }) {
  try {
    const { packageId } = await ctx.params;
    const body = await req.json();
    const patch = sanitize(body?.patch ?? {});
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No allowed fields' }, { status: 400 });

    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(packageId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    const current = snap.data()!;

    if (!canUpdatePackage(caller.profile, { branchId: current.branchId }, { branchId: current.branchId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    await ref.update({ ...patch, updatedAt: now, updatedBy: caller.profile.uid });
    await writeAuditLog({
      action: 'update_package',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: current.branchId,
      before: { id: packageId, ...Object.fromEntries(Object.keys(patch).map((k) => [k, current[k]])) },
      after: { id: packageId, ...patch },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[package PATCH]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ packageId: string }> }) {
  try {
    const { packageId } = await ctx.params;
    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(packageId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    const data = snap.data()!;

    if (!canDeletePackage(caller.profile, { branchId: data.branchId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Chặn nếu còn packageSales ref
    const psCount = await db.collection(COLLECTIONS.PACKAGE_SALES).where('packageId', '==', packageId).count().get();
    if (psCount.data().count > 0) {
      return NextResponse.json({
        error: `Không thể xoá: còn ${psCount.data().count} bản ghi doanh số tham chiếu. Disable thay vì xóa.`,
      }, { status: 409 });
    }

    await ref.delete();
    await writeAuditLog({
      action: 'delete_package',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: data.branchId,
      before: { id: packageId, ...data },
      after: null,
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[package DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
