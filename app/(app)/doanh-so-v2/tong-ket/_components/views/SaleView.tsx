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

import { Users } from 'lucide-react';
import MonthlyKpiCards from '../MonthlyKpiCards';
import BusinessAlerts from '../BusinessAlerts';
import TargetProgressCard from '../TargetProgressCard';
import SaleCustomerTable from '../SaleCustomerTable';
import type { Summary } from '../types';

interface Props {
  data: Summary;
  /** uid của Sale đang login — tìm row trong salesCustomers. */
  uid: string;
}

export default function SaleView({ data, uid }: Props) {
  // PR-TK4B: Sale render trực tiếp "Khách hàng của tôi" — KHÔNG dùng ranking/drawer.
  // Server đã enforce: salesCustomers chỉ chứa Sale của mình (1 entry hoặc rỗng).
  const myCustomers = data.salesCustomers?.[uid] ?? null;
  const transactions = myCustomers?.transactions ?? [];

  return (
    <>
      <BusinessAlerts data={data} />

      <MonthlyKpiCards
        totals={data.totals}
        customerCount={data.customerCount}
        pendingReviewCount={(data.txStatusStats?.pending ?? 0) + (data.batchStats?.pendingReview ?? 0)}
      />

      <TargetProgressCard targetSummary={data.targetSummary} />

      <div className="card">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Users size={16} className="text-emerald-600" />
          Khách hàng của tôi ({transactions.length} giao dịch)
        </h3>
        <SaleCustomerTable
          transactions={transactions}
          emptyMessage="Bạn chưa có giao dịch nào đã đối chiếu trong tháng này"
        />
      </div>
    </>
  );
}
