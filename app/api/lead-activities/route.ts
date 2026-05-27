// GET  /api/lead-activities?leadId=&branchId=
// POST /api/lead-activities — create activity (append-only)

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  canCreateActivity, canReadActivities, activitiesFilterForList,
} from '@/lib/firebase/lead-activities-scope';

const COL = COLLECTIONS.LEAD_ACTIVITIES;
const VALID_TYPE = new Set(['call', 'meet', 'message', 'email', 'note']);

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
    if (!canReadActivities(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const leadId = qs.get('leadId') || undefined;
    const reqBranchId = qs.get('branchId') || undefined;

    const scope = activitiesFilterForList(caller.profile);
    if (scope.branchIds && scope.branchIds.length === 0) return NextResponse.json({ rows: [] });
    if (reqBranchId && scope.branchIds && !scope.branchIds.includes(reqBranchId)) {
      return NextResponse.json({ error: 'Out of scope (branchId)' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL);
    if (leadId) q = q.where('leadId', '==', leadId);
    if (reqBranchId) q = q.where('branchId', '==', reqBranchId);
    else if (scope.branchIds) {
      if (scope.branchIds.length === 1) q = q.where('branchId', '==', scope.branchIds[0]);
      else q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));
    }
    const snap = await q.limit(500).get();
    const rows = snap.docs.map((d) => serialize(d.id, d.data()))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[activities GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const leadId: string = body?.leadId;
    const type: string = body?.type;
    const content: string = (body?.content ?? '').toString().trim();
    const nextFollowUpAt = body?.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;

    if (!leadId || !type || !content) {
      return NextResponse.json({ error: 'Thiếu leadId / type / content' }, { status: 400 });
    }
    if (!VALID_TYPE.has(type)) return NextResponse.json({ error: 'type không hợp lệ' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const leadSnap = await db.collection(COLLECTIONS.LEADS).doc(leadId).get();
    if (!leadSnap.exists) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const lead = leadSnap.data()!;
    const branchId: string = lead.branchId;

    if (!canCreateActivity(caller.profile, { branchId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const ref = await db.collection(COL).add({
      leadId,
      saleId: caller.profile.uid,
      branchId,
      type,
      content,
      nextFollowUpAt,
      createdAt: now,
      createdBy: caller.profile.uid,
    });
    const created = (await ref.get()).data()!;

    await writeAuditLog({
      action: 'create_lead_activity',
      module: 'sales',
      userId: caller.profile.uid,
      branchId,
      before: null,
      after: { id: ref.id, leadId, type, content },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ activity: serialize(ref.id, created) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[activities POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
