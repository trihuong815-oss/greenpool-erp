// GET /api/sales/reports/sale-detail?branchId=HM&year=2026&month=5
//
// Trả về breakdown theo staff sale của 1 branch:
//   { rows: [{ saleStaffId, saleName, totalAmount, totalLeads, totalClosed, sources: {...} }] }

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canReadSales, salesFilterForList } from '@/lib/firebase/sales-scope';

const SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;
type SourceStat = { leads: number; closed: number; revenue: number };

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canReadSales(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const branchId = qs.get('branchId');
    if (!branchId) return NextResponse.json({ error: 'Thiếu branchId' }, { status: 400 });
    const year = Number(qs.get('year')) || new Date().getFullYear();
    const monthQ = qs.get('month');
    const month = monthQ ? Number(monthQ) : null;

    const scopeFilter = salesFilterForList(caller.profile);
    if (scopeFilter.branchIds && !scopeFilter.branchIds.includes(branchId)) {
      return NextResponse.json({ error: 'Out of scope' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.SALES).where('branchId', '==', branchId).get();

    const byStaff: Record<string, {
      saleStaffId: string;
      saleName: string;
      totalAmount: number;
      totalLeads: number;
      totalClosed: number;
      sources: Record<string, SourceStat>;
    }> = {};

    for (const d of snap.docs) {
      const x = d.data();
      const closedAt: Date | null =
        x.createdAt?.toDate?.() ?? x.closedAt?.toDate?.() ?? (x.createdAt ? new Date(x.createdAt) : x.closedAt ? new Date(x.closedAt) : null) ?? null;
      if (!closedAt) continue;
      if (closedAt.getFullYear() !== year) continue;
      if (month !== null && closedAt.getMonth() + 1 !== month) continue;

      const sid: string = x.saleBy ?? x.saleStaffId ?? '__unassigned';
      if (!byStaff[sid]) {
        const emptySrc: Record<string, SourceStat> = {};
        for (const s of SOURCES) emptySrc[s] = { leads: 0, closed: 0, revenue: 0 };
        byStaff[sid] = {
          saleStaffId: sid,
          saleName: sid === '__unassigned' ? '(Chưa gán)' : sid,
          totalAmount: 0,
          totalLeads: 0,
          totalClosed: 0,
          sources: emptySrc,
        };
      }
      const agg = byStaff[sid];
      const source = (x.closeSource as string) ?? (x.source as string) ?? 'Walk-in';
      agg.sources[source] ??= { leads: 0, closed: 0, revenue: 0 };
      agg.totalLeads += 1;
      agg.sources[source].leads += 1;
      if (x.status === 'confirmed') {
        agg.totalClosed += 1;
        agg.totalAmount += typeof x.amount === 'number' ? x.amount : 0;
        agg.sources[source].closed += 1;
        agg.sources[source].revenue += typeof x.amount === 'number' ? x.amount : 0;
      }
    }

    const rows = Object.values(byStaff).sort((a, b) => b.totalAmount - a.totalAmount);
    return NextResponse.json({ branchId, period: { year, month }, rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[sales report sale-detail]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
