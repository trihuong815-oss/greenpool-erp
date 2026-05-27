// GET  /api/package-groups?branchId=HM → list groups của branch
// POST /api/package-groups                → create group

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canCreatePackage, canReadPackages, packagesFilterForList } from '@/lib/firebase/packages-scope';

const COL = COLLECTIONS.PACKAGE_GROUPS;

function serialize(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canReadPackages(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const branchId = req.nextUrl.searchParams.get('branchId');
    const scope = packagesFilterForList(caller.profile);
    if (branchId && scope.branchIds && !scope.branchIds.includes(branchId)) {
      return NextResponse.json({ error: 'Out of scope' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL);
    if (branchId) q = q.where('branchId', '==', branchId);
    else if (scope.branchIds && scope.branchIds.length > 0) q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));
    const snap = await q.get();
    const rows = snap.docs.map((d) => serialize(d.id, d.data()))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[package-groups GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const name: string = (body?.name ?? '').toString().trim();
    const branchId: string = body?.branchId;
    const sortOrder: number = Number(body?.sortOrder ?? 999);
    if (!name || !branchId) return NextResponse.json({ error: 'Thiếu name hoặc branchId' }, { status: 400 });

    if (!canCreatePackage(caller.profile, { branchId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    const now = new Date();
    const ref = await db.collection(COL).add({
      name, branchId, sortOrder, active: true,
      createdAt: now, createdBy: caller.profile.uid,
      updatedAt: now, updatedBy: caller.profile.uid,
    });
    const created = (await ref.get()).data()!;

    await writeAuditLog({
      action: 'create_package_group',
      module: 'sales',
      userId: caller.profile.uid,
      branchId,
      before: null,
      after: { id: ref.id, name, branchId, sortOrder },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ group: serialize(ref.id, created) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[package-groups POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
