// GET  /api/packages?branchId=HM&groupId=...&active=true
// POST /api/packages  — create package trong 1 group

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canCreatePackage, canReadPackages, packagesFilterForList } from '@/lib/firebase/packages-scope';

const COL = COLLECTIONS.PACKAGES;

function serialize(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  // Defensive normalize (2026-06-17): tránh undefined gây crash UI .toLocaleString()/.map()
  out.defaultPrice = Number(data.defaultPrice ?? 0);
  out.sortOrder = Number(data.sortOrder ?? 0);
  out.active = data.active !== false;
  // V6 PT (2026-06-17): gói tính theo buổi
  out.isCustomQuantity = data.isCustomQuantity === true;
  out.unitName = data.unitName ? String(data.unitName) : '';
  out.defaultUnitPrice = data.defaultUnitPrice != null ? Number(data.defaultUnitPrice) : 0;
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canReadPackages(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const branchId = qs.get('branchId');
    const groupId = qs.get('groupId');
    const activeOnly = qs.get('active') === 'true';

    const scope = packagesFilterForList(caller.profile);
    if (branchId && scope.branchIds && !scope.branchIds.includes(branchId)) {
      return NextResponse.json({ error: 'Out of scope' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL);
    if (branchId) q = q.where('branchId', '==', branchId);
    else if (scope.branchIds && scope.branchIds.length > 0) q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));
    if (groupId) q = q.where('groupId', '==', groupId);
    if (activeOnly) q = q.where('active', '==', true);

    const snap = await q.get();
    const rows = snap.docs.map((d) => serialize(d.id, d.data()))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[packages GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const name: string = (body?.name ?? '').toString().trim();
    const branchId: string = body?.branchId;
    const groupId: string = body?.groupId;
    const defaultPrice: number = Number(body?.defaultPrice ?? 0);
    const sortOrder: number = Number(body?.sortOrder ?? 999);
    // V6 PT (2026-06-17): gói tính theo buổi
    const isCustomQuantity: boolean = body?.isCustomQuantity === true;
    const unitName: string = isCustomQuantity
      ? (String(body?.unitName ?? '').trim() || 'buổi').slice(0, 20)
      : '';
    const defaultUnitPrice: number = isCustomQuantity ? Number(body?.defaultUnitPrice ?? 0) : 0;

    if (!name || !branchId || !groupId) {
      return NextResponse.json({ error: 'Thiếu name/branchId/groupId' }, { status: 400 });
    }
    if (defaultPrice < 0 || !Number.isFinite(defaultPrice)) {
      return NextResponse.json({ error: 'defaultPrice không hợp lệ' }, { status: 400 });
    }
    if (isCustomQuantity && (defaultUnitPrice < 0 || !Number.isFinite(defaultUnitPrice))) {
      return NextResponse.json({ error: 'defaultUnitPrice không hợp lệ' }, { status: 400 });
    }

    if (!canCreatePackage(caller.profile, { branchId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate group exists + cùng branch
    const db = getFirebaseAdminDb();
    const grpSnap = await db.collection(COLLECTIONS.PACKAGE_GROUPS).doc(groupId).get();
    if (!grpSnap.exists) return NextResponse.json({ error: 'Group không tồn tại' }, { status: 400 });
    if (grpSnap.data()?.branchId !== branchId) {
      return NextResponse.json({ error: 'Group thuộc branch khác' }, { status: 400 });
    }

    const now = new Date();
    const ref = await db.collection(COL).add({
      name, groupId, branchId, defaultPrice, sortOrder, active: true,
      isCustomQuantity, unitName, defaultUnitPrice,
      createdAt: now, createdBy: caller.profile.uid,
      updatedAt: now, updatedBy: caller.profile.uid,
    });
    const created = (await ref.get()).data()!;

    await writeAuditLog({
      action: 'create_package',
      module: 'sales',
      userId: caller.profile.uid,
      branchId,
      before: null,
      after: { id: ref.id, name, groupId, defaultPrice, sortOrder, isCustomQuantity, unitName, defaultUnitPrice },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ pkg: serialize(ref.id, created) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[packages POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
