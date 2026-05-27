// Discrepancies API — phát hiện và theo dõi chênh lệch giữa 2 chiều doanh số:
//   1. per-Sale (packageSales)           — input từ Form Modal B/Section 2 (SimpleRevenueSection)
//   2. per-Gói  (packageQuantities.revenue) — input từ Form Modal B/Section 3 (PackageCombinedSection)
//
// POST /api/discrepancies/check  body: { branchId, year, month }
//   Server tự compute 2 tổng từ Firestore. Nếu MISMATCH → upsert doc (preserve createdAt nếu đã có).
//   Nếu MATCH → delete doc (resolved). Trả về { match, perSaleRev, perPkgRev, diff }.
//
// GET  /api/discrepancies?olderThanHours=24
//   List discrepancies chưa resolve, createdAt < now - X giờ. Cho admin banner.
//
// DocId: `${year}_${month}_${branchId}`

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  canReadPackageSales, canWritePackageSale, packageSalesFilterForList,
} from '@/lib/firebase/package-sales-scope';
import { Timestamp } from 'firebase-admin/firestore';

const COL = COLLECTIONS.DISCREPANCIES;

function docId(year: number, month: number, branchId: string): string {
  return `${year}_${String(month).padStart(2, '0')}_${branchId}`;
}

function isoOrNull(v: unknown): string | null {
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

// Compute 2 tổng per-Sale + per-Gói cho (branch, year, month).
async function computeTotals(branchId: string, year: number, month: number) {
  const db = getFirebaseAdminDb();
  // packageSales: dedup periodType (prefer day over month) trong cùng (branch, month).
  const psSnap = await db.collection(COLLECTIONS.PACKAGE_SALES)
    .where('branchId', '==', branchId).where('year', '==', year).where('month', '==', month).get();
  const hasDay = psSnap.docs.some((d) => d.data().periodType === 'day');
  let perSaleRev = 0;
  for (const d of psSnap.docs) {
    const x = d.data();
    if (hasDay && x.periodType === 'month') continue;
    perSaleRev += Number(x.revenue ?? 0);
  }
  // packageQuantities: month-only, field revenue.
  const pqSnap = await db.collection(COLLECTIONS.PACKAGE_QUANTITIES)
    .where('branchId', '==', branchId).where('year', '==', year).where('month', '==', month).get();
  let perPkgRev = 0;
  for (const d of pqSnap.docs) {
    perPkgRev += Number(d.data().revenue ?? 0);
  }
  return { perSaleRev, perPkgRev };
}

// ─────────── POST /api/discrepancies/check ───────────
export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const branchId: string = body?.branchId;
    const year = Number(body?.year);
    const month = Number(body?.month);
    if (!branchId || !Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Thiếu/sai branchId/year/month' }, { status: 400 });
    }
    if (!canWritePackageSale(caller.profile, branchId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { perSaleRev, perPkgRev } = await computeTotals(branchId, year, month);
    const diff = perSaleRev - perPkgRev;
    const both = perSaleRev > 0 && perPkgRev > 0;
    const match = !both || diff === 0;

    const db = getFirebaseAdminDb();
    const id = docId(year, month, branchId);
    const ref = db.collection(COL).doc(id);
    const existing = await ref.get();
    const now = new Date();

    if (match) {
      // Match → xoá doc (resolved). Hoặc không tồn tại → không làm gì.
      if (existing.exists) await ref.delete();
      return NextResponse.json({ match: true, perSaleRev, perPkgRev, diff: 0 });
    }

    // Mismatch (cả 2 đều > 0, diff ≠ 0): upsert doc. Giữ createdAt nếu đã tồn tại → tính được "stale > 24h".
    const createdAt = existing.exists ? existing.data()?.createdAt ?? now : now;
    await ref.set({
      branchId, year, month,
      perSaleRev, perPkgRev,
      diff: Math.abs(diff),
      diffSigned: diff,
      createdAt,
      lastSeenAt: now,
      lastSeenBy: caller.profile.uid,
      resolved: false,
    }, { merge: true });
    return NextResponse.json({ match: false, perSaleRev, perPkgRev, diff });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[discrepancies POST]', e);
    return NextResponse.json({ error: 'Internal error: ' + (e?.message ?? 'unknown') }, { status: 500 });
  }
}

// ─────────── GET /api/discrepancies?olderThanHours=24 ───────────
export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canReadPackageSales(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const olderThanHours = Number(qs.get('olderThanHours') ?? '0');
    const scope = packageSalesFilterForList(caller.profile);

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL).where('resolved', '==', false);
    if (scope.branchIds) {
      if (scope.branchIds.length === 0) return NextResponse.json({ rows: [] });
      if (scope.branchIds.length === 1) q = q.where('branchId', '==', scope.branchIds[0]);
      else q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));
    }
    if (olderThanHours > 0) {
      const cutoff = Timestamp.fromMillis(Date.now() - olderThanHours * 3600_000);
      q = q.where('createdAt', '<', cutoff);
    }
    const snap = await q.get();
    const rows = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        branchId: x.branchId,
        year: x.year,
        month: x.month,
        perSaleRev: x.perSaleRev,
        perPkgRev: x.perPkgRev,
        diff: x.diff,
        createdAt: isoOrNull(x.createdAt),
        lastSeenAt: isoOrNull(x.lastSeenAt),
      };
    });
    return NextResponse.json({ rows });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[discrepancies GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
