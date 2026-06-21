'use client';

// Tổng kết tháng — orchestrator.
// PR-TK1 (2026-06-21): refactor từ 752 LOC single-file → modular components ở _components/.
// PR-TK2 (2026-06-21): wire BusinessAlerts, MonthLockBadge, MonthlyKpiCards extend, CTA.
// PR-TK3A (2026-06-21): wire TargetProgressCard read-only.
// PR-TK3B (2026-06-21): wire tabs (Tổng kết / Chỉ tiêu) + TargetEditTab.

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Target } from 'lucide-react';
import type { BranchId } from '@/lib/branches';
import type { ScopeRole } from '@/lib/sales-v2/scope';

import TongKetHeader from './_components/TongKetHeader';
import { LoadingState, ErrorState, EmptyState } from './_components/TongKetStates';
import MonthlyKpiCards from './_components/MonthlyKpiCards';
import BusinessAlerts from './_components/BusinessAlerts';
import TargetProgressCard from './_components/TargetProgressCard';
import SourceBreakdownCard from './_components/SourceBreakdownCard';
import TopPackagesCard from './_components/TopPackagesCard';
import PromoSummaryCard from './_components/PromoSummaryCard';
import TopSalesTable from './_components/TopSalesTable';
import BranchSummaryTable from './_components/BranchSummaryTable';
import SalesCustomerDrilldown from './_components/SalesCustomerDrilldown';
import TargetEditTab from './_components/TargetEditTab';
import { currentMonthVN } from './_components/utils';
import type { Summary } from './_components/types';

interface Props {
  scope: ScopeRole;
  // PR-TK3B: cần thêm để permission UI tab "Chỉ tiêu" + branch defaulting
  myRoleCode: string;
  myUid: string;
  myBranchId: BranchId | null;
}

type MainTab = 'summary' | 'target';

export default function TongKetClient({ scope, myRoleCode, myUid, myBranchId }: Props) {
  const [tab, setTab] = useState<MainTab>('summary');
  const [month, setMonth] = useState<string>(currentMonthVN());
  const [branchId, setBranchId] = useState<BranchId | 'all'>('all');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showBranchFilter = scope === 'top';

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

  useEffect(() => {
    // Chỉ fetch summary khi đang ở tab Tổng kết — tránh fetch thừa khi user qua tab Chỉ tiêu
    if (tab === 'summary') void fetchSummary();
  }, [tab, fetchSummary]);

  const hasPromoData = (data?.promoTotals?.transactions ?? 0) > 0;
  const showSaleTable = (scope === 'top' || scope === 'accountant' || scope === 'qlcs')
    && data != null
    && Object.keys(data.bySale).length > 0;
  const showBranchTable = scope === 'top'
    && data != null
    && Object.keys(data.byBranch).length > 0;

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* PR-TK3B: tab switcher Tổng kết / Chỉ tiêu */}
        <TabSwitcher tab={tab} setTab={setTab} />

        {tab === 'summary' ? (
          <>
            <TongKetHeader
              scope={scope}
              month={month}
              branchId={branchId}
              showBranchFilter={showBranchFilter}
              onMonthChange={setMonth}
              onBranchChange={setBranchId}
              monthLock={data?.monthLock}
              showReconcileCta={scope !== 'sale'}
            />

            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState message={error} />
            ) : !data ? null : data.totals.transactions === 0 ? (
              <>
                <BusinessAlerts data={data} />
                <EmptyState month={month} />
              </>
            ) : (
              <>
                <BusinessAlerts data={data} />

                <MonthlyKpiCards
                  totals={data.totals}
                  customerCount={data.customerCount}
                  pendingReviewCount={(data.txStatusStats?.pending ?? 0) + (data.batchStats?.pendingReview ?? 0)}
                />

                {/* PR-TK3A: hiển thị target progress card. Sale → null target = "Chưa đặt".
                    Top all branches: target = tổng monthTargets các cơ sở có target. */}
                <TargetProgressCard targetSummary={data.targetSummary} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SourceBreakdownCard bySource={data.bySource} />
                  <TopPackagesCard byPackage={data.byPackage} />
                </div>

                {/* V8.X: Khách hàng theo Sale (replace PT card) */}
                {data.salesCustomers && Object.keys(data.salesCustomers).length > 0 && (
                  <SalesCustomerDrilldown salesCustomers={data.salesCustomers} />
                )}

                {/* V7 Promo */}
                {hasPromoData && data.promoTotals && (
                  <PromoSummaryCard
                    month={month}
                    promoTotals={data.promoTotals}
                    promoByCode={data.promoByCode}
                  />
                )}

                {showSaleTable && (
                  <TopSalesTable
                    bySale={data.bySale}
                    saleTargetsThisMonth={data.saleTargetsThisMonth}
                  />
                )}

                {showBranchTable && <BranchSummaryTable byBranch={data.byBranch} />}
              </>
            )}
          </>
        ) : (
          // Tab "Chỉ tiêu" — TargetEditTab tự fetch riêng (không phụ thuộc monthly-summary)
          <TargetEditTab
            scope={scope}
            roleCode={myRoleCode}
            uid={myUid}
            myBranchId={myBranchId}
            currentMonth={month}
          />
        )}
      </div>
    </div>
  );
}

// ─── Tab switcher ──────────────────────────────────────────────────────────

function TabSwitcher({ tab, setTab }: { tab: MainTab; setTab: (t: MainTab) => void }) {
  const tabs: Array<{ id: MainTab; label: string; icon: React.ReactNode }> = [
    { id: 'summary', label: 'Tổng kết tháng', icon: <BarChart3 size={16} /> },
    { id: 'target',  label: 'Chỉ tiêu',       icon: <Target size={16} /> },
  ];
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium border-b-2 transition ${
              active
                ? 'bg-white text-emerald-700 border-emerald-600'
                : 'bg-transparent text-slate-600 border-transparent hover:text-slate-800 hover:bg-white/50'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
