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
import TopSalesTable from '../TopSalesTable';
import SourceBreakdownCard from '../SourceBreakdownCard';
import TopPackagesCard from '../TopPackagesCard';
import PromoSummaryCard from '../PromoSummaryCard';
import SalesCustomerDrilldown from '../SalesCustomerDrilldown';
import type { Summary } from '../types';

interface Props {
  data: Summary;
  month: string;
}

export default function TopExecutiveView({ data, month }: Props) {
  const hasPromoData = (data.promoTotals?.transactions ?? 0) > 0;
  const showBranchTable = Object.keys(data.byBranch).length > 0;
  const showSaleTable = Object.keys(data.bySale).length > 0;
  const hasCustomerDrilldown = data.salesCustomers && Object.keys(data.salesCustomers).length > 0;

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

      {showSaleTable && (
        <TopSalesTable
          bySale={data.bySale}
          saleTargetsThisMonth={data.saleTargetsThisMonth}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SourceBreakdownCard bySource={data.bySource} />
        <TopPackagesCard byPackage={data.byPackage} />
      </div>

      {hasPromoData && data.promoTotals && (
        <PromoSummaryCard
          month={month}
          promoTotals={data.promoTotals}
          promoByCode={data.promoByCode}
        />
      )}

      {/* PR-TK4A: SalesCustomerDrilldown đặt CUỐI để không tự chiếm trung tâm.
          Vẫn dùng pattern hiện tại — drawer pattern defer PR-TK4B. */}
      {hasCustomerDrilldown && (
        <SalesCustomerDrilldown salesCustomers={data.salesCustomers!} />
      )}
    </>
  );
}
