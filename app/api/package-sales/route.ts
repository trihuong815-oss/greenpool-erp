// GET  /api/package-sales?period=2025-01&periodType=month&branchId=HM
// POST /api/package-sales  body: { entries: [{ period, periodType, branchId, saleId, saleName, groupId, groupName, packageId, packageName, quantity, unitPrice, revenue }] }
// Doc ID deterministic: `{periodType}_{period}_{branchId}_{saleId}_{packageId}`

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  canReadPackageSales, canWritePackageSale, packageSalesFilterForList,
} from '@/lib/firebase/package-sales-scope';

const COL = COLLECTIONS.PACKAGE_SALES;
const VALID_PERIOD_TYPE = new Set(['month', 'day']);

function docId(periodType: string, period: string, branchId: string, saleId: string, packageId: string): string {
  return `${periodType}_${period}_${branchId}_${saleId}_${packageId}`;
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
    if (!canReadPackageSales(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const branchId = qs.get('branchId');
    const period = qs.get('period');
    const periodType = qs.get('periodType');
    // NEW: cross-mode query — fetch tất cả docs trong (year, month, branch), cả month-mode + day-mode.
    // Phục vụ form month-mode load() để thấy data day-mode đã nhập.
    const year = qs.get('year') ? Number(qs.get('year')) : null;
    const month = qs.get('month') ? Number(qs.get('month')) : null;

    if (!branchId) return NextResponse.json({ error: 'Thiếu branchId' }, { status: 400 });

    const scope = packageSalesFilterForList(caller.profile);
    if (scope.branchIds && !scope.branchIds.includes(branchId)) {
      return NextResponse.json({ error: 'Out of scope (branchId)' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL).where('branchId', '==', branchId);

    if (year !== null && month !== null) {
      // Cross-mode by calendar year+month
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
    console.error('[package-sales GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const entries = Array.isArray(body?.entries) ? body.entries : null;
    const replaceMode: boolean = body?.replace === true;
    if (!entries) return NextResponse.json({ error: 'Thiếu entries[]' }, { status: 400 });
    if (entries.length > 500) return NextResponse.json({ error: 'Quá 500 entries / 1 request' }, { status: 400 });

    // Validate
    for (const e of entries) {
      for (const k of ['period', 'periodType', 'branchId', 'saleId', 'packageId', 'groupId']) {
        if (!e[k]) return NextResponse.json({ error: `Entry thiếu ${k}` }, { status: 400 });
      }
      if (!VALID_PERIOD_TYPE.has(e.periodType)) {
        return NextResponse.json({ error: `periodType không hợp lệ` }, { status: 400 });
      }
      if (!parsePeriod(e.periodType, e.period)) {
        return NextResponse.json({ error: `period không hợp lệ: ${e.period}` }, { status: 400 });
      }
      for (const k of ['quantity', 'unitPrice', 'revenue']) {
        const v = e[k];
        if (typeof v !== 'number' || v < 0 || !Number.isFinite(v)) {
          return NextResponse.json({ error: `${k} phải là số ≥ 0` }, { status: 400 });
        }
      }
      // Verify revenue = quantity * unitPrice (server tự fix nếu lệch)
      const computed = Math.round(e.quantity * e.unitPrice);
      if (Math.abs(computed - e.revenue) > 1) {
        e.revenue = computed; // tự correct
      }
      if (!canWritePackageSale(caller.profile, e.branchId)) {
        return NextResponse.json({ error: `Forbidden cho branchId=${e.branchId}` }, { status: 403 });
      }
    }

    // Validate package + group exist + cùng branch (1 query nhóm packages theo branch)
    // Placeholder '__total' → SKIP validation (entry không gắn package cụ thể, chỉ là tổng doanh số theo sale).
    const db = getFirebaseAdminDb();
    if (entries.length > 0) {
      const branchId = entries[0].branchId;  // tất cả entries phải cùng branch trong 1 batch (UI guarantee)
      const allSameBranch = entries.every((e: any) => e.branchId === branchId);
      if (!allSameBranch) {
        return NextResponse.json({ error: 'Entries phải cùng 1 branch' }, { status: 400 });
      }
      // Tách entries: realPkgEntries cần validate; totalEntries (packageId='__total') skip.
      const realPkgEntries = entries.filter((e: any) => e.packageId !== '__total');
      const pkgIds: string[] = Array.from(new Set(realPkgEntries.map((e: any) => e.packageId as string)));
      if (pkgIds.length > 0) {
        const pkgSnap = await db.collection(COLLECTIONS.PACKAGES)
          .where('branchId', '==', branchId)
          .get();
        const validPkgs = new Map<string, { groupId: string }>();
        pkgSnap.docs.forEach((d) => validPkgs.set(d.id, { groupId: d.data().groupId }));
        for (const pid of pkgIds) {
          if (!validPkgs.has(pid)) {
            return NextResponse.json({ error: `Package ${pid} không thuộc branch ${branchId}` }, { status: 400 });
          }
        }
        // Verify groupId trong entry khớp với group thật của package
        for (const e of realPkgEntries) {
          const real = validPkgs.get(e.packageId);
          if (real && real.groupId !== e.groupId) {
            e.groupId = real.groupId; // tự correct
          }
        }
      }
      // Ép placeholder cho '__total': groupId='__total', groupName='(Tổng)', packageName='(Tổng theo sale)'.
      for (const e of entries) {
        if (e.packageId === '__total') {
          e.groupId = '__total';
          e.groupName = e.groupName ?? '(Tổng)';
          e.packageName = e.packageName ?? '(Tổng theo sale)';
        }
      }
    }

    // Bulk upsert + replace mode
    // Top-level period/periodType/branchId fallback: cho phép client gửi entries=[] với replace=true
    // để CLEAR toàn bộ data của (period, branchId) — user xoá data đã nhập.
    const now = new Date();
    const auditBranchId = entries.length > 0 ? entries[0].branchId : body?.branchId ?? null;
    const period = entries.length > 0 ? entries[0].period : body?.period ?? null;
    const periodType = entries.length > 0 ? entries[0].periodType : body?.periodType ?? null;

    // Permission check cho clear-all case (entries=[]) — đảm bảo user được phép xoá branch này.
    if (entries.length === 0 && auditBranchId && !canWritePackageSale(caller.profile, auditBranchId)) {
      return NextResponse.json({ error: `Forbidden cho branchId=${auditBranchId}` }, { status: 403 });
    }

    // Replace mode: xoá entries cũ.
    // - periodType='month' → quét theo (year, month, branchId) → xoá cả docs day-mode trong cùng tháng.
    //   Lý do: user nhập tháng = chốt số cho tháng đó → mọi data day-mode bị thay thế.
    //   Trước đây chỉ xoá same-mode → user "xoá" tháng nhưng day-mode còn → vẫn hiện ở summary.
    // - periodType='day' → chỉ quét đúng (period, periodType='day', branchId) — không đụng day khác hoặc month.
    if (replaceMode && period && periodType && auditBranchId) {
      let existingQ: FirebaseFirestore.Query = db.collection(COL).where('branchId', '==', auditBranchId);
      if (periodType === 'month') {
        const parsed = parsePeriod('month', period);
        if (parsed) {
          existingQ = existingQ.where('year', '==', parsed.year).where('month', '==', parsed.month);
        } else {
          existingQ = existingQ.where('period', '==', period).where('periodType', '==', periodType);
        }
      } else {
        existingQ = existingQ.where('period', '==', period).where('periodType', '==', periodType);
      }
      const existingSnap = await existingQ.get();
      const newIds = new Set(entries.map((e: any) => docId(e.periodType, e.period, e.branchId, e.saleId, e.packageId)));
      const toDelete = existingSnap.docs.filter((d) => !newIds.has(d.id));
      if (toDelete.length > 0) {
        const delBatch = db.batch();
        toDelete.forEach((d) => delBatch.delete(d.ref));
        await delBatch.commit();
      }
    }

    // Entry có quantity=0 && revenue=0 → DELETE doc (user xoá bằng cách set zero).
    const batch = db.batch();
    let written = 0;
    let deleted = 0;
    for (const e of entries) {
      const id = docId(e.periodType, e.period, e.branchId, e.saleId, e.packageId);
      const ref = db.collection(COL).doc(id);
      if (e.quantity === 0 && e.revenue === 0) {
        batch.delete(ref);
        deleted++;
        continue;
      }
      const parsed = parsePeriod(e.periodType, e.period)!;
      batch.set(ref, {
        period: e.period, periodType: e.periodType,
        year: parsed.year, month: parsed.month,
        ...(parsed.day !== undefined ? { day: parsed.day } : {}),
        branchId: e.branchId,
        saleId: e.saleId, saleName: e.saleName ?? '',
        groupId: e.groupId, groupName: e.groupName ?? '',
        packageId: e.packageId, packageName: e.packageName ?? '',
        quantity: e.quantity, unitPrice: e.unitPrice, revenue: e.revenue,
        sourceSystem: 'manual',
        updatedAt: now, updatedBy: caller.profile.uid,
        createdAt: now, createdBy: caller.profile.uid,
      }, { merge: true });
      written++;
    }
    if (written + deleted > 0) await batch.commit();

    await writeAuditLog({
      action: 'bulk_upsert_package_sales',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: auditBranchId,
      before: null,
      after: { count: entries.length, period, periodType, replaceMode },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    return NextResponse.json({ written, deleted });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[package-sales POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
