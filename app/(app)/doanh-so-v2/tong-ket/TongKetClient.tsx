'use client';

// Tổng kết tháng — orchestrator.
// PR-TK1 (2026-06-21): refactor từ 752 LOC single-file → modular components ở _components/.
// PR-TK2 (2026-06-21): wire BusinessAlerts, MonthLockBadge, MonthlyKpiCards extend, CTA.
// PR-TK3A (2026-06-21): wire TargetProgressCard read-only.
// PR-TK3B (2026-06-21): wire tabs (Tổng kết / Chỉ tiêu) + TargetEditTab.
// PR-TK4A (2026-06-22): role-based view layout — pickView() chọn 1 trong 5 view
//   component (TopExecutive / Accountant / Qlcs / Sale / ReadOnlyAudit) thay vì
//   render đồng nhất cho mọi role. Section order khác nhau theo persona.

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { BarChart3, Target } from 'lucide-react';
import type { BranchId } from '@/lib/branches';
import type { ScopeRole } from '@/lib/sales-v2/scope';

import TongKetHeader from './_components/TongKetHeader';
import { LoadingState, ErrorState, EmptyState } from './_components/TongKetStates';
import BusinessAlerts from './_components/BusinessAlerts';
import TargetEditTab from './_components/TargetEditTab';
import TopExecutiveView from './_components/views/TopExecutiveView';
import AccountantView from './_components/views/AccountantView';
import QlcsView from './_components/views/QlcsView';
import SaleView from './_components/views/SaleView';
import ReadOnlyAuditView from './_components/views/ReadOnlyAuditView';
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

// ─── Role-based view selection (PR-TK4A) ───────────────────────────────────

/** Chọn view component theo roleCode + scope. Order check QUAN TRỌNG:
 *  TP_GS check TRƯỚC scope='top' vì TP_GS scope cũng = 'top' (theo getScopeRole)
 *  nhưng cần ReadOnlyAuditView không phải TopExecutiveView. */
function pickView(scope: ScopeRole, roleCode: string): ComponentType<any> {
  if (roleCode === 'TP_GS') return ReadOnlyAuditView;
  if (roleCode === 'TP_KE' || roleCode === 'NV_KE') return AccountantView;
  if (scope === 'sale') return SaleView;
  if (scope === 'qlcs') return QlcsView;
  // Fallback: scope='top' hoặc 'accountant' (đã handle TP_KE/NV_KE ở trên)
  return TopExecutiveView;
}

/** CTA "Sang đối chiếu" hiện khi user có quyền vào /doi-chieu.
 *  Sale + TP_GS KHÔNG có quyền → ẩn CTA tránh dead link. */
function shouldShowReconcileCta(scope: ScopeRole, roleCode: string): boolean {
  if (scope === 'sale') return false;
  if (roleCode === 'TP_GS') return false;
  return true;
}

// ─── Main orchestrator ─────────────────────────────────────────────────────

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
    if (tab === 'summary') void fetchSummary();
  }, [tab, fetchSummary]);

  // PR-TK4A: chọn view component theo role/scope
  const ViewComponent = pickView(scope, myRoleCode);
  // PR-TK4B: scopeBranchId cho SaleRankingTable showBranchColumn check.
  // showBranchFilter=true (top scope) + branchId='all' → scope all → showBranchColumn=true.
  // showBranchFilter=true + branchId chọn 1 → showBranchColumn=false (filter 1 branch).
  // showBranchFilter=false (QLCS/NV_KE/Sale) → branchId hardcoded → showBranchColumn=false.
  const scopeBranchId = (showBranchFilter && branchId !== 'all') ? branchId : (showBranchFilter ? null : myBranchId);

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4">
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
              showReconcileCta={shouldShowReconcileCta(scope, myRoleCode)}
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
              // PR-TK4A: render view component theo role/scope.
              // Mỗi view tự handle section order + filter section nào hiển thị.
              // PR-TK4B: pass scopeBranchId + uid để SaleRankingTable/SaleView nhận đúng prop.
              <ViewComponent
                data={data}
                month={month}
                roleCode={myRoleCode}
                scopeBranchId={scopeBranchId}
                uid={myUid}
              />
            )}
          </>
        ) : (
          // Tab "Chỉ tiêu" — TargetEditTab tự fetch riêng
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
