// GET  /api/checklist/templates?block=KD&dept=AS  → list templates theo scope
// POST /api/checklist/templates                    → tạo template mới

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  canCreateTemplate, canReadTemplates, templateFilterForList,
} from '@/lib/firebase/template-scope';
import { writeAuditLog } from '@/lib/firebase/audit-log';

import { COLLECTIONS } from '@/lib/firebase/collections';
const COL = COLLECTIONS.TEMPLATES;

const TEMPLATE_FIELDS = [
  'name', 'role_label', 'block_id', 'active', 'department_id',
  'shift_type', 'checklist_group', 'checklist_type', 'scheduled_time',
  'deadline_time', 'evidence_type', 'facility_scope',
  'reviewer_role_code', 'assigned_role_code',
] as const;

function sanitizeCreate(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of TEMPLATE_FIELDS) {
    if (k in body) out[k] = (body as Record<string, unknown>)[k];
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

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canReadTemplates(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const filterFromScope = templateFilterForList(caller.profile);
    const block = qs.get('block') ?? filterFromScope.block_id;
    const dept = qs.get('dept') ?? filterFromScope.department_id;

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL);
    if (filterFromScope.block_id && (block && block !== filterFromScope.block_id)) {
      // QLCS cố ép block khác → chặn
      return NextResponse.json({ error: 'Out of scope (block)' }, { status: 403 });
    }
    if (filterFromScope.department_id && (dept && dept !== filterFromScope.department_id)) {
      return NextResponse.json({ error: 'Out of scope (dept)' }, { status: 403 });
    }
    if (block) q = q.where('block_id', '==', block);
    if (dept) q = q.where('department_id', '==', dept);

    const snap = await q.get();
    const rows = snap.docs.map((d) => serialize(d.id, d.data()));
    rows.sort((a, b) => {
      const ta = a.created_at ?? '';
      const tb = b.created_at ?? '';
      return tb.localeCompare(ta);
    });
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[tpl GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const payload = sanitizeCreate(body?.payload ?? {});
    if (!payload.block_id || !payload.assigned_role_code) {
      return NextResponse.json({ error: 'Thiếu block_id hoặc assigned_role_code' }, { status: 400 });
    }
    if (!canCreateTemplate(caller.profile, {
      block_id: (payload.block_id as string) ?? null,
      department_id: (payload.department_id as string) ?? null,
    })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    const now = new Date();
    const ref = await db.collection(COL).add({
      ...payload,
      active: payload.active ?? true,
      created_at: now,
      created_by: caller.profile.uid,
      updated_at: now,
      updated_by: caller.profile.uid,
    });
    const created = (await ref.get()).data()!;

    await writeAuditLog({
      action: 'create_template',
      module: 'templates',
      userId: caller.profile.uid,
      branchId: null,
      before: null,
      after: { id: ref.id, ...payload },
    });

    return NextResponse.json({ template: serialize(ref.id, created) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[tpl POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
