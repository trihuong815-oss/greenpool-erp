// GET  /api/package-quantities?year=2026&month=5&branchId=HM
// POST /api/package-quantities  body: { year, month, branchId, replace?: true, entries: [{ packageId, packageName, groupId, groupName, quantity }] }
//
// Purpose: track CƠ CẤU SỐ LƯỢNG gói dịch vụ theo tháng × cơ sở.
// Tách hẳn khỏi packageSales (chỉ track doanh số per sale, không track qty theo package).
// Mode: tháng only — không cần day-level cho composition reporting.
// Doc ID deterministic: `${year}_${month}_${branchId}_${packageId}`.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  canReadPackageSales, canWritePackageSale, packageSalesFilterForList,
} from '@/lib/firebase/package-sales-scope';

const COL = COLLECTIONS.PACKAGE_QUANTITIES;

function docId(year: number, month: number, branchId: string, packageId: string): string {
  return `${year}_${String(month).padStart(2, '0')}_${branchId}_${packageId}`;
}

function serialize(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  return out;
}

function validatePeriod(year: number, month: number): string | null {
  if (!Number.isFinite(year) || year < 2020 || year > 2100) return 'year không hợp lệ';
  if (!Number.isFinite(month) || month < 1 || month > 12) return 'month phải 1-12';
  return null;
}

