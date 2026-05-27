// /api/ky-thuat/chemicals — Quản lý hàm lượng hoá chất (clo + axit)
//
// GET ?year=2026&branchId=HM            → list năm cho 1 cơ sở
// GET ?year=2026                        → list năm cho mọi cơ sở user được xem (scope)
// GET ?year=2026&month=5&branchId=HM    → list 1 tháng 1 cơ sở (chi tiết entries)
// POST                                  → tạo 1 entry mới (KT_XLN cơ sở / admin)
// DELETE ?id=<docId>                    → xoá 1 entry
//
// Doc shape: { branchId, year, month, day, date, type: 'clo'|'axit', amount, batch?, addedBy, addedByName, addedAt, notes? }

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  kyThuatReadScope, canWriteChemical, canDeleteChemicalAsBoss, canReadChemicalEntry,
  isValidCttSubArea, type CttSubArea,
} from '@/lib/firebase/ky-thuat-scope';

const COL = COLLECTIONS.CHEMICAL_ENTRIES;
const VALID_TYPE = new Set(['clo', 'axit']);
const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

function isoNow(): string { return new Date().toISOString(); }
function serialize(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  return out;
}

// ─────────── GET ───────────
export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const scope = kyThuatReadScope(caller.profile);
    if (scope.branchIds && scope.branchIds.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const qs = req.nextUrl.searchParams;
    const year = Number(qs.get('year'));
    const month = qs.get('month') ? Number(qs.get('month')) : null;
    const branchId = qs.get('branchId');
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: 'year không hợp lệ' }, { status: 400 });
    }
    if (month !== null && (!Number.isFinite(month) || month < 1 || month > 12)) {
      return NextResponse.json({ error: 'month phải 1-12' }, { status: 400 });
    }
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
      .filter((r) => canReadChemicalEntry(
        caller.profile,
        String(r.branchId),
        isValidCttSubArea(r.subArea) ? r.subArea : null,
      ))
      .sort((a, b) => {
        // Sort theo date asc rồi addedAt asc
        const cmp = String(a.date ?? '').localeCompare(String(b.date ?? ''));
        if (cmp !== 0) return cmp;
        return String(a.addedAt ?? '').localeCompare(String(b.addedAt ?? ''));
      });
    return NextResponse.json({ rows });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chemicals GET]', e);
    return NextResponse.json({ error: 'Internal error: ' + (e?.message ?? '') }, { status: 500 });
  }
}

// ─────────── POST ───────────
export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const branchId: string = String(body?.branchId ?? '').trim();
    const date: string = String(body?.date ?? '').trim(); // YYYY-MM-DD
    const type: string = String(body?.type ?? '').trim();
    const amount = Number(body?.amount);
    const batch: string | null = body?.batch ? String(body.batch).trim() : null;
    const notes: string | null = body?.notes ? String(body.notes).trim() : null;
    const subAreaRaw = body?.subArea;
    const subArea: CttSubArea | null = isValidCttSubArea(subAreaRaw) ? subAreaRaw : null;

    if (!(ALL_BRANCHES as readonly string[]).includes(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    if (!VALID_TYPE.has(type)) {
      return NextResponse.json({ error: 'type phải là clo hoặc axit' }, { status: 400 });
    }
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!dateMatch) return NextResponse.json({ error: 'date phải định dạng YYYY-MM-DD' }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount phải > 0' }, { status: 400 });
    }
    // CTT bắt buộc subArea ('indoor'/'outdoor'/'kid'); các cơ sở khác bỏ qua.
    if (branchId === 'CTT' && !subArea) {
      return NextResponse.json({ error: 'CTT bắt buộc chọn bể (trong nhà / ngoài trời / vầy)' }, { status: 400 });
    }
    if (!canWriteChemical(caller.profile, branchId, subArea)) {
      return NextResponse.json({ error: 'Bạn không có quyền nhập hoá chất cho cơ sở/bể này' }, { status: 403 });
    }

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const now = new Date();
    const db = getFirebaseAdminDb();
    const docRef = await db.collection(COL).add({
      branchId,
      subArea: branchId === 'CTT' ? subArea : null,
      year, month, day, date,
      type,
      amount: Math.round(amount * 100) / 100, // 2 chữ số thập phân
      batch,
      notes,
      addedBy: caller.profile.uid,
      addedByName: caller.actorName ?? '',
      addedByRole: caller.profile.role_code,
      addedAt: now,
    });

    await writeAuditLog({
      action: 'create_chemical_entry',
      module: 'ky-thuat',
      userId: caller.profile.uid,
      branchId,
      before: null,
      after: { id: docRef.id, type, amount, date, batch, subArea: branchId === 'CTT' ? subArea : null },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chemicals POST]', e?.code, e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? 'unknown') }, { status: 500 });
  }
}

// ─────────── DELETE ───────────
export async function DELETE(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy entry' }, { status: 404 });
    const data = snap.data()!;

    // Permission: admin/TP/PP_XLN xoá bất kỳ. KT_XLN chỉ xoá entry mình tạo.
    const isBoss = canDeleteChemicalAsBoss(caller.profile);
    const isOwner = data.addedBy === caller.profile.uid;
    if (!isBoss && !isOwner) {
      return NextResponse.json({ error: 'Không có quyền xoá entry này' }, { status: 403 });
    }
    // KT_XLN owner cũng phải đúng cơ sở của mình (defensive)
    if (!isBoss && caller.profile.facility_id !== data.branchId) {
      return NextResponse.json({ error: 'Out of scope' }, { status: 403 });
    }
    // CTT defensive: owner KT_XLN_CTT phải đúng bể mình (nếu entry có subArea + user có sub_areas)
    if (!isBoss && data.branchId === 'CTT' && isValidCttSubArea(data.subArea)) {
      const userSubAreas = Array.isArray(caller.profile.sub_areas) ? caller.profile.sub_areas : [];
      if (userSubAreas.length > 0 && !userSubAreas.includes(data.subArea)) {
        return NextResponse.json({ error: 'Out of scope (sai bể)' }, { status: 403 });
      }
    }

    await ref.delete();
    await writeAuditLog({
      action: 'delete_chemical_entry',
      module: 'ky-thuat',
      userId: caller.profile.uid,
      branchId: data.branchId,
      before: { id, type: data.type, amount: data.amount, date: data.date },
      after: null,
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chemicals DELETE]', e);
    return NextResponse.json({ error: 'Internal error: ' + (e?.message ?? '') }, { status: 500 });
  }
}
