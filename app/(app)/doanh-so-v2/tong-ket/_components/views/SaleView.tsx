'use client';

// PR-TK4A (2026-06-22) — Layout cho NV_SALE / NV_SALE_PT.
// Mục tiêu: chỉ cá nhân — gọn, không bị rối bởi dữ liệu quản lý.
//
// Section order:
//   1. BusinessAlerts (cá nhân — chỉ alert liên quan: tx pending/batch returned của mình)
//   2. MonthlyKpiCards cá nhân
//   3. TargetProgressCard cá nhân (scope='sale')
//   4. SalesCustomerDrilldown — direct render "Khách hàng của tôi" (đã có logic 1 Sale → no switcher)
//
// KHÔNG render:
//   - BranchSummaryTable (Sale không xem cơ sở)
//   - TopSalesTable (Sale không xem ranking người khác)
//   - PromoSummaryCard (defer — Sale không cần xem KM tổng cơ sở)
//   - SourceBreakdown/TopPackages cơ sở (Sale không cần)
//
// Server đã enforce server-side: bySale = {}, byBranch = {}, salesCustomers chỉ
// chứa Sale của mình. Component tin tưởng data từ API.

import MonthlyKpiCards from '../MonthlyKpiCards';
import BusinessAlerts from '../BusinessAlerts';
import TargetProgressCard from '../TargetProgressCard';
import SalesCustomerDrilldown from '../SalesCustomerDrilldown';
import type { Summary } from '../types';

interface Props {
  data: Summary;
}

export default function SaleView({ data }: Props) {
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

      {/* "Khách hàng của tôi" — SalesCustomerDrilldown auto handle 1 Sale = no switcher */}
      {hasCustomerDrilldown && (
        <SalesCustomerDrilldown salesCustomers={data.salesCustomers!} />
      )}
    </>
  );
}
