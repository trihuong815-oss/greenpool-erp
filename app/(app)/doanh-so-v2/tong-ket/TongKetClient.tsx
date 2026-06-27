'use client';

// Tổng kết tháng — orchestrator.
// PR-TK1 (2026-06-21): refactor từ 752 LOC single-file → modular components ở _components/.
// PR-TK2 (2026-06-21): wire BusinessAlerts, MonthLockBadge, MonthlyKpiCards extend, CTA.
// PR-TK3A (2026-06-21): wire TargetProgressCard read-only.
// PR-TK3B (2026-06-21): wire tabs (Tổng kết / Chỉ tiêu) + TargetEditTab.
// PR-TK4A (2026-06-22): role-based view layout (TopExecutive / Accountant / Qlcs / Sale / ReadOnlyAudit).
// PR-SALES-SUMMARY-SIMPLE-THREE-TABS-UI (2026-06-26): refactor về ĐÚNG 3 TAB user-facing
//   theo mockup (Tổng quan / Theo cơ sở-Sale / Rủi ro giá). Tab "Chỉ tiêu" thứ 4 chỉ
//   visible cho role có quyền edit (ADMIN/CEO/CHU_TICH/GD_KD) — giữ chức năng,
//   không xoá. Mỗi tab render fixed sections — KHÔNG đổi data/API/calculation/permission.
//   Bỏ pickView() 5-view per-role: data scope đã filter server-side đủ an toàn cho
//   mọi role; section view nhất quán giúp người dùng dễ scan.
//   View files (TopExecutiveView/AccountantView/QlcsView/SaleView/ReadOnlyAuditView)
//   giữ trong repo (chưa xoá) để rollback dễ nếu cần.

import { useCallback, useEffect, useState } from 'react';
import type { BranchId } from '@/lib/branches';
import type { ScopeRole } from '@/lib/sales-v2/scope';

import TongKetHeader from './_components/TongKetHeader';
import { LoadingState, ErrorState, EmptyState } from './_components/TongKetStates';
import BusinessAlerts from './_components/BusinessAlerts';
import MonthlyKpiCards from './_components/MonthlyKpiCards';
import TargetProgressCard from './_components/TargetProgressCard';
import BranchSummaryTable from './_components/BranchSummaryTable';
import SaleRankingTable from './_components/SaleRankingTable';
import BranchProgressList from './_components/BranchProgressList';
import CustomerListTab from './_components/CustomerListTab';
import AdHocDiscountCard from './_components/AdHocDiscountCard';
import TargetEditTab from './_components/TargetEditTab';
import { currentMonthVN } from './_components/utils';
import type { Summary } from './_components/types';

interface Props {
  scope: ScopeRole;
  myRoleCode: string;
  myUid: string;
  myBranchId: BranchId | null;
}

// PR-SALES-SUMMARY-SIMPLE-THREE-TABS-UI: 3 tab user-facing + 1 tab admin (Chỉ tiêu).
// PR-TONGKET-OVERVIEW-V2 (2026-06-27): BỎ tab 'by-branch' — ghép BranchSummary +
// SaleRanking + BranchProgressList (per-branch target vs actual) vào tab 'overview'.
// PR-TONGKET-CUSTOMER-LIST (2026-06-27): thêm tab 'customers' — danh sách khách
// hàng theo từng giao dịch trong tháng. Phân quyền theo salesCustomers scope
// (server enforce: Sale=own, QLCS=branch, Top=all).
type MainTab = 'overview' | 'customers' | 'risk' | 'target';

const TARGET_WRITE_ROLES = new Set(['ADMIN', 'CEO', 'CHU_TICH', 'GD_KD']);

function shouldShowReconcileCta(scope: ScopeRole, roleCode: string): boolean {
  if (scope === 'sale') return false;
  if (roleCode === 'TP_GS') return false;
  return true;
}

