// GET  /api/checklist/templates/[templateId]/items  → list items theo sort_order
// POST /api/checklist/templates/[templateId]/items  → tạo item mới

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canManageTemplateItems } from '@/lib/firebase/template-scope';
import { writeAuditLog } from '@/lib/firebase/audit-log';

import { COLLECTIONS } from '@/lib/firebase/collections';
const COL = COLLECTIONS.TEMPLATES;

const ITEM_FIELDS = ['content', 'sort_order', 'is_required', 'requires_file', 'requires_note'] as const;

async function loadTemplate(templateId: string) {
  const db = getFirebaseAdminDb();
  const ref = db.collection(COL).doc(templateId);
  const snap = await ref.get();
  return { ref, snap, data: snap.exists ? snap.data()! : null };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ templateId: string }> },
) {
  try {
    const { templateId } = await ctx.params;
    await getAuthedCaller(); // chỉ cần signed-in (đọc public trong scope)
    const { ref, data } = await loadTemplate(templateId);
    if (!data) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const snap = await ref.collection('items').orderBy('sort_order').get();
    const rows = snap.docs.map((d) => ({ id: d.id, template_id: templateId, ...d.data() }));
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[item GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ templateId: string }> },
) {
  try {
    const { templateId } = await ctx.params;
    const body = await req.json();
    const content: string = (body?.content ?? '').toString().trim();
    if (!content) return NextResponse.json({ error: 'Thiếu content' }, { status: 400 });

    const caller = await getAuthedCaller();
    const { ref, data } = await loadTemplate(templateId);
    if (!data) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    if (!canManageTemplateItems(caller.profile, {
      block_id: data.block_id ?? null,
      department_id: data.department_id ?? null,
    })) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const itemsCol = ref.collection('items');
    const cur = await itemsCol.count().get();
    const sortOrder = cur.data().count;
    const now = new Date();
    const itemRef = await itemsCol.add({
      content,
      sort_order: sortOrder,
      is_required: false,
      requires_file: false,
      requires_note: false,
      created_at: now,
      created_by: caller.profile.uid,
      updated_at: now,
      updated_by: caller.profile.uid,
    });

    await writeAuditLog({
      action: 'create_template_item',
      module: 'templates',
      userId: caller.profile.uid,
      branchId: null,
      before: null,
      after: { id: itemRef.id, template_id: templateId, content, sort_order: sortOrder },
    });

    const created = (await itemRef.get()).data()!;
    return NextResponse.json({ item: { id: itemRef.id, template_id: templateId, ...created } });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[item POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
