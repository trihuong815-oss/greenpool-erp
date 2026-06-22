'use client';

// PR-TK4A (2026-06-22) — Layout cho TP_GS (Trưởng phòng Giám sát).
// Định nghĩa: Read-only Control & Audit Role.
//
// Xem đủ:
//   - KPI toàn hệ thống
//   - Doanh số/thực thu/công nợ/số khách
//   - GD chờ duyệt / bị từ chối
//   - Batch chờ đối chiếu / đã duyệt / trả lại
//   - Trạng thái khóa tháng (qua MonthLockBadge ở Header)
//   - Doanh số theo cơ sở
//   - Doanh số theo Sale
//   - Khách hàng theo Sale (drill-down)
//   - Chỉ tiêu + % hoàn thành (TargetProgressCard)
//
// KHÔNG được thao tác (orchestrator + Header đã xử lý):
//   - KHÔNG render CTA "Sang đối chiếu" (TongKetClient ẩn — TP_GS không có quyền /doi-chieu)
//   - KHÔNG render Export Excel (canExportSalesExcel ở PR-6.3 đã chặn)
//   - KHÔNG mutation nào — view này chỉ render data.
//
// Section order (như Executive nhưng + Banner đầu trang):
//   0. ReadOnlyBanner (NEW)
//   1. BusinessAlerts (full)
//   2. MonthlyKpiCards
//   3. TargetProgressCard
//   4. BranchSummaryTable
//   5. TopSalesTable
//   6. Grid: SourceBreakdown + TopPackages
//   7. PromoSummaryCard
//   8. SalesCustomerDrilldown (read drilldown OK — không có nút mutation)

import MonthlyKpiCards from '../MonthlyKpiCards';
import BusinessAlerts from '../BusinessAlerts';
import TargetProgressCard from '../TargetProgressCard';
import BranchSummaryTable from '../BranchSummaryTable';
import SaleRankingTable from '../SaleRankingTable';
import SourceBreakdownCard from '../SourceBreakdownCard';
import TopPackagesCard from '../TopPackagesCard';
import PromoEffectivenessCard from '../PromoEffectivenessCard';
import ReadOnlyBanner from '../ReadOnlyBanner';
import type { Summary } from '../types';

interface Props {
  data: Summary;
  month: string;
  /** TP_GS có scope=top → có thể filter branch. null = xem all. */
  scopeBranchId?: string | null;
}

export default function ReadOnlyAuditView({ data, month, scopeBranchId }: Props) {
  const hasPromoData = (data.promoTotals?.transactions ?? 0) > 0;
  const showBranchTable = Object.keys(data.byBranch).length > 0;
  const hasSalesCustomers = data.salesCustomers && Object.keys(data.salesCustomers).length > 0;
  const showBranchColumn = scopeBranchId == null;

  return (
    <>
      <ReadOnlyBanner />

      <BusinessAlerts data={data} />

      <MonthlyKpiCards
        totals={data.totals}
        customerCount={data.customerCount}
        pendingReviewCount={(data.txStatusStats?.pending ?? 0) + (data.batchStats?.pendingReview ?? 0)}
      />

      <TargetProgressCard targetSummary={data.targetSummary} />

      {showBranchTable && <BranchSummaryTable byBranch={data.byBranch} />}

      {/* PR-TK4B: ranking + drawer read-only (drawer KHÔNG có nút mutation/export) */}
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
