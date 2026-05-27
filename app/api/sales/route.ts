// GET  /api/sales?branchId=HM&from=YYYY-MM-DD&to=YYYY-MM-DD&closeSource=MKT&status=confirmed&leadId=...
// POST /api/sales — Phase 6 schema MỚI: bắt buộc leadId, packageId, packageName, amount, closeSource, saleBy, status.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canCreateSale, canReadSales, salesFilterForList } from '@/lib/firebase/sales-scope';

const COL = COLLECTIONS.SALES;

const FIELDS = [
  'leadId', 'packageId', 'packageName', 'amount', 'closeSource',
  'saleBy', 'branchId', 'status',
  'crmDealId', 'crmCustomerId', 'sourceSystem', 'syncedAt', 'externalRef',
] as const;

const REQUIRED = ['leadId', 'packageId', 'packageName', 'amount', 'closeSource', 'saleBy', 'branchId', 'status'] as const;
const VALID_SOURCE = new Set(['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in']);
const VALID_STATUS = new Set(['confirmed', 'pending_payment', 'refunded', 'cancelled']);
const VALID_SOURCESYSTEM = new Set(['manual', 'crm', 'csv']);

function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of FIELDS) if (k in body) out[k] = body[k];
  if (typeof out.syncedAt === 'string') out.syncedAt = new Date(out.syncedAt as string);
  out.sourceSystem ??= 'manual';
  out.crmDealId ??= null;
  out.crmCustomerId ??= null;
  out.syncedAt ??= null;
  out.externalRef ??= null;
  return out;
}

function validateCreate(p: Record<string, unknown>): string | null {
  for (const k of REQUIRED) {
    if (p[k] === undefined || p[k] === null || p[k] === '') return `Thiếu field bắt buộc: ${k}`;
  }
  if (typeof p.amount !== 'number' || p.amount < 0) return 'amount phải là số ≥ 0';
  if (!VALID_SOURCE.has(p.closeSource as string)) return 'closeSource không hợp lệ';
  if (!VALID_STATUS.has(p.status as string)) return 'status không hợp lệ';
  if (!VALID_SOURCESYSTEM.has(p.sourceSystem as string)) return 'sourceSystem không hợp lệ';
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

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canReadSales(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const reqBranchId = qs.get('branchId') || undefined;
    const from = qs.get('from') || undefined;
    const to = qs.get('to') || undefined;
    const closeSource = qs.get('closeSource') || qs.get('source') || undefined; // back-compat
    const status = qs.get('status') || undefined;
    const leadId = qs.get('leadId') || undefined;

    const scope = salesFilterForList(caller.profile);
    if (scope.branchIds && scope.branchIds.length === 0) return NextResponse.json({ rows: [] });
    if (reqBranchId && scope.branchIds && !scope.branchIds.includes(reqBranchId)) {
      return NextResponse.json({ error: 'Out of scope (branchId)' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL);
    if (reqBranchId) q = q.where('branchId', '==', reqBranchId);
    else if (scope.branchIds) {
      if (scope.branchIds.length === 1) q = q.where('branchId', '==', scope.branchIds[0]);
      else q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));
    }
    if (closeSource) q = q.where('closeSource', '==', closeSource);
    if (status) q = q.where('status', '==', status);
    if (leadId) q = q.where('leadId', '==', leadId);

    const snap = await q.limit(500).get();
    let rows = snap.docs.map((d) => serialize(d.id, d.data()));
    if (from || to) {
      rows = rows.filter((r) => {
        const ts = (r.createdAt ?? '') as string;
        if (from && ts < from) return false;
        if (to && ts > to + 'T23:59:59') return false;
        return true;
      });
    }
    rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[sales GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const payload = sanitize(body?.payload ?? {});
    const valErr = validateCreate(payload);
    if (valErr) return NextResponse.json({ error: valErr }, { status: 400 });

    if (!canCreateSale(caller.profile, { branchId: payload.branchId as string })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate leadId: phải tồn tại + cùng branch
    const db = getFirebaseAdminDb();
    const leadSnap = await db.collection(COLLECTIONS.LEADS).doc(payload.leadId as string).get();
    if (!leadSnap.exists) return NextResponse.json({ error: 'leadId không tồn tại' }, { status: 400 });
    const lead = leadSnap.data()!;
    if (lead.branchId !== payload.branchId) {
      return NextResponse.json({ error: 'Lead thuộc cơ sở khác — không tạo sale chéo cơ sở' }, { status: 400 });
    }
    if (lead.status === 'closed_lost') {
      return NextResponse.json({ error: 'Lead đã closed_lost — không tạo sale từ lead này' }, { status: 400 });
    }

    const now = new Date();
    const ref = await db.collection(COL).add({
      ...payload,
      createdAt: now,
      createdBy: caller.profile.uid,
      updatedAt: now,
      updatedBy: caller.profile.uid,
    });
    const created = (await ref.get()).data()!;

    // Auto chuyển lead.status → closed_won nếu sale confirmed
    if (payload.status === 'confirmed' && lead.status !== 'closed_won') {
      await db.collection(COLLECTIONS.LEADS).doc(payload.leadId as string).update({
        status: 'closed_won',
        updatedAt: now,
        updatedBy: caller.profile.uid,
      });
    }

    await writeAuditLog({
      action: 'create_sale',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: payload.branchId as string,
      before: null,
      after: { id: ref.id, ...payload },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    return NextResponse.json({ sale: serialize(ref.id, created) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[sales POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
