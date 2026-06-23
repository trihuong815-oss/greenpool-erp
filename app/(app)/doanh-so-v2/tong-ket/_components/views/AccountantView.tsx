'use client';

// PR-TK4A (2026-06-22) — Layout cho TP_KE / NV_KE.
// Mục tiêu: ưu tiên tài chính + công nợ + batch chờ đối chiếu.
//
// Section order:
//   1. BusinessAlerts (ƯU TIÊN PROMINENT — kế toán cần thấy ngay)
//   2. MonthlyKpiCards (focus: thực thu/công nợ/chờ đối chiếu)
//   3. TargetProgressCard
//   4. BranchSummaryTable (TP_KE xem all — quan trọng; NV_KE chỉ thấy 1 cơ sở nên ẩn)
//   5. TopSalesTable
//   6. Grid: SourceBreakdown + TopPackages
//   7. PromoSummaryCard
//   8. SalesCustomerDrilldown (cuối)
//
// Note: TP_KE có scope='top', NV_KE có scope='accountant'.
// Cả 2 vào view này nhờ TongKetClient pickView() check roleCode TRƯỚC scope.
// BranchSummaryTable hiển thị theo byBranch — NV_KE chỉ có 1 entry → table 1 row OK.

import MonthlyKpiCards from '../MonthlyKpiCards';
import BusinessAlerts from '../BusinessAlerts';
import TargetProgressCard from '../TargetProgressCard';
import BranchSummaryTable from '../BranchSummaryTable';
import SaleRankingTable from '../SaleRankingTable';
import SourceBreakdownCard from '../SourceBreakdownCard';
import TopPackagesCard from '../TopPackagesCard';
import PromoEffectivenessCard from '../PromoEffectivenessCard';
import AdHocDiscountCard from '../AdHocDiscountCard';
import type { Summary } from '../types';

interface Props {
  data: Summary;
  month: string;
  /** roleCode để phân biệt TP_KE (system view) vs NV_KE (single branch). */
  roleCode: string;
  /** Top scope đang filter branch nào, null = xem all. */
  scopeBranchId?: string | null;
}

export default function AccountantView({ data, month, roleCode, scopeBranchId }: Props) {
  const hasPromoData = (data.promoTotals?.transactions ?? 0) > 0;
  const hasSalesCustomers = data.salesCustomers && Object.keys(data.salesCustomers).length > 0;
  // TP_KE xem all → có byBranch nhiều entries. NV_KE chỉ thấy 1 cơ sở → byBranch có 1 entry OR rỗng.
  const showBranchTable = roleCode === 'TP_KE' && Object.keys(data.byBranch).length > 0;
  // PR-TK4B: cột Cơ sở chỉ khi TP_KE xem all (scopeBranchId === null). NV_KE 1 cơ sở → ẩn.
  const showBranchColumn = roleCode === 'TP_KE' && scopeBranchId == null;

  return (
    <>
      {/* PR-TK4A: BusinessAlerts ƯU TIÊN PROMINENT cho kế toán */}
      <BusinessAlerts data={data} />

      {/* PR-TK4A: KPI tài chính — order giữ nguyên thành phần,
          accountant đặc biệt quan tâm Thực thu/Công nợ/Chờ đối chiếu */}
      <MonthlyKpiCards
        totals={data.totals}
        customerCount={data.customerCount}
        pendingReviewCount={(data.txStatusStats?.pending ?? 0) + (data.batchStats?.pendingReview ?? 0)}
      />

      <TargetProgressCard targetSummary={data.targetSummary} />

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

      {/* PR-PROMO2-B (2026-06-23): Ưu đãi ngoài CT cần kiểm tra (read-only) */}
      {data.adHocSummary && <AdHocDiscountCard data={data.adHocSummary} />}
    </>
  );
}
