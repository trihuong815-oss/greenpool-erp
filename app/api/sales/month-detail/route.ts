// GET /api/sales/month-detail?branchId=HM&year=2026&month=5
// Trả về chi tiết package sales của 1 tháng — dùng cho MonthDetailModal (drill-down).
// De-dup periodType: nếu cùng (branch, month) có cả 'day' + 'month' → prefer 'day' (chi tiết hơn).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { salesFilterForList } from '@/lib/firebase/sales-scope';

const ALLOWED_FACILITY_IDS = new Set(['HM', 'TK', 'CTT', '24', 'TT']);

interface DetailLine {
  saleId: string;
  saleName: string;
  packageId: string;
  packageName: string;
  groupId: string;
  groupName: string;
  periodType: 'month' | 'day';
  period: string;
  day: number | null;
  quantity: number;
  unitPrice: number;
  revenue: number;
}

const SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;
type Source = typeof SOURCES[number];

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const qs = req.nextUrl.searchParams;
    const branchId = qs.get('branchId') ?? '';
    const yearStr = qs.get('year');
    const monthStr = qs.get('month');

    if (!branchId || !ALLOWED_FACILITY_IDS.has(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: 'year không hợp lệ' }, { status: 400 });
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'month phải 1-12' }, { status: 400 });
    }

    // Scope: user có quyền đọc branch này không?
    const scope = salesFilterForList(caller.profile);
    if (scope.branchIds && !scope.branchIds.includes(branchId)) {
      return NextResponse.json({ error: 'Bạn không có quyền xem cơ sở này' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    // Fetch song song: packageSales (revenue actual) + salesEntries (leads actual) + salesTargets (year/lead target) + activeSales registry
    const [snap, leadSnap, tgtSnap, salesRegistrySnap] = await Promise.all([
      db.collection(COLLECTIONS.PACKAGE_SALES)
        .where('branchId', '==', branchId)
        .where('year', '==', year)
        .where('month', '==', month)
        .get(),
      db.collection(COLLECTIONS.SALES_ENTRIES)
        .where('branchId', '==', branchId)
        .where('year', '==', year)
        .where('month', '==', month)
        .get(),
      db.collection(COLLECTIONS.SALES_TARGETS)
        .where('branchId', '==', branchId)
        .where('year', '==', year)
        .get(),
      // Registry: active sale roles (NV_SALE + NV_SALE_PT) của branch — dùng để filter bySalePackage/leadsBySale,
      // khớp với /doanh-so dashboard (mergeRegistry). Sale inactive → ẩn khỏi mọi view.
      db.collection(COLLECTIONS.USERS)
        .where('branchId', '==', branchId)
        .where('roleId', 'in', ['NV_SALE', 'NV_SALE_PT'])
        .where('status', '==', 'active')
        .get(),
    ]);
    // Set saleId hợp lệ + sentinel '__aggregate' (entries nhập theo tháng không gắn sale cụ thể).
    const activeSaleIds = new Set<string>(['__aggregate']);
    for (const d of salesRegistrySnap.docs) activeSaleIds.add(d.id);

    // De-dup periodType: nếu có doc 'day' thì bỏ qua doc 'month' cùng (branch, month)
    const hasDay = snap.docs.some((d) => d.data().periodType === 'day');

    const lines: DetailLine[] = [];
    for (const d of snap.docs) {
      const x = d.data();
      if (hasDay && x.periodType === 'month') continue;
      const saleId = x.saleId ?? '__aggregate';
      // Filter: chỉ giữ doc thuộc active sale (hoặc __aggregate) — khớp /doanh-so dashboard.
      if (!activeSaleIds.has(saleId)) continue;
      lines.push({
        saleId,
        saleName: x.saleName ?? 'Tổng cơ sở',
        packageId: x.packageId ?? 'unknown',
        packageName: x.packageName ?? '(không tên)',
        groupId: x.groupId ?? 'unknown',
        groupName: x.groupName ?? 'Khác',
        periodType: x.periodType ?? 'month',
        period: x.period ?? '',
        day: typeof x.day === 'number' ? x.day : null,
        quantity: Number(x.quantity ?? 0),
        unitPrice: Number(x.unitPrice ?? 0),
        revenue: Number(x.revenue ?? 0),
      });
    }

    // Sort: theo sale → group → package → day
    lines.sort((a, b) => {
      const sa = a.saleName.localeCompare(b.saleName, 'vi');
      if (sa !== 0) return sa;
      const ga = a.groupName.localeCompare(b.groupName, 'vi');
      if (ga !== 0) return ga;
      const pa = a.packageName.localeCompare(b.packageName, 'vi');
      if (pa !== 0) return pa;
      return (a.day ?? 0) - (b.day ?? 0);
    });

    // Aggregate by sale. byPackage cũ đã bỏ — UI không dùng sau khi simplify form (placeholder __total).
    // __total sentinel: qty=1 placeholder (không phải qty thật) → CHỈ cộng revenue, bỏ qty.
    const bySaleMap: Record<string, { saleId: string; saleName: string; qty: number; revenue: number }> = {};
    let totalQty = 0, totalRevenue = 0;
    for (const l of lines) {
      const isTotalSentinel = l.packageId === '__total';
      const qtyToAdd = isTotalSentinel ? 0 : l.quantity;
      totalQty += qtyToAdd;
      totalRevenue += l.revenue;
      const sk = `${l.saleId}`;
      bySaleMap[sk] ??= { saleId: l.saleId, saleName: l.saleName, qty: 0, revenue: 0 };
      bySaleMap[sk].qty += qtyToAdd;
      bySaleMap[sk].revenue += l.revenue;
    }
    const bySale = Object.values(bySaleMap).sort((a, b) => b.revenue - a.revenue);

    // bySalePackage: per-sale per-package — dùng cho bảng "Doanh số theo Sale" hiển thị
    // chi tiết từng gói mà sale đã bán (rowspan group by sale)
    const bySalePackageMap: Record<string, {
      saleId: string; saleName: string;
      totalQty: number; totalRevenue: number;
      packages: { packageId: string; packageName: string; groupName: string; qty: number; revenue: number }[];
    }> = {};
    for (const l of lines) {
      const sk = l.saleId;
      if (!bySalePackageMap[sk]) {
        bySalePackageMap[sk] = { saleId: l.saleId, saleName: l.saleName, totalQty: 0, totalRevenue: 0, packages: [] };
      }
      const sale = bySalePackageMap[sk];
      // __total sentinel: qty=1 placeholder → CHỈ cộng revenue, bỏ qty
      // (đồng bộ với bySaleMap line 128-130 và comment line 124)
      if (l.packageId === '__total') {
        sale.totalRevenue += l.revenue;
        continue;
      }
      sale.totalQty += l.quantity;
      sale.totalRevenue += l.revenue;
      const existing = sale.packages.find((p) => p.packageId === l.packageId);
      if (existing) {
        existing.qty += l.quantity;
        existing.revenue += l.revenue;
      } else {
        sale.packages.push({
          packageId: l.packageId, packageName: l.packageName, groupName: l.groupName,
          qty: l.quantity, revenue: l.revenue,
        });
      }
    }
    const bySalePackage = Object.values(bySalePackageMap)
      .map((s) => ({ ...s, packages: s.packages.sort((a, b) => b.revenue - a.revenue) }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    // ===== Leads aggregation (salesEntries) — de-dup periodType giống packageSales =====
    const hasDayLead = leadSnap.docs.some((d) => d.data().periodType === 'day');
    const leadsBySaleSourceMap: Record<string, {
      saleId: string; saleName: string;
      bySource: Record<Source, { leads: number; closed: number; notClosed: number }>;
      totalLeads: number; totalClosed: number; totalNotClosed: number;
    }> = {};
    const leadsBySourceMap: Record<Source, { leads: number; closed: number; notClosed: number }> = {
      MKT: { leads: 0, closed: 0, notClosed: 0 },
      Sale: { leads: 0, closed: 0, notClosed: 0 },
      Renew: { leads: 0, closed: 0, notClosed: 0 },
      Referral: { leads: 0, closed: 0, notClosed: 0 },
      'Walk-in': { leads: 0, closed: 0, notClosed: 0 },
    };
    let leadsTotal = 0, closedTotal = 0, notClosedTotal = 0;
    for (const d of leadSnap.docs) {
      const x = d.data();
      if (hasDayLead && x.periodType === 'month') continue;
      const sId = x.saleId ?? '__aggregate';
      // Filter: chỉ giữ entries của active sale (hoặc __aggregate) — khớp dashboard.
      if (!activeSaleIds.has(sId)) continue;
      const sName = x.saleName ?? 'Tổng cơ sở';
      const src = ((SOURCES as readonly string[]).includes(x.source) ? x.source : 'Walk-in') as Source;
      const lds = Number(x.leads ?? 0);
      const cls = Number(x.closed ?? 0);
      const nc  = Number(x.notClosed ?? 0);

      if (!leadsBySaleSourceMap[sId]) {
        leadsBySaleSourceMap[sId] = {
          saleId: sId, saleName: sName,
          bySource: {
            MKT: { leads: 0, closed: 0, notClosed: 0 },
            Sale: { leads: 0, closed: 0, notClosed: 0 },
            Renew: { leads: 0, closed: 0, notClosed: 0 },
            Referral: { leads: 0, closed: 0, notClosed: 0 },
            'Walk-in': { leads: 0, closed: 0, notClosed: 0 },
          },
          totalLeads: 0, totalClosed: 0, totalNotClosed: 0,
        };
      }
      const cell = leadsBySaleSourceMap[sId].bySource[src];
      cell.leads += lds; cell.closed += cls; cell.notClosed += nc;
      leadsBySaleSourceMap[sId].totalLeads += lds;
      leadsBySaleSourceMap[sId].totalClosed += cls;
      leadsBySaleSourceMap[sId].totalNotClosed += nc;

      leadsBySourceMap[src].leads += lds;
      leadsBySourceMap[src].closed += cls;
      leadsBySourceMap[src].notClosed += nc;
      leadsTotal += lds;
      closedTotal += cls;
      notClosedTotal += nc;
    }
    const leadsBySale = Object.values(leadsBySaleSourceMap).sort((a, b) => b.totalLeads - a.totalLeads);

    // ===== Targets (year/month) — để /nhap show "target tháng X" + "yearTarget" =====
    let monthRevenueTarget = 0;
    let yearRevenueTarget = 0;
    let monthLeadTarget = 0;
    let yearLeadTarget = 0;
    let hasTargets = false;
    if (!tgtSnap.empty) {
      const t = tgtSnap.docs[0].data();
      hasTargets = true;
      yearRevenueTarget = Number(t.yearTarget ?? 0);
      const mt = t.monthTargets;
      if (Array.isArray(mt) && mt.length === 12 && month >= 1 && month <= 12) {
        monthRevenueTarget = Number(mt[month - 1] ?? 0);
      }
      yearLeadTarget = Number(t.yearLeadTarget ?? 0);
      // leadTargets = { [source]: number[12] } — sum tất cả nguồn cho tháng này
      if (t.leadTargets && typeof t.leadTargets === 'object' && month >= 1 && month <= 12) {
        for (const arr of Object.values(t.leadTargets as Record<string, unknown>)) {
          if (Array.isArray(arr) && arr.length === 12) {
            monthLeadTarget += Number(arr[month - 1] ?? 0);
          }
        }
      }
    }

    return NextResponse.json({
      branchId, year, month,
      totalQty, totalRevenue,
      lineCount: lines.length,
      lines, bySale, bySalePackage,
      hasDayMode: hasDay,
      // Leads
      leadsBySale,
      leadsBySource: leadsBySourceMap,
      leadsTotal: { leads: leadsTotal, closed: closedTotal, notClosed: notClosedTotal },
      hasDayModeLeads: hasDayLead,
      // Targets
      hasTargets,
      monthRevenueTarget,
      yearRevenueTarget,
      monthLeadTarget,
      yearLeadTarget,
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[month-detail GET]', e?.code, e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? 'unknown'), code: e?.code }, { status: 500 });
  }
}
