// PATCH  /api/checklist/templates/[templateId]/items/[itemId]
// DELETE /api/checklist/templates/[templateId]/items/[itemId]

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canManageTemplateItems } from '@/lib/firebase/template-scope';
import { writeAuditLog } from '@/lib/firebase/audit-log';

import { COLLECTIONS } from '@/lib/firebase/collections';
const COL = COLLECTIONS.TEMPLATES;

const ITEM_PATCH_FIELDS = new Set(['content', 'sort_order', 'is_required', 'requires_file', 'requires_note']);

async function loadParent(templateId: string) {
  const db = getFirebaseAdminDb();
  const tplRef = db.collection(COL).doc(templateId);
  const tplSnap = await tplRef.get();
  return { tplRef, tplData: tplSnap.exists ? tplSnap.data()! : null };
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ templateId: string; itemId: string }> },
) {
  try {
    const { templateId, itemId } = await ctx.params;
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body?.patch ?? {})) {
      if (ITEM_PATCH_FIELDS.has(k)) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No allowed fields' }, { status: 400 });
    }

    const caller = await getAuthedCaller();
    const { tplRef, tplData } = await loadParent(templateId);
    if (!tplData) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    if (!canManageTemplateItems(caller.profile, {
      block_id: tplData.block_id ?? null,
      department_id: tplData.department_id ?? null,
    })) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const itemRef = tplRef.collection('items').doc(itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    const current = itemSnap.data()!;

    const now = new Date();
    await itemRef.update({ ...patch, updated_at: now, updated_by: caller.profile.uid });

    await writeAuditLog({
      action: 'update_template_item',
      module: 'templates',
      userId: caller.profile.uid,
      branchId: null,
      before: { id: itemId, template_id: templateId, ...Object.fromEntries(Object.keys(patch).map((k) => [k, current[k]])) },
      after: { id: itemId, template_id: templateId, ...patch },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[item PATCH]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ templateId: string; itemId: string }> },
) {
  try {
    const { templateId, itemId } = await ctx.params;
    const caller = await getAuthedCaller();
    const { tplRef, tplData } = await loadParent(templateId);
    if (!tplData) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    if (!canManageTemplateItems(caller.profile, {
      block_id: tplData.block_id ?? null,
      department_id: tplData.department_id ?? null,
    })) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const itemRef = tplRef.collection('items').doc(itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    const data = itemSnap.data()!;

    await itemRef.delete();
    await writeAuditLog({
      action: 'delete_template_item',
      module: 'templates',
      userId: caller.profile.uid,
      branchId: null,
      before: { id: itemId, template_id: templateId, ...data },
      after: null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[item DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
