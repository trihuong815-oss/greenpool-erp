// GET  /api/sales-targets?year=2025         → list all branches có target năm Y
// POST /api/sales-targets  body: { entries: [{ year, branchId, monthTargets[12]?, leadTargets?: {source: number[12]} }] }
//      Bulk upsert. Doc ID deterministic: `{year}_{branchId}`.
//      Server tự tính yearTarget = sum(monthTargets), yearLeadTarget = sum tất cả leadTargets.
// CHỈ admin được POST. Mọi user signed-in đều GET.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canReadTargets, canWriteTarget, canWriteStaffTargets, targetsFilterForList } from '@/lib/firebase/sales-targets-scope';

const COL = COLLECTIONS.SALES_TARGETS;
const LEAD_SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;
type LeadSource = typeof LEAD_SOURCES[number];

function isValidMonthArr(arr: unknown): arr is number[] {
  return Array.isArray(arr) && arr.length === 12 && arr.every((x) => typeof x === 'number' && x >= 0 && Number.isFinite(x));
}
function sum12(arr: number[] | null | undefined): number {
  if (!arr) return 0;
  return arr.reduce((a, b) => a + (Number(b) || 0), 0);
}

function docId(year: number, branchId: string): string {
  return `${year}_${branchId}`;
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
    if (!canReadTargets(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const yearStr = req.nextUrl.searchParams.get('year');
    const year = yearStr ? Number(yearStr) : new Date().getFullYear();
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: 'year không hợp lệ' }, { status: 400 });
    }

    const scope = targetsFilterForList(caller.profile);
    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL).where('year', '==', year);
    if (scope.branchIds) {
      if (scope.branchIds.length === 0) return NextResponse.json({ rows: [] });
      if (scope.branchIds.length === 1) q = q.where('branchId', '==', scope.branchIds[0]);
      else q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));
    }
    const snap = await q.get();
    const rows = snap.docs.map((d) => serialize(d.id, d.data()));
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[targets GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const entries = Array.isArray(body?.entries) ? body.entries : null;
    if (!entries || entries.length === 0) return NextResponse.json({ error: 'Thiếu entries[]' }, { status: 400 });
    if (entries.length > 50) return NextResponse.json({ error: 'Quá 50 entries / 1 request' }, { status: 400 });

    for (const e of entries) {
      if (!e.year || !e.branchId) return NextResponse.json({ error: 'Entry thiếu year/branchId' }, { status: 400 });
      if (e.monthTargets !== undefined && e.monthTargets !== null && !isValidMonthArr(e.monthTargets)) {
        return NextResponse.json({ error: 'monthTargets phải mảng 12 số ≥ 0' }, { status: 400 });
      }
      if (e.leadTargets !== undefined && e.leadTargets !== null) {
        if (typeof e.leadTargets !== 'object') {
          return NextResponse.json({ error: 'leadTargets phải object {source: number[12]}' }, { status: 400 });
        }
        for (const src of LEAD_SOURCES) {
          const arr = e.leadTargets[src];
          if (arr === undefined || arr === null) continue;
          if (!isValidMonthArr(arr)) {
            return NextResponse.json({ error: `leadTargets.${src} phải mảng 12 số ≥ 0` }, { status: 400 });
          }
        }
      }
      // staffTargets: { [saleId]: number[12] }
      if (e.staffTargets !== undefined && e.staffTargets !== null) {
        if (typeof e.staffTargets !== 'object') {
          return NextResponse.json({ error: 'staffTargets phải object {saleId: number[12]}' }, { status: 400 });
        }
        for (const [sid, arr] of Object.entries(e.staffTargets)) {
          if (typeof sid !== 'string' || sid.length === 0) {
            return NextResponse.json({ error: `staffTargets: saleId không hợp lệ` }, { status: 400 });
          }
          if (!isValidMonthArr(arr)) {
            return NextResponse.json({ error: `staffTargets.${sid} phải mảng 12 số ≥ 0` }, { status: 400 });
          }
        }
      }

      // Permission: phân biệt field. yearTarget/monthTargets/leadTargets cần admin.
      // staffTargets cho phép QLCS branch mình. Nếu entry chỉ có staffTargets → check canWriteStaffTargets.
      const hasFullFields = e.monthTargets !== undefined || e.leadTargets !== undefined;
      const hasStaff = e.staffTargets !== undefined && e.staffTargets !== null;
      if (hasFullFields) {
        if (!canWriteTarget(caller.profile, e.branchId)) {
          return NextResponse.json({ error: `Forbidden cho branchId=${e.branchId} — chỉ admin set monthTargets/leadTargets` }, { status: 403 });
        }
      } else if (hasStaff) {
        if (!canWriteStaffTargets(caller.profile, e.branchId)) {
          return NextResponse.json({ error: `Forbidden cho branchId=${e.branchId} — chỉ admin hoặc QLCS branch mình set staffTargets` }, { status: 403 });
        }
      } else {
        // Entry rỗng — không có field nào để ghi
        return NextResponse.json({ error: 'Entry không có field nào để cập nhật' }, { status: 400 });
      }
    }

    const db = getFirebaseAdminDb();
    const now = new Date();

    // PR-TK3B (2026-06-21): pre-read snapshots TRƯỚC khi ghi → audit log có before+after
    // để diff được. Pattern same M2.1 PR-3B (read trước transaction). Safe vì sales-targets
    // không cần atomic giữa read/write — race chỉ ms-level, audit chấp nhận.
    const beforeSnapshots = new Map<string, Record<string, any> | null>();
    await Promise.all(entries.map(async (e: { year: number; branchId: string }) => {
      const id = docId(e.year, e.branchId);
      const snap = await db.collection(COL).doc(id).get();
      beforeSnapshots.set(id, snap.exists ? snap.data() ?? null : null);
    }));

    const batch = db.batch();
    const auditDiffs: Array<{ id: string; branchId: string; year: number; before: any; after: any }> = [];
    for (const e of entries) {
      const id = docId(e.year, e.branchId);
      const docRef = db.collection(COL).doc(id);

      // Build patch: chỉ ghi field nào có trong entry. Dùng merge:true để không reset field khác.
      const patch: Record<string, unknown> = {
        year: e.year,
        branchId: e.branchId,
        updatedAt: now,
        updatedBy: caller.profile.uid,
        createdAt: now,            // sẽ giữ nếu doc cũ đã có createdAt (merge)
        createdBy: caller.profile.uid,
      };

      if (e.monthTargets !== undefined) {
        const monthTargets: number[] | null = isValidMonthArr(e.monthTargets) ? e.monthTargets : null;
        patch.monthTargets = monthTargets;
        patch.yearTarget = monthTargets ? sum12(monthTargets) : 0;
      }

      if (e.leadTargets !== undefined) {
        let leadTargets: Record<LeadSource, number[]> | null = null;
        let yearLeadTarget = 0;
        if (e.leadTargets && typeof e.leadTargets === 'object') {
          const lt: Record<string, number[]> = {};
          let any = false;
          for (const src of LEAD_SOURCES) {
            const arr = e.leadTargets[src];
            if (isValidMonthArr(arr)) {
              lt[src] = arr;
              yearLeadTarget += sum12(arr);
              any = true;
            } else {
              lt[src] = Array(12).fill(0);
            }
          }
          if (any) leadTargets = lt as Record<LeadSource, number[]>;
        }
        patch.leadTargets = leadTargets;
        patch.yearLeadTarget = yearLeadTarget;
      }

      if (e.staffTargets !== undefined) {
        // Lưu nguyên { saleId: number[12] }
        const st: Record<string, number[]> = {};
        if (e.staffTargets && typeof e.staffTargets === 'object') {
          for (const [sid, arr] of Object.entries(e.staffTargets)) {
            if (isValidMonthArr(arr)) st[sid] = arr as number[];
          }
        }
        patch.staffTargets = Object.keys(st).length > 0 ? st : null;
      }

      batch.set(docRef, patch, { merge: true });

      // Collect cho audit log — trích chỉ field thay đổi để gọn
      const before = beforeSnapshots.get(id) ?? null;
      const beforeSlim = before ? {
        monthTargets: before.monthTargets ?? null,
        staffTargets: before.staffTargets ?? null,
        leadTargets: before.leadTargets ?? null,
      } : null;
      const afterSlim: Record<string, unknown> = {};
      if (e.monthTargets !== undefined) afterSlim.monthTargets = patch.monthTargets;
      if (e.staffTargets !== undefined) afterSlim.staffTargets = patch.staffTargets;
      if (e.leadTargets !== undefined) afterSlim.leadTargets = patch.leadTargets;
      auditDiffs.push({
        id, branchId: e.branchId, year: e.year,
        before: beforeSlim, after: afterSlim,
      });
    }
    await batch.commit();

    // PR-TK3B: ghi audit log với before+after snapshot per entry để diff được.
    // 1 audit log gộp tất cả entries (1 request = 1 audit row).
    await writeAuditLog({
      action: 'bulk_upsert_sales_targets',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: entries.length === 1 ? entries[0].branchId : null,
      before: entries.length === 1 ? auditDiffs[0].before : { count: entries.length },
      after: entries.length === 1
        ? auditDiffs[0].after
        : { count: entries.length, year: entries[0].year, diffs: auditDiffs },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ written: entries.length });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[targets POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
