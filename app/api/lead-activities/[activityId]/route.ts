// DELETE /api/lead-activities/[activityId] — admin only (audit append-only)

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canDeleteActivity } from '@/lib/firebase/lead-activities-scope';

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ activityId: string }> }) {
  try {
    const { activityId } = await ctx.params;
    const caller = await getAuthedCaller();
    if (!canDeleteActivity(caller.profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.LEAD_ACTIVITIES).doc(activityId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    const data = snap.data()!;

    await ref.delete();
    await writeAuditLog({
      action: 'delete_lead_activity',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: data.branchId ?? null,
      before: { id: activityId, ...data },
      after: null,
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[activity DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
