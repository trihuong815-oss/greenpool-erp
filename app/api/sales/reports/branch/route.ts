// GET /api/sales/reports/branch?year=2026&month=5
//
// Trả về aggregations theo branch:
//   {
//     period: { year, month? },
//     branches: [
//       {
//         branchId, totalAmount, totalLeads, totalClosed, closeRate,
//         sources: { MKT: {leads, closed}, Sale: {...}, ... },
//         byMonth: [{month, amount}] (12 phần tử nếu chỉ year)
//       }
//     ],
//     system: { totalAmount, totalLeads, totalClosed, closeRate }
//   }

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canReadSales, salesFilterForList } from '@/lib/firebase/sales-scope';

const SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;

type SourceStat = { leads: number; closed: number; revenue: number };
type BranchAgg = {
  branchId: string;
  totalAmount: number;
  totalLeads: number;
  totalClosed: number;
  closeRate: number;
  sources: Record<string, SourceStat>;
  byMonth: { month: number; amount: number; closed: number }[];
};

function emptySources(): Record<string, SourceStat> {
  const o: Record<string, SourceStat> = {};
  for (const s of SOURCES) o[s] = { leads: 0, closed: 0, revenue: 0 };
  return o;
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canReadSales(caller.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear();
    const monthQ = req.nextUrl.searchParams.get('month');
    const month = monthQ ? Number(monthQ) : null;
    const scopeFilter = salesFilterForList(caller.profile);
    if (scopeFilter.branchIds && scopeFilter.branchIds.length === 0) {
      return NextResponse.json({ period: { year, month }, branches: [], system: zeroSystem() });
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.SALES);
    if (scopeFilter.branchIds) {
      if (scopeFilter.branchIds.length === 1) q = q.where('branchId', '==', scopeFilter.branchIds[0]);
      else q = q.where('branchId', 'in', scopeFilter.branchIds.slice(0, 10));
    }
    const snap = await q.get();

    const byBranch: Record<string, BranchAgg> = {};

    for (const d of snap.docs) {
      const x = d.data();
      const closedAt: Date | null =
        x.createdAt?.toDate?.() ?? x.closedAt?.toDate?.() ?? (x.createdAt ? new Date(x.createdAt) : x.closedAt ? new Date(x.closedAt) : null) ?? null;
      if (!closedAt) continue;
      if (closedAt.getFullYear() !== year) continue;
      if (month !== null && closedAt.getMonth() + 1 !== month) continue;

      const branchId: string = x.branchId;
      if (!byBranch[branchId]) {
        byBranch[branchId] = {
          branchId, totalAmount: 0, totalLeads: 0, totalClosed: 0, closeRate: 0,
          sources: emptySources(),
          byMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: 0, closed: 0 })),
        };
      }
      const agg = byBranch[branchId];
      const source = (x.closeSource as string) ?? (x.source as string) ?? 'Walk-in';
      const status: string = x.status ?? 'pending';
      const amount: number = typeof x.amount === 'number' ? x.amount : 0;
      const isClosed = status === 'confirmed';

      agg.totalLeads += 1;
      agg.sources[source] ??= { leads: 0, closed: 0, revenue: 0 };
      agg.sources[source].leads += 1;
      if (isClosed) {
        agg.totalClosed += 1;
        agg.totalAmount += amount;
        agg.sources[source].closed += 1;
        agg.sources[source].revenue += amount;
        const m = closedAt.getMonth();
        agg.byMonth[m].closed += 1;
        agg.byMonth[m].amount += amount;
      }
    }

    for (const b of Object.values(byBranch)) {
      b.closeRate = b.totalLeads === 0 ? 0 : b.totalClosed / b.totalLeads;
    }

    const branches = Object.values(byBranch).sort((a, b) => b.totalAmount - a.totalAmount);
    const system = branches.reduce((acc, b) => {
      acc.totalAmount += b.totalAmount;
      acc.totalLeads += b.totalLeads;
      acc.totalClosed += b.totalClosed;
      return acc;
    }, zeroSystem());
    system.closeRate = system.totalLeads === 0 ? 0 : system.totalClosed / system.totalLeads;

    return NextResponse.json({ period: { year, month }, branches, system });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[sales report]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function zeroSystem() {
  return { totalAmount: 0, totalLeads: 0, totalClosed: 0, closeRate: 0 };
}
