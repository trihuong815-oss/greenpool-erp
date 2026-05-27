// PATCH /api/checklist/instances/[instanceId]/items/[itemId]
// Update note hoặc file_urls cho 1 item.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { matchesScope, isTerminal, type InstanceForScope } from '@/lib/firebase/checklist-scope';

import { COLLECTIONS, SUBCOLLECTIONS } from '@/lib/firebase/collections';
const COL_INSTANCES = COLLECTIONS.CHECKLISTS;
const SUB_ITEMS = SUBCOLLECTIONS.ITEMS;

const ALLOWED_FIELDS = new Set(['note', 'file_urls']);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  try {
    const { instanceId, itemId } = await ctx.params;
    const body = await req.json();
    const rawPatch = body?.patch ?? {};
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawPatch)) {
      if (ALLOWED_FIELDS.has(k)) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No allowed fields in patch' }, { status: 400 });
    }

    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();

    const instRef = db.collection(COL_INSTANCES).doc(instanceId);
    const instSnap = await instRef.get();
    if (!instSnap.exists) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    const inst = instSnap.data()!;
    const instForScope: InstanceForScope = {
      facility_id: inst.facility_id ?? null,
      department_id: inst.department_id ?? null,
      shift_type: inst.shift_type ?? null,
      assigned_to: inst.assigned_to ?? null,
      status: inst.status ?? 'pending',
    };
    if (!matchesScope(caller.profile, instForScope)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (isTerminal(instForScope.status)) {
      return NextResponse.json({ error: 'Instance đã kết thúc' }, { status: 409 });
    }

    const itemRef = instRef.collection(SUB_ITEMS).doc(itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    await itemRef.update({ ...patch, updated_at: new Date(), updated_by: caller.profile.uid });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[item PATCH]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
