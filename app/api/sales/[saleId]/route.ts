// GET    /api/sales/[saleId]
// PATCH  /api/sales/[saleId]  — branchId + leadId immutable
// DELETE /api/sales/[saleId]  — admin only

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canDeleteSale, canUpdateSale, salesFilterForList } from '@/lib/firebase/sales-scope';

const COL = COLLECTIONS.SALES;

const PATCH_FIELDS = new Set([
  'packageId', 'packageName', 'amount', 'closeSource', 'saleBy', 'status',
  'crmDealId', 'crmCustomerId', 'sourceSystem', 'syncedAt', 'externalRef',
]);
const VALID_SOURCE = new Set(['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in']);
const VALID_STATUS = new Set(['confirmed', 'pending_payment', 'refunded', 'cancelled']);

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
  if ('closeSource' in p && !VALID_SOURCE.has(p.closeSource as string)) return 'closeSource không hợp lệ';
  if ('status' in p && !VALID_STATUS.has(p.status as string)) return 'status không hợp lệ';
  if ('amount' in p && (typeof p.amount !== 'number' || p.amount < 0)) return 'amount phải là số ≥ 0';
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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ saleId: string }> }) {
  try {
    const { saleId } = await ctx.params;
    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COL).doc(saleId).get();
    if (!snap.exists) return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    const data = snap.data()!;
    const scope = salesFilterForList(caller.profile);
    if (scope.branchIds && !scope.branchIds.includes(data.branchId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ sale: serialize(saleId, data) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[sale GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ saleId: string }> }) {
  try {
    const { saleId } = await ctx.params;
    const body = await req.json();
    const patch = sanitize(body?.patch ?? {});
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No allowed fields' }, { status: 400 });
    const valErr = validatePatch(patch);
    if (valErr) return NextResponse.json({ error: valErr }, { status: 400 });

    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(saleId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    const current = snap.data()!;

    // branchId + leadId luôn immutable (PATCH_FIELDS không include) + double-check
    if (!canUpdateSale(caller.profile, { branchId: current.branchId }, { branchId: current.branchId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    await ref.update({ ...patch, updatedAt: now, updatedBy: caller.profile.uid });
    const after = (await ref.get()).data()!;

    await writeAuditLog({
      action: 'update_sale',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: current.branchId,
      before: { id: saleId, ...Object.fromEntries(Object.keys(patch).map((k) => [k, current[k]])) },
      after: { id: saleId, ...patch },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ sale: serialize(saleId, after) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[sale PATCH]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ saleId: string }> }) {
  try {
    const { saleId } = await ctx.params;
    const caller = await getAuthedCaller();
    if (!canDeleteSale(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(saleId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    const data = snap.data()!;

    await ref.delete();
    await writeAuditLog({
      action: 'delete_sale',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: data.branchId ?? null,
      before: { id: saleId, ...data },
      after: null,
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[sale DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
