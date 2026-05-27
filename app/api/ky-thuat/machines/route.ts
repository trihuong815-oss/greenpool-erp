// /api/ky-thuat/machines — Setup máy (catalog) per branch
// Quyền: TP_KT + PP_HT + admin CRUD. Mọi tech-role READ.
//
// GET ?branchId=HM             → list máy của 1 cơ sở
// POST    → create máy (name, type, standardCapacity, sortOrder)
// PATCH   → update máy
// DELETE  → xoá máy
//
// Schema: { branchId, name, type: 'loc'|'nhiet', standardCapacity, capacityUnit, sortOrder, active, createdAt, updatedAt }

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  kyThuatReadScope, canSetupMachines, canReadMachine, isValidCttSubArea, type CttSubArea,
} from '@/lib/firebase/ky-thuat-scope';

const COL = COLLECTIONS.MACHINES;
const VALID_TYPE = new Set(['loc', 'nhiet']);
const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

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
    const scope = kyThuatReadScope(caller.profile);
    if (scope.branchIds && scope.branchIds.length === 0) return NextResponse.json({ rows: [] });

    const branchId = req.nextUrl.searchParams.get('branchId');
    if (branchId && scope.branchIds && !scope.branchIds.includes(branchId)) {
      return NextResponse.json({ error: 'Out of scope' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL);
    if (branchId) q = q.where('branchId', '==', branchId);
    else if (scope.branchIds) {
      if (scope.branchIds.length === 1) q = q.where('branchId', '==', scope.branchIds[0]);
      else q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));
    }
    const snap = await q.get();
    const rows = snap.docs
      .map((d) => serialize(d.id, d.data()))
      .filter((r) => canReadMachine(
        caller.profile,
        String(r.branchId),
        isValidCttSubArea(r.subArea) ? r.subArea : null,
      ))
      .sort((a, b) => {
        const t = String(a.type).localeCompare(String(b.type));
        if (t !== 0) return t;
        return (Number(a.sortOrder ?? 0)) - (Number(b.sortOrder ?? 0));
      });
    return NextResponse.json({ rows });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[machines GET]', e);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canSetupMachines(caller.profile)) {
      return NextResponse.json({ error: 'Chỉ TP_KT / PP_HT / admin được setup máy' }, { status: 403 });
    }
    const body = await req.json();
    const branchId: string = String(body?.branchId ?? '').trim();
    const name: string = String(body?.name ?? '').trim();
    const type: string = String(body?.type ?? '').trim();
    const standardCapacity = Number(body?.standardCapacity);
    // Cả lọc + nhiệt đều đo công suất điện chạy máy → mặc định 'kW' (× h = kWh)
    const capacityUnit: string = String(body?.capacityUnit ?? '').trim() || 'kW';
    const sortOrder = Number(body?.sortOrder ?? 0);
    const subAreaRaw = body?.subArea;
    const subArea: CttSubArea | null = isValidCttSubArea(subAreaRaw) ? subAreaRaw : null;

    if (!(ALL_BRANCHES as readonly string[]).includes(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    if (!VALID_TYPE.has(type)) return NextResponse.json({ error: 'type phải là loc hoặc nhiet' }, { status: 400 });
    if (!name || name.length < 1 || name.length > 80) return NextResponse.json({ error: 'name 1-80 ký tự' }, { status: 400 });
    if (!Number.isFinite(standardCapacity) || standardCapacity < 0) {
      return NextResponse.json({ error: 'standardCapacity phải ≥ 0' }, { status: 400 });
    }
    // CTT bể ngoài trời chỉ có máy lọc (constraint nghiệp vụ — user đã chốt)
    if (branchId === 'CTT' && subArea === 'outdoor' && type !== 'loc') {
      return NextResponse.json({ error: 'Bể ngoài trời CTT chỉ có máy lọc, không có máy nhiệt' }, { status: 400 });
    }

    const now = new Date();
    const db = getFirebaseAdminDb();
    const ref = await db.collection(COL).add({
      branchId,
      subArea: branchId === 'CTT' ? subArea : null,
      name, type,
      standardCapacity: Math.round(standardCapacity * 100) / 100,
      capacityUnit,
      sortOrder: Math.floor(sortOrder),
      active: true,
      createdAt: now, createdBy: caller.profile.uid,
      updatedAt: now, updatedBy: caller.profile.uid,
    });
    await writeAuditLog({
      action: 'create_machine', module: 'ky-thuat',
      userId: caller.profile.uid, branchId,
      before: null, after: { id: ref.id, name, type, standardCapacity, capacityUnit },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[machines POST]', e);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canSetupMachines(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json();
    const id = String(body?.id ?? '');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    const patch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: caller.profile.uid };
    if (typeof body.name === 'string') patch.name = body.name.trim().slice(0, 80);
    if (typeof body.standardCapacity === 'number' && body.standardCapacity >= 0) {
      patch.standardCapacity = Math.round(body.standardCapacity * 100) / 100;
    }
    if (typeof body.capacityUnit === 'string') patch.capacityUnit = body.capacityUnit.trim();
    if (typeof body.sortOrder === 'number') patch.sortOrder = Math.floor(body.sortOrder);
    if (typeof body.active === 'boolean') patch.active = body.active;
    // Cho phép PATCH subArea — chỉ áp dụng CTT
    if (snap.data()?.branchId === 'CTT' && body.subArea !== undefined) {
      patch.subArea = isValidCttSubArea(body.subArea) ? body.subArea : null;
    }
    await ref.update(patch);
    await writeAuditLog({
      action: 'update_machine', module: 'ky-thuat',
      userId: caller.profile.uid, branchId: snap.data()?.branchId ?? null,
      before: null, after: { id, ...patch },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[machines PATCH]', e);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canSetupMachines(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const x = snap.data()!;
    await ref.delete();
    await writeAuditLog({
      action: 'delete_machine', module: 'ky-thuat',
      userId: caller.profile.uid, branchId: x.branchId,
      before: { id, name: x.name, type: x.type }, after: null,
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[machines DELETE]', e);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}
