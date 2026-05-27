// GET    /api/leads/[leadId]
// PATCH  /api/leads/[leadId]  — branchId immutable
// DELETE /api/leads/[leadId]  — admin only

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canDeleteLead, canUpdateLead, leadsFilterForList } from '@/lib/firebase/leads-scope';

const COL = COLLECTIONS.LEADS;

const PATCH_FIELDS = new Set([
  'inputSource', 'assignedSaleId', 'status',
  'customerName', 'customerPhone',
  'crmLeadId', 'crmCustomerId', 'sourceSystem', 'syncedAt', 'externalRef',
]);
const VALID_SOURCE = new Set(['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in']);
const VALID_STATUS = new Set(['new', 'contacted', 'qualified', 'closed_won', 'closed_lost']);

function sanitize(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!PATCH_FIELDS.has(k)) continue;
    if (k === 'syncedAt' && typeof v === 'string') out[k] = new Date(v);
    else out[k] = v;
  }
  return out;
}

function validatePatch(p: Record<string, unknown>): string | null {
  if ('inputSource' in p && !VALID_SOURCE.has(p.inputSource as string)) return 'inputSource không hợp lệ';
  if ('status' in p && !VALID_STATUS.has(p.status as string)) return 'status không hợp lệ';
  return null;
}

function serialize(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  return out;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ leadId: string }> }) {
  try {
    const { leadId } = await ctx.params;
    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COL).doc(leadId).get();
    if (!snap.exists) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const data = snap.data()!;
    const scope = leadsFilterForList(caller.profile);
    if (scope.branchIds && !scope.branchIds.includes(data.branchId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ lead: serialize(leadId, data) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[lead GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ leadId: string }> }) {
  try {
    const { leadId } = await ctx.params;
    const body = await req.json();
    const patch = sanitize(body?.patch ?? {});
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No allowed fields' }, { status: 400 });
    const valErr = validatePatch(patch);
    if (valErr) return NextResponse.json({ error: valErr }, { status: 400 });

    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(leadId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const current = snap.data()!;

    if (!canUpdateLead(caller.profile, { branchId: current.branchId }, { branchId: current.branchId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    await ref.update({ ...patch, updatedAt: now, updatedBy: caller.profile.uid });
    const after = (await ref.get()).data()!;

    await writeAuditLog({
      action: 'update_lead',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: current.branchId,
      before: { id: leadId, ...Object.fromEntries(Object.keys(patch).map((k) => [k, current[k]])) },
      after: { id: leadId, ...patch },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ lead: serialize(leadId, after) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[lead PATCH]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ leadId: string }> }) {
  try {
    const { leadId } = await ctx.params;
    const caller = await getAuthedCaller();
    if (!canDeleteLead(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(leadId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const data = snap.data()!;

    // Chặn xóa lead nếu còn sale tham chiếu (data integrity)
    const salesRef = await db.collection(COLLECTIONS.SALES).where('leadId', '==', leadId).count().get();
    if (salesRef.data().count > 0) {
      return NextResponse.json({
        error: `Không thể xoá: còn ${salesRef.data().count} sale tham chiếu lead này.`,
      }, { status: 409 });
    }

    await ref.delete();
    await writeAuditLog({
      action: 'delete_lead',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: data.branchId ?? null,
      before: { id: leadId, ...data },
      after: null,
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[lead DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
