'use client';

// PR-TK4A (2026-06-22) — Layout cho QLCS_HM/TK/CTT/24NCT/TT.
// Mục tiêu: xem cơ sở mình — Sale nào đạt/chưa, khách công nợ, batch.
//
// Section order:
//   1. BusinessAlerts cơ sở
//   2. MonthlyKpiCards cơ sở mình
//   3. TargetProgressCard cơ sở
//   4. TopSalesTable trong cơ sở (KHÔNG cột Cơ sở — SaleRankingTable defer PR-TK4B)
//   5. Grid: SourceBreakdown + TopPackages cơ sở
//   6. PromoSummaryCard (khi có data)
//   7. SalesCustomerDrilldown — auto ẩn branch filter (chỉ 1 cơ sở)
//
// KHÔNG render BranchSummaryTable (QLCS chỉ 1 cơ sở — vô nghĩa).
// SalesCustomerDrilldown đã có logic `branchOptions.length > 1` → tự ẩn filter cơ sở.

import MonthlyKpiCards from '../MonthlyKpiCards';
import BusinessAlerts from '../BusinessAlerts';
import TargetProgressCard from '../TargetProgressCard';
import SaleRankingTable from '../SaleRankingTable';
import SourceBreakdownCard from '../SourceBreakdownCard';
import TopPackagesCard from '../TopPackagesCard';
import PromoEffectivenessCard from '../PromoEffectivenessCard';
import type { Summary } from '../types';

interface Props {
  data: Summary;
  month: string;
}

export default function QlcsView({ data, month }: Props) {
  const hasPromoData = (data.promoTotals?.transactions ?? 0) > 0;
  const hasSalesCustomers = data.salesCustomers && Object.keys(data.salesCustomers).length > 0;

  return (
    <>
      <BusinessAlerts data={data} />

      <MonthlyKpiCards
        totals={data.totals}
        customerCount={data.customerCount}
        pendingReviewCount={(data.txStatusStats?.pending ?? 0) + (data.batchStats?.pendingReview ?? 0)}
      />

      <TargetProgressCard targetSummary={data.targetSummary} />

      {/* PR-TK4B: SaleRankingTable + Drawer thay TopSalesTable + SalesCustomerDrilldown.
          QLCS ẩn cột Cơ sở (chỉ 1 cơ sở). */}
      {hasSalesCustomers && (
        <SaleRankingTable
          salesCustomers={data.salesCustomers!}
          saleTargetsThisMonth={data.saleTargetsThisMonth}
          daysElapsedPercent={data.targetSummary?.daysElapsedPercent ?? 0}
          showBranchColumn={false}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SourceBreakdownCard bySource={data.bySource} />
        <TopPackagesCard byPackage={data.byPackage} />
      </div>

      {hasPromoData && data.promoTotals && (
        <PromoEffectivenessCard
          month={month}
          promoTotals={data.promoTotals}
          promoByCode={data.promoByCode}
          totalSystemSales={data.totals.sales}
        />
      )}
    </>
  );
}