export default function TongKetClient({ scope, myRoleCode, myUid, myBranchId }: Props) {
  const [tab, setTab] = useState<MainTab>('overview');
  const [month, setMonth] = useState<string>(currentMonthVN());
  const [branchId, setBranchId] = useState<BranchId | 'all'>('all');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showBranchFilter = scope === 'top';
  const canWriteTarget = TARGET_WRITE_ROLES.has(myRoleCode);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ month });
      if (showBranchFilter && branchId !== 'all') qs.set('branchId', branchId);
      const r = await fetch(`/api/sales-v2/monthly-summary?${qs.toString()}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setData(j as Summary);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải');
    } finally {
      setLoading(false);
    }
  }, [month, branchId, showBranchFilter]);

  // PR-TK4B: scopeBranchId cho SaleRankingTable showBranchColumn check.
  // null → show cột Cơ sở (top all branches). Có giá trị → ẩn (chỉ 1 cơ sở).
  const scopeBranchId = (showBranchFilter && branchId !== 'all') ? branchId : (showBranchFilter ? null : myBranchId);
  const showBranchColumn = scopeBranchId == null;

  // 3 tab data-driven đều cần Summary (không phải tab 'target'). Fetch khi không phải tab target.
  useEffect(() => {
    if (tab !== 'target') void fetchSummary();
  }, [tab, fetchSummary]);

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <TabSwitcher tab={tab} setTab={setTab} canWriteTarget={canWriteTarget} />

        {tab === 'target' ? (
          <TargetEditTab
            scope={scope}
            roleCode={myRoleCode}
            uid={myUid}
            myBranchId={myBranchId}
            currentMonth={month}
          />
        ) : (
          <>
            <TongKetHeader
              scope={scope}
              month={month}
              branchId={branchId}
              showBranchFilter={showBranchFilter}
              onMonthChange={setMonth}
              onBranchChange={setBranchId}
              monthLock={data?.monthLock}
              showReconcileCta={shouldShowReconcileCta(scope, myRoleCode)}
            />

            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState message={error} />
            ) : !data ? null : (
              <TabContent tab={tab} data={data} month={month} showBranchColumn={showBranchColumn} scope={scope} roleCode={myRoleCode} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tab content (3 tab fixed sections) ───────────────────────────────────

function TabContent({
  tab, data, month, showBranchColumn, scope, roleCode,
}: {
  tab: Exclude<MainTab, 'target'>;
  data: Summary;
  month: string;
  showBranchColumn: boolean;
  scope: ScopeRole;
  roleCode: string;
}) {
  const isEmpty = data.totals.transactions === 0;
  if (isEmpty) {
    return (
      <>
        <BusinessAlerts data={data} />
        <EmptyState month={month} scope={scope} roleCode={roleCode} />
      </>
    );
  }
  if (tab === 'overview') {
    // PR-TONGKET-OVERVIEW-V2 (2026-06-27): user feedback hội đồng — gộp
    // BranchProgressList (chỉ tiêu vs thực đạt từng cơ sở) + BranchSummaryTable
    // (top cơ sở) + SaleRankingTable (top sale) vào Tổng quan. Bỏ tab "Theo cơ sở/Sale".
    const hasBranch = Object.keys(data.byBranch).length > 0;
    const hasBranchTargets = data.branchTargetsThisMonth && Object.keys(data.branchTargetsThisMonth).length > 0;
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
        {(hasBranch || hasBranchTargets) && (
          <BranchProgressList
            byBranch={data.byBranch}
            branchTargets={data.branchTargetsThisMonth}
          />
        )}
        {hasBranch && <BranchSummaryTable byBranch={data.byBranch} />}
        {hasSalesCustomers && (
          <SaleRankingTable
            salesCustomers={data.salesCustomers!}
            saleTargetsThisMonth={data.saleTargetsThisMonth}
            daysElapsedPercent={data.targetSummary?.daysElapsedPercent ?? 0}
            showBranchColumn={showBranchColumn}
          />
        )}
      </>
    );
  }
  if (tab === 'customers') {
    // PR-TONGKET-CUSTOMER-LIST (2026-06-27): danh sách khách hàng từ salesCustomers.
    // Server đã enforce scope: Sale=own, QLCS=branch, Top=all.
    return (
      <CustomerListTab
        salesCustomers={data.salesCustomers}
        showBranchColumn={showBranchColumn}
      />
    );
  }
  // tab === 'risk'
  return data.adHocSummary ? (
    <AdHocDiscountCard data={data.adHocSummary} />
  ) : (
    <div className="card text-center py-12 text-sm text-slate-500">Chưa có giao dịch nào cần kiểm tra rủi ro giá.</div>
  );
}

// ─── Tab switcher (3 tab + 1 tab admin) ───────────────────────────────────

function TabSwitcher({
  tab, setTab, canWriteTarget,
}: {
  tab: MainTab;
  setTab: (t: MainTab) => void;
  canWriteTarget: boolean;
}) {
  // PR-TONGKET-CUSTOMER-LIST (2026-06-27): thêm tab "Khách hàng" giữa Tổng quan và Rủi ro.
  const tabs: Array<{ id: MainTab; label: string }> = [
    { id: 'overview',  label: 'Tổng quan' },
    { id: 'customers', label: 'Khách hàng' },
    { id: 'risk',      label: 'Rủi ro giá' },
  ];
  if (canWriteTarget) tabs.push({ id: 'target', label: 'Chỉ tiêu' });
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'text-emerald-700 border-emerald-600'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
