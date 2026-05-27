// PATCH  /api/checklist/templates/[templateId]  → update template
// DELETE /api/checklist/templates/[templateId]  → xóa template + cascade items

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canUpdateTemplate, canDeleteTemplate } from '@/lib/firebase/template-scope';
import { writeAuditLog } from '@/lib/firebase/audit-log';

import { COLLECTIONS } from '@/lib/firebase/collections';
const COL = COLLECTIONS.TEMPLATES;

const PATCH_FIELDS = new Set([
  'name', 'active', 'role_label', 'department_id', 'shift_type',
  'checklist_group', 'checklist_type', 'scheduled_time', 'deadline_time',
  'evidence_type', 'facility_scope', 'reviewer_role_code', 'assigned_role_code',
  'block_id',
]);

function sanitize(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (PATCH_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

function serialize(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
      out[k] = v.toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ templateId: string }> },
) {
  try {
    const { templateId } = await ctx.params;
    const body = await req.json();
    const patch = sanitize(body?.patch ?? {});
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No allowed fields' }, { status: 400 });
    }

    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(templateId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    const current = snap.data()!;

    if (!canUpdateTemplate(
      caller.profile,
      { block_id: current.block_id ?? null, department_id: current.department_id ?? null },
      {
        block_id: (patch.block_id as string | undefined) ?? (current.block_id ?? null),
        department_id: (patch.department_id as string | undefined) ?? (current.department_id ?? null),
      },
    )) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    await ref.update({ ...patch, updated_at: now, updated_by: caller.profile.uid });
    const after = (await ref.get()).data()!;

    await writeAuditLog({
      action: 'update_template',
      module: 'templates',
      userId: caller.profile.uid,
      branchId: null,
      before: { id: templateId, ...Object.fromEntries(Object.keys(patch).map((k) => [k, current[k]])) },
      after: { id: templateId, ...patch },
    });

    return NextResponse.json({ template: serialize(templateId, after) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[tpl PATCH]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ templateId: string }> },
) {
  try {
    const { templateId } = await ctx.params;
    const caller = await getAuthedCaller();
    if (!canDeleteTemplate(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(templateId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    const data = snap.data()!;

    // Cascade items
    const itemsSnap = await ref.collection('items').get();
    const batch = db.batch();
    itemsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();

    await writeAuditLog({
      action: 'delete_template',
      module: 'templates',
      userId: caller.profile.uid,
      branchId: null,
      before: { id: templateId, ...data },
      after: null,
    });

    return NextResponse.json({ ok: true, deletedItems: itemsSnap.size });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[tpl DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
