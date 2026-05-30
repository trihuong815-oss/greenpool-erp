// GET  /api/leads?branchId=HM&from=2026-05-01&to=2026-05-31&inputSource=MKT&status=new
// POST /api/leads — create lead

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canCreateLead, canReadLeads, leadsFilterForList } from '@/lib/firebase/leads-scope';

const COL = COLLECTIONS.LEADS;

const VALID_SOURCE = new Set(['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in']);
const VALID_STATUS = new Set(['new', 'contacted', 'qualified', 'closed_won', 'closed_lost']);
const VALID_SOURCESYSTEM = new Set(['manual', 'crm', 'csv']);

const FIELDS = [
  'inputSource', 'assignedSaleId', 'branchId', 'status',
  'customerName', 'customerPhone',
  'crmLeadId', 'crmCustomerId', 'sourceSystem', 'syncedAt', 'externalRef',
] as const;

const REQUIRED = ['inputSource', 'assignedSaleId', 'branchId', 'status'] as const;

function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of FIELDS) if (k in body) out[k] = body[k];
  if (typeof out.syncedAt === 'string') out.syncedAt = new Date(out.syncedAt as string);
  out.sourceSystem ??= 'manual';
  out.crmLeadId ??= null;
  out.crmCustomerId ??= null;
  out.syncedAt ??= null;
  out.externalRef ??= null;
  return out;
}

function validateCreate(p: Record<string, unknown>): string | null {
  for (const k of REQUIRED) {
    if (p[k] === undefined || p[k] === null || p[k] === '') return `Thiếu field bắt buộc: ${k}`;
  }
  if (!VALID_SOURCE.has(p.inputSource as string)) return `inputSource không hợp lệ`;
  if (!VALID_STATUS.has(p.status as string)) return `status không hợp lệ`;
  if (!VALID_SOURCESYSTEM.has(p.sourceSystem as string)) return `sourceSystem không hợp lệ`;
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
    if (!canReadLeads(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const reqBranchId = qs.get('branchId') || undefined;
    const from = qs.get('from') || undefined;
    const to = qs.get('to') || undefined;
    const inputSource = qs.get('inputSource') || undefined;
    const status = qs.get('status') || undefined;

    const scope = leadsFilterForList(caller.profile);
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
    if (inputSource) q = q.where('inputSource', '==', inputSource);
    if (status) q = q.where('status', '==', status);

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
    console.error('[leads GET]', e);
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

    if (!canCreateLead(caller.profile, { branchId: payload.branchId as string })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();

    // Validate assignedSaleId: phải tồn tại + role NV_SALE + cùng branchId
    const saleSnap = await db.collection(COLLECTIONS.USERS).doc(payload.assignedSaleId as string).get();
    if (!saleSnap.exists) {
      return NextResponse.json({ error: 'assignedSaleId không tồn tại' }, { status: 400 });
    }
    const saleData = saleSnap.data() as { role_code?: string; facility_id?: string } | undefined;
    if (saleData?.role_code !== 'NV_SALE' && saleData?.role_code !== 'NV_SALE_PT') {
      return NextResponse.json({ error: 'assignedSaleId phải là nhân viên Sale (NV_SALE hoặc NV_SALE_PT)' }, { status: 400 });
    }
    if (saleData?.facility_id !== payload.branchId) {
      return NextResponse.json({ error: 'assignedSaleId phải thuộc cùng cơ sở với lead' }, { status: 400 });
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

    await writeAuditLog({
      action: 'create_lead',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: payload.branchId as string,
      before: null,
      after: { id: ref.id, ...payload },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    return NextResponse.json({ lead: serialize(ref.id, created) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[leads POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
