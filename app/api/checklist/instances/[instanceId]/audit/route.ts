// GET  /api/checklist/instances/[instanceId]/audit  → list audit logs của 1 instance
// POST /api/checklist/instances/[instanceId]/audit  → ghi 1 entry audit

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { matchesScope, type InstanceForScope } from '@/lib/firebase/checklist-scope';

async function loadInstanceForScope(instanceId: string): Promise<InstanceForScope | null> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTIONS.CHECKLISTS).doc(instanceId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    facility_id: d.facility_id ?? null,
    department_id: d.department_id ?? null,
    shift_type: d.shift_type ?? null,
    assigned_to: d.assigned_to ?? null,
    status: d.status ?? 'pending',
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ instanceId: string }> },
) {
  try {
    const { instanceId } = await ctx.params;
    const caller = await getAuthedCaller();
    const inst = await loadInstanceForScope(instanceId);
    if (!inst) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    if (!matchesScope(caller.profile, inst)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    // Query auditLogs (chuẩn Phase 1.5) bằng anchor instanceId; sort client-side.
    const snap = await db.collection(COLLECTIONS.AUDIT_LOGS)
      .where('instanceId', '==', instanceId)
      .limit(200)
      .get();

    const rows = snap.docs
      .map((d) => {
        const x = d.data();
        const createdAt =
          x.createdAt?.toDate?.()?.toISOString() ??
          x.created_at?.toDate?.()?.toISOString() ??
          x.createdAt ?? x.created_at ?? null;
        return {
          id: d.id,
          instance_id: x.instanceId ?? x.instance_id ?? null,
          action: x.action,
          actor_id: x.userId ?? x.actor_id,
          actor_name: x.actor_name ?? '',
          actor_role: x.actor_role ?? '',
          details: x.details ?? null,
          created_at: createdAt,
        };
      })
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .slice(0, 50);
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[audit GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ instanceId: string }> },
) {
  try {
    const { instanceId } = await ctx.params;
    const body = await req.json();
    const action: string = body?.action;
    const details = body?.details ?? null;
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

    const caller = await getAuthedCaller();
    const inst = await loadInstanceForScope(instanceId);
    if (!inst) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    if (!matchesScope(caller.profile, inst)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await writeAuditLog({
      action,
      module: 'checklist',
      userId: caller.profile.uid,
      branchId: inst.facility_id,
      before: null,
      after: details,
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      instanceId,
      details,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[audit POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
