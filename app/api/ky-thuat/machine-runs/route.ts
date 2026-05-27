// /api/ky-thuat/machine-runs — Giờ chạy thực tế per (branch × date × machine)
//
// GET ?year=2026                       → tổng năm (cho mọi cơ sở trong scope)
// GET ?year=2026&branchId=HM           → 1 cơ sở năm
// GET ?year=2026&branchId=HM&month=5   → entries chi tiết tháng
// POST   → bulk upsert {entries: [{branchId, date, machineId, hoursRun, notes?}]}
// DELETE ?id=<docId>
//
// DocId: `${date}_${branchId}_${machineId}` (unique 1 doc/máy/ngày — upsert replace)

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  kyThuatReadScope, canWriteMachineRun, canDeleteMachineRunAsBoss,
  canReadMachine, isValidCttSubArea,
} from '@/lib/firebase/ky-thuat-scope';

const COL = COLLECTIONS.MACHINE_RUNS;
const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

function docId(date: string, branchId: string, machineId: string): string {
  return `${date}_${branchId}_${machineId}`;
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
    const scope = kyThuatReadScope(caller.profile);
    if (scope.branchIds && scope.branchIds.length === 0) return NextResponse.json({ rows: [] });

    const qs = req.nextUrl.searchParams;
    const year = Number(qs.get('year'));
    const month = qs.get('month') ? Number(qs.get('month')) : null;
    const branchId = qs.get('branchId');
    if (!Number.isFinite(year)) return NextResponse.json({ error: 'year không hợp lệ' }, { status: 400 });
    if (branchId && scope.branchIds && !scope.branchIds.includes(branchId)) {
      return NextResponse.json({ error: 'Out of scope' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL).where('year', '==', year);
    if (branchId) q = q.where('branchId', '==', branchId);
    else if (scope.branchIds) {
      if (scope.branchIds.length === 1) q = q.where('branchId', '==', scope.branchIds[0]);
      else q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));
    }
    if (month !== null) q = q.where('month', '==', month);
    const snap = await q.get();
    const rows = snap.docs
      .map((d) => serialize(d.id, d.data()))
      .filter((r) => canReadMachine(
        caller.profile,
        String(r.branchId),
        isValidCttSubArea(r.machineSubArea) ? r.machineSubArea : null,
      ))
      .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
    return NextResponse.json({ rows });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[machine-runs GET]', e);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const entries: Array<{ branchId: string; date: string; machineId: string; machineName?: string; machineType?: string; hoursRun: number; notes?: string }> = Array.isArray(body?.entries) ? body.entries : [];
    if (entries.length === 0) return NextResponse.json({ error: 'Thiếu entries' }, { status: 400 });
    if (entries.length > 100) return NextResponse.json({ error: 'Quá 100 entries' }, { status: 400 });

    // Validate + permission
    for (const e of entries) {
      if (!(ALL_BRANCHES as readonly string[]).includes(e.branchId)) {
        return NextResponse.json({ error: `branchId không hợp lệ: ${e.branchId}` }, { status: 400 });
      }
      const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.date);
      if (!dateMatch) return NextResponse.json({ error: `date không hợp lệ: ${e.date}` }, { status: 400 });
      if (!e.machineId) return NextResponse.json({ error: 'Thiếu machineId' }, { status: 400 });
      if (typeof e.hoursRun !== 'number' || e.hoursRun < 0 || e.hoursRun > 24) {
        return NextResponse.json({ error: 'hoursRun phải 0-24' }, { status: 400 });
      }
      if (!canWriteMachineRun(caller.profile, e.branchId)) {
        return NextResponse.json({ error: `Không có quyền cho branch ${e.branchId}` }, { status: 403 });
      }
    }

    const db = getFirebaseAdminDb();
    // Denorm machine fields (subArea + standardCapacity + capacityUnit) từ machines/{id}.
    // Đọc batch 1 lần cho tất cả entries hoursRun > 0 — dù branch nào (capacity dùng cho mọi cơ sở).
    const machineIds = Array.from(new Set(entries
      .filter((e) => e.hoursRun > 0)
      .map((e) => e.machineId)));
    interface MachineMeta { subArea: string | null; capacity: number; capacityUnit: string }
    const machineMetaById = new Map<string, MachineMeta>();
    if (machineIds.length > 0) {
      const mSnaps = await Promise.all(machineIds.map((id) => db.collection(COLLECTIONS.MACHINES).doc(id).get()));
      for (const ms of mSnaps) {
        if (ms.exists) {
          const md = ms.data() ?? {};
          machineMetaById.set(ms.id, {
            subArea: isValidCttSubArea(md.subArea) ? md.subArea : null,
            capacity: Number(md.standardCapacity ?? 0),
            capacityUnit: String(md.capacityUnit ?? ''),
          });
        }
      }
    }
    const batch = db.batch();
    const now = new Date();
    let written = 0;
    let deleted = 0;
    for (const e of entries) {
      const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.date)!;
      const year = Number(dateMatch[1]);
      const month = Number(dateMatch[2]);
      const day = Number(dateMatch[3]);
      const id = docId(e.date, e.branchId, e.machineId);
      const ref = db.collection(COL).doc(id);
      if (e.hoursRun === 0) {
        batch.delete(ref);
        deleted++;
      } else {
        const meta = machineMetaById.get(e.machineId);
        batch.set(ref, {
          branchId: e.branchId,
          machineSubArea: e.branchId === 'CTT' ? (meta?.subArea ?? null) : null,
          year, month, day, date: e.date,
          machineId: e.machineId,
          machineName: e.machineName ?? '',
          machineType: e.machineType ?? '',
          hoursRun: Math.round(e.hoursRun * 100) / 100,
          // Denorm capacity snapshot tại thời điểm nhập — đảm bảo MonthView sum = BranchView/Dashboard cùng giá trị
          capacity: meta?.capacity ?? 0,
          capacityUnit: meta?.capacityUnit ?? '',
          notes: e.notes ?? null,
          updatedAt: now,
          updatedBy: caller.profile.uid,
          updatedByName: caller.actorName ?? '',
          createdAt: now,
          createdBy: caller.profile.uid,
        }, { merge: true });
        written++;
      }
    }
    if (written + deleted > 0) await batch.commit();

    await writeAuditLog({
      action: 'upsert_machine_runs', module: 'ky-thuat',
      userId: caller.profile.uid,
      branchId: entries[0]?.branchId ?? null,
      before: null, after: { written, deleted, date: entries[0]?.date },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    return NextResponse.json({ ok: true, written, deleted });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[machine-runs POST]', e);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;

    const isBoss = canDeleteMachineRunAsBoss(caller.profile);
    const isOwner = data.createdBy === caller.profile.uid;
    if (!isBoss && !isOwner) return NextResponse.json({ error: 'Không có quyền xoá' }, { status: 403 });
    if (!isBoss && caller.profile.facility_id !== data.branchId) {
      return NextResponse.json({ error: 'Out of scope' }, { status: 403 });
    }
    await ref.delete();
    await writeAuditLog({
      action: 'delete_machine_run', module: 'ky-thuat',
      userId: caller.profile.uid, branchId: data.branchId,
      before: { id, date: data.date, machineId: data.machineId, hoursRun: data.hoursRun },
      after: null,
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[machine-runs DELETE]', e);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}
