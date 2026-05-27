// POST /api/checklist/instances/[instanceId]/items/[itemId]/toggle
// Body: { checked: boolean, item_content?: string }
// Atomic: set is_checked + checked_at + checked_by, optionally bump instance status,
// và ghi audit log "check_item" / "uncheck_item".

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS, SUBCOLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { matchesScope, isTerminal, type InstanceForScope } from '@/lib/firebase/checklist-scope';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  try {
    const { instanceId, itemId } = await ctx.params;
    const body = await req.json();
    const checked: boolean = !!body?.checked;
    const itemContent: string | undefined = body?.item_content;

    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();

    const instRef = db.collection(COLLECTIONS.CHECKLISTS).doc(instanceId);
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

    const itemRef = instRef.collection(SUBCOLLECTIONS.ITEMS).doc(itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const now = new Date();
    const itemPatch = {
      is_checked: checked,
      checked_at: checked ? now : null,
      checked_by: checked ? caller.profile.uid : null,
      updated_at: now,
      updated_by: caller.profile.uid,
    };

    const batch = db.batch();
    batch.update(itemRef, itemPatch);

    let nextStatus = instForScope.status;
    if (instForScope.status === 'pending' && checked) {
      nextStatus = 'in_progress';
      batch.update(instRef, { status: nextStatus, updated_at: now, updated_by: caller.profile.uid });
    }

    const details = {
      item_id: itemId,
      item_content: itemContent ?? null,
      old_value: !checked,
      new_value: checked,
    };
    const auditRef = db.collection(COLLECTIONS.AUDIT_LOGS).doc();
    batch.set(auditRef, {
      action: checked ? 'check_item' : 'uncheck_item',
      module: 'checklist',
      userId: caller.profile.uid,
      branchId: instForScope.facility_id,
      before: { is_checked: !checked },
      after: { is_checked: checked },
      createdAt: now,
      source: 'api',
      actor_name: caller.actorName,
      actor_role: caller.actorRole,
      instanceId,
      details,
    });

    await batch.commit();
    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[item toggle]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
