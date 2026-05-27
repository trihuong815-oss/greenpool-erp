// GET  /api/sales-entries?period=2025-01&periodType=month&branchId=HM
// POST /api/sales-entries  body: { entries: SalesEntryUpsert[] }
//      Bulk upsert (deterministic doc ID = {periodType}_{period}_{branchId}_{saleId}_{source}).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  canReadEntries, canWriteEntry, entriesFilterForList,
} from '@/lib/firebase/sales-entries-scope';

const COL = COLLECTIONS.SALES_ENTRIES;
const VALID_SOURCE = new Set(['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in']);
const VALID_PERIOD_TYPE = new Set(['month', 'day']);

function docId(periodType: string, period: string, branchId: string, saleId: string, source: string): string {
  return `${periodType}_${period}_${branchId}_${saleId}_${source}`;
}

function parsePeriod(periodType: string, period: string): { year: number; month: number; day?: number } | null {
  if (periodType === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) return null;
    return { year: Number(m[1]), month: Number(m[2]) };
  }
  if (periodType === 'day') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
    if (!m) return null;
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  }
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
    if (!canReadEntries(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const branchId = qs.get('branchId');
    const period = qs.get('period');
    const periodType = qs.get('periodType');
    // NEW cross-mode query: year+month+branch → fetch all docs trong calendar month (cả 2 mode).
    const year = qs.get('year') ? Number(qs.get('year')) : null;
    const month = qs.get('month') ? Number(qs.get('month')) : null;

    if (!branchId) return NextResponse.json({ error: 'Thiếu branchId' }, { status: 400 });

    const scope = entriesFilterForList(caller.profile);
    if (scope.branchIds && !scope.branchIds.includes(branchId)) {
      return NextResponse.json({ error: 'Out of scope (branchId)' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL).where('branchId', '==', branchId);
    if (year !== null && month !== null) {
      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return NextResponse.json({ error: 'year/month không hợp lệ' }, { status: 400 });
      }
      q = q.where('year', '==', year).where('month', '==', month);
    } else if (period && periodType) {
      if (!VALID_PERIOD_TYPE.has(periodType)) {
        return NextResponse.json({ error: 'periodType phải là month hoặc day' }, { status: 400 });
      }
      q = q.where('period', '==', period).where('periodType', '==', periodType);
    } else {
      return NextResponse.json({ error: 'Phải có (period+periodType) hoặc (year+month)' }, { status: 400 });
    }
    const snap = await q.get();
    const rows = snap.docs.map((d) => serialize(d.id, d.data()));
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[entries GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const entries = Array.isArray(body?.entries) ? body.entries : null;
    if (!entries) {
      return NextResponse.json({ error: 'Thiếu entries[]' }, { status: 400 });
    }
    if (entries.length > 200) {
      return NextResponse.json({ error: 'Quá 200 entries / 1 request' }, { status: 400 });
    }
    // entries.length === 0 → no-op; cho phép để client gọi "save trống" không lỗi.
    if (entries.length === 0) {
      return NextResponse.json({ written: 0, deleted: 0 });
    }

    // Validate + scope check
    for (const e of entries) {
      if (!e.period || !e.periodType || !e.branchId || !e.saleId || !e.source) {
        return NextResponse.json({ error: 'Entry thiếu field bắt buộc' }, { status: 400 });
      }
      if (!VALID_PERIOD_TYPE.has(e.periodType)) {
        return NextResponse.json({ error: `periodType không hợp lệ: ${e.periodType}` }, { status: 400 });
      }
      if (!VALID_SOURCE.has(e.source)) {
        return NextResponse.json({ error: `source không hợp lệ: ${e.source}` }, { status: 400 });
      }
      const parsed = parsePeriod(e.periodType, e.period);
      if (!parsed) {
        return NextResponse.json({ error: `period không hợp lệ: ${e.period}` }, { status: 400 });
      }
      // packages/revenue là legacy field — không còn ghi mới; bỏ qua nếu client gửi.
      for (const k of ['leads', 'closed', 'notClosed']) {
        const v = e[k];
        if (typeof v !== 'number' || v < 0 || !Number.isFinite(v)) {
          return NextResponse.json({ error: `${k} phải là số ≥ 0` }, { status: 400 });
        }
      }
      if (!canWriteEntry(caller.profile, e.branchId)) {
        return NextResponse.json({ error: `Forbidden cho branchId=${e.branchId}` }, { status: 403 });
      }
    }

    // Bulk upsert
    // Entry có leads+closed+notClosed === 0 → DELETE doc (cho phép user xoá bằng cách set về 0).
    // Tránh upsert doc rỗng gây nhiễu aggregation.
    //
    // CROSS-MODE replacement: nếu entry là month-mode, cũng xoá mọi day-mode doc same (branch, year, month).
    // Lý do: user nhập tháng = "đây là số chốt cho tháng" → mọi day-mode đã nhập bị thay thế.
    // Trước đây không xoá → day-mode tồn tại song song → summary tổng vẫn show số cũ → user tưởng xoá không thành.
    const db = getFirebaseAdminDb();
    const now = new Date();
    const batch = db.batch();
    let auditBranchId: string | null = null;
    let written = 0;
    let deleted = 0;

    // Collect (branch, year, month) cần xoá day-mode docs khi có entry month-mode trong cùng phạm vi
    const monthScopesToClear = new Set<string>();
    for (const e of entries) {
      if (e.periodType === 'month') {
        const p = parsePeriod('month', e.period);
        if (p) monthScopesToClear.add(`${e.branchId}__${p.year}__${p.month}`);
      }
    }
    for (const scope of monthScopesToClear) {
      const [bid, yStr, mStr] = scope.split('__');
      const y = Number(yStr); const mm = Number(mStr);
      const daySnap = await db.collection(COL)
        .where('branchId', '==', bid)
        .where('year', '==', y)
        .where('month', '==', mm)
        .where('periodType', '==', 'day')
        .get();
      for (const d of daySnap.docs) { batch.delete(d.ref); deleted++; }
    }

    for (const e of entries) {
      const id = docId(e.periodType, e.period, e.branchId, e.saleId, e.source);
      const ref = db.collection(COL).doc(id);
      auditBranchId = e.branchId;
      const allZero = e.leads === 0 && e.closed === 0 && e.notClosed === 0;
      if (allZero) {
        batch.delete(ref);
        deleted++;
        continue;
      }
      const parsed = parsePeriod(e.periodType, e.period)!;
      batch.set(ref, {
        period: e.period,
        periodType: e.periodType,
        year: parsed.year,
        month: parsed.month,
        ...(parsed.day !== undefined ? { day: parsed.day } : {}),
        branchId: e.branchId,
        saleId: e.saleId,
        saleName: e.saleName ?? '',
        source: e.source,
        leads: e.leads,
        closed: e.closed,
        notClosed: e.notClosed,
        sourceSystem: 'manual',
        updatedAt: now,
        updatedBy: caller.profile.uid,
        createdAt: now,
        createdBy: caller.profile.uid,
      }, { merge: true });
      written++;
    }

    await batch.commit();

    await writeAuditLog({
      action: 'bulk_upsert_sales_entries',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: auditBranchId,
      before: null,
      after: { written, deleted, period: entries[0].period, periodType: entries[0].periodType },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    return NextResponse.json({ written, deleted });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[entries POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