// ─────────── GET ───────────
export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canReadPackageSales(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const year = Number(qs.get('year'));
    const month = Number(qs.get('month'));
    const branchId = qs.get('branchId');
    const yearOnly = qs.get('yearOnly') === 'true';
    if (!branchId) return NextResponse.json({ error: 'Thiếu branchId' }, { status: 400 });
    const yerr = validatePeriod(year, yearOnly ? 1 : month);
    if (yerr) return NextResponse.json({ error: yerr }, { status: 400 });

    const scope = packageSalesFilterForList(caller.profile);
    if (scope.branchIds && !scope.branchIds.includes(branchId)) {
      return NextResponse.json({ error: 'Out of scope (branchId)' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL)
      .where('branchId', '==', branchId)
      .where('year', '==', year);
    if (!yearOnly) q = q.where('month', '==', month);

    const snap = await q.get();
    const rows = snap.docs.map((d) => serialize(d.id, d.data()));
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[package-quantities GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─────────── POST: bulk upsert ───────────
export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const year = Number(body?.year);
    const month = Number(body?.month);
    const branchId: string = body?.branchId;
    const replaceMode: boolean = body?.replace === true;
    const entries = Array.isArray(body?.entries) ? body.entries : null;

    if (!branchId || !entries) {
      return NextResponse.json({ error: 'Thiếu branchId/entries' }, { status: 400 });
    }
    const yerr = validatePeriod(year, month);
    if (yerr) return NextResponse.json({ error: yerr }, { status: 400 });
    if (entries.length > 500) return NextResponse.json({ error: 'Quá 500 entries / 1 request' }, { status: 400 });
    if (!canWritePackageSale(caller.profile, branchId)) {
      return NextResponse.json({ error: `Forbidden cho branchId=${branchId}` }, { status: 403 });
    }

    // Validate fields — cả quantity + revenue optional, nhưng phải có ít nhất 1 trong batch entry.
    for (const e of entries) {
      for (const k of ['packageId', 'groupId']) {
        if (!e[k]) return NextResponse.json({ error: `Entry thiếu ${k}` }, { status: 400 });
      }
      const hasQty = e.quantity !== undefined && e.quantity !== null;
      const hasRev = e.revenue !== undefined && e.revenue !== null;
      if (!hasQty && !hasRev) {
        return NextResponse.json({ error: 'Entry phải có ít nhất quantity hoặc revenue' }, { status: 400 });
      }
      if (hasQty) {
        const q = Number(e.quantity);
        if (!Number.isFinite(q) || q < 0) {
          return NextResponse.json({ error: 'quantity phải là số ≥ 0' }, { status: 400 });
        }
        e.quantity = Math.round(q);
      }
      if (hasRev) {
        const rev = Number(e.revenue);
        if (!Number.isFinite(rev) || rev < 0) {
          return NextResponse.json({ error: 'revenue phải là số ≥ 0' }, { status: 400 });
        }
        e.revenue = Math.round(rev);
      }
    }

    // Validate package exists in branch
    const db = getFirebaseAdminDb();
    const pkgIds: string[] = Array.from(new Set(entries.map((e: any) => e.packageId as string)));
    const pkgSnap = await db.collection(COLLECTIONS.PACKAGES).where('branchId', '==', branchId).get();
    const validPkgs = new Map<string, { groupId: string }>();
    pkgSnap.docs.forEach((d) => validPkgs.set(d.id, { groupId: d.data().groupId }));
    for (const pid of pkgIds) {
      if (!validPkgs.has(pid)) {
        return NextResponse.json({ error: `Package ${pid} không thuộc branch ${branchId}` }, { status: 400 });
      }
    }
    // Auto-correct groupId từ catalog
    for (const e of entries) {
      const real = validPkgs.get(e.packageId);
      if (real) e.groupId = real.groupId;
    }

    // Replace mode: xoá docs cũ của (year, month, branch) không có trong batch mới
    const newIds = new Set(entries.map((e: any) => docId(year, month, branchId, e.packageId)));
    if (replaceMode) {
      const existingSnap = await db.collection(COL)
        .where('year', '==', year)
        .where('month', '==', month)
        .where('branchId', '==', branchId)
        .get();
      const toDelete = existingSnap.docs.filter((d) => !newIds.has(d.id));
      const batchDel = db.batch();
      toDelete.forEach((d) => batchDel.delete(d.ref));
      if (toDelete.length > 0) await batchDel.commit();
    }

    // Bulk upsert.
    // Mỗi entry chỉ update field nào được gửi (quantity và/hoặc revenue). Merge preserve field cũ.
    // Doc giữ nếu quantity > 0 HOẶC revenue > 0. Cả 2 = 0 → xoá ở cleanup pass dưới.
    const now = new Date();
    const batch = db.batch();
    let written = 0;
    let deleted = 0;
    for (const e of entries) {
      const id = docId(year, month, branchId, e.packageId);
      const ref = db.collection(COL).doc(id);
      const payload: Record<string, unknown> = {
        year, month, branchId,
        groupId: e.groupId, groupName: e.groupName ?? '',
        packageId: e.packageId, packageName: e.packageName ?? '',
        updatedAt: now, updatedBy: caller.profile.uid,
      };
      if (e.quantity !== undefined && e.quantity !== null) payload.quantity = e.quantity;
      if (e.revenue !== undefined && e.revenue !== null) payload.revenue = e.revenue;
      batch.set(ref, payload, { merge: true });
      written++;
    }
    if (written > 0) await batch.commit();

    // Cleanup pass: dọn docs mà sau merge có cả quantity=0 AND revenue=0.
    // Trường hợp: Form A gửi qty=0 cho package mà revenue cũ trong DB cũng = 0 (hoặc undefined).
    if (entries.length > 0) {
      const checkIds: string[] = Array.from(new Set(entries.map((e: any) => docId(year, month, branchId, e.packageId))));
      const cleanupBatch = db.batch();
      let cleanedUp = 0;
      const cleanSnaps = await Promise.all(checkIds.map((id: string) => db.collection(COL).doc(id).get()));
      for (const snap of cleanSnaps) {
        if (!snap.exists) continue;
        const x = snap.data() ?? {};
        const q = Number(x.quantity ?? 0);
        const r = Number(x.revenue ?? 0);
        if (q === 0 && r === 0) {
          cleanupBatch.delete(snap.ref);
          cleanedUp++;
        }
      }
      if (cleanedUp > 0) await cleanupBatch.commit();
      deleted += cleanedUp;
    }

    await writeAuditLog({
      action: 'upsert_package_quantities',
      module: 'sales',
      userId: caller.profile.uid,
      branchId,
      before: null,
      after: { year, month, branchId, written, replaceMode },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    return NextResponse.json({ ok: true, written, deleted });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[package-quantities POST]', e?.code, e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? 'unknown'), code: e?.code }, { status: 500 });
  }
}
