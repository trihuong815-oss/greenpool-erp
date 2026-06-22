'use client';

// PR-TK4A (2026-06-22) — Layout cho top role: ADMIN, CEO, CHU_TICH, GD_KD, GD_VP.
// Mục tiêu: xem tổng hệ thống + so sánh cơ sở + drill-down on demand.
//
// Section order (khác biệt chính so với layout cũ):
//   1. BusinessAlerts (existing)
//   2. MonthlyKpiCards (system-wide)
//   3. TargetProgressCard
//   4. BranchSummaryTable — ĐẶT CAO (tâm điểm khi xem all branches)
//   5. TopSalesTable
//   6. Grid 2 cols: SourceBreakdownCard + TopPackagesCard
//   7. PromoSummaryCard (khi có data)
//   8. SalesCustomerDrilldown — đặt CUỐI, không để tự chiếm trung tâm
//
// Reuse 100% components hiện có — KHÔNG đổi nội dung từng section.

import MonthlyKpiCards from '../MonthlyKpiCards';
import BusinessAlerts from '../BusinessAlerts';
import TargetProgressCard from '../TargetProgressCard';
import BranchSummaryTable from '../BranchSummaryTable';
import SaleRankingTable from '../SaleRankingTable';
import SourceBreakdownCard from '../SourceBreakdownCard';
import TopPackagesCard from '../TopPackagesCard';
import PromoEffectivenessCard from '../PromoEffectivenessCard';
import type { Summary } from '../types';

interface Props {
  data: Summary;
  month: string;
  /** Top role có thể đang xem all (no branchId filter) hoặc filter 1 branch.
   *  showBranchColumn = true khi scope.branchId === null (xem all). */
  scopeBranchId?: string | null;
}

export default function TopExecutiveView({ data, month, scopeBranchId }: Props) {
  const hasPromoData = (data.promoTotals?.transactions ?? 0) > 0;
  const showBranchTable = Object.keys(data.byBranch).length > 0;
  const hasSalesCustomers = data.salesCustomers && Object.keys(data.salesCustomers).length > 0;
  // PR-TK4B: Top role xem all → showBranchColumn=true. Filter 1 branch → ẩn cột.
  const showBranchColumn = scopeBranchId == null;

  return (
    <>
      <BusinessAlerts data={data} />

      <MonthlyKpiCards
        totals={data.totals}
        customerCount={data.customerCount}
        pendingReviewCount={(data.txStatusStats?.pending ?? 0) + (data.batchStats?.pendingReview ?? 0)}
      />

      <TargetProgressCard targetSummary={data.targetSummary} />

      {/* PR-TK4A: BranchSummaryTable ĐẶT CAO — là tâm điểm xem all branches */}
      {showBranchTable && <BranchSummaryTable byBranch={data.byBranch} />}

      {/* PR-TK4B: Replace TopSalesTable + SalesCustomerDrilldown bằng SaleRankingTable + Drawer */}
      {hasSalesCustomers && (
        <SaleRankingTable
          salesCustomers={data.salesCustomers!}
          saleTargetsThisMonth={data.saleTargetsThisMonth}
          daysElapsedPercent={data.targetSummary?.daysElapsedPercent ?? 0}
          showBranchColumn={showBranchColumn}
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
