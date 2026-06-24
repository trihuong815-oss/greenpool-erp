'use client';

// PR-CASH1G (2026-06-23): Orchestrator UI /bao-cao-thu-chi với 3 tab Theo ngày/tháng/năm.
// PR-CASH-FILTERS (2026-06-24): Bộ lọc nâng cao + URL query state (tab daily).
//
// Daily tab giữ logic PR-CASH1D + PR-CASH1F (lock). Monthly/Yearly là tab mới.
// Advanced filter (CashflowReportAdvancedFilter) cộng dồn lên quick filter
// (CashflowReportFilters): status + alerts trở thành "đa nguồn" — quick filter +
// URL/advanced state, sync 2 chiều.

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, CalendarRange, CalendarDays, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { BranchId } from '@/lib/branches';
import { BRANCH_BY_ID, isBranchId } from '@/lib/branches';
import { useToast } from '@/components/ui/Toast';
import { listCashflowReports, buildCashflowExportUrl } from '@/lib/services/finance/api-client';
import type { DailyCashflowReportDoc, DailyCashflowReportStatus } from '@/lib/finance/cashflow-report-types';
import {
  EMPTY_CASHFLOW_REPORT_FILTERS,
  filterCashflowReports,
  hasActiveCashflowReportFilters,
  type CashflowReportFilters as AdvFilters,
} from '@/lib/finance/filter-cashflow-reports';
import {
  readCashflowReportFiltersFromQuery,
  writeCashflowReportFiltersToParams,
} from '@/lib/finance/filter-url';

import { CashflowReportFilters, type StatusFilter } from './_components/CashflowReportFilters';
import { CashflowReportAdvancedFilter } from './_components/CashflowReportAdvancedFilter';
import { CashflowReportSummaryCards } from './_components/CashflowReportSummaryCards';
import { CashflowReportTable } from './_components/CashflowReportTable';
import { CashflowReportDetailDrawer } from './_components/CashflowReportDetailDrawer';
import { SubmitReportInline } from './_components/SubmitReportInline';
import { MonthlyTab } from './_components/MonthlyTab';
import { YearlyTab } from './_components/YearlyTab';

interface Props {
  myRoleCode: string;
  myBranchId: BranchId | null;
  canCheckReturn: boolean;
  canLock: boolean;
  canUnlock: boolean;
  canSubmit: boolean;
  canSelectBranch: boolean;
  showSummaryCards: boolean;
}

function todayVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type TabKey = 'daily' | 'monthly' | 'yearly';
const VALID_TABS: ReadonlySet<TabKey> = new Set(['daily', 'monthly', 'yearly']);

export default function BaoCaoThuChiClient({ myRoleCode, myBranchId, canCheckReturn, canLock, canUnlock, canSubmit, canSelectBranch, showSummaryCards }: Props) {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  type Doc = DailyCashflowReportDoc & { id: string };

  // Bootstrap state từ URL — sanitize.
  const initialTab: TabKey = useMemo(() => {
    const t = searchParams?.get('tab') ?? '';
    return (VALID_TABS as Set<string>).has(t) ? (t as TabKey) : 'daily';
  }, [searchParams]);

  const initialBranchUrl = searchParams?.get('branchId') ?? '';
  const initialBranch: BranchId | 'all' = useMemo(() => {
    if (!canSelectBranch) return myBranchId ?? 'all';
    if (initialBranchUrl === 'all') return 'all';
    if (isBranchId(initialBranchUrl)) return initialBranchUrl;
    return 'all';
  }, [canSelectBranch, myBranchId, initialBranchUrl]);

  const initialDate = useMemo(() => {
    const d = searchParams?.get('date') ?? '';
    return DATE_RE.test(d) ? d : todayVN();
  }, [searchParams]);

  const initialAdvFilters = useMemo<AdvFilters>(
    () => readCashflowReportFiltersFromQuery((k) => searchParams?.get(k) ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [date, setDate] = useState<string>(initialDate);
  const [branchId, setBranchId] = useState<BranchId | 'all'>(initialBranch);
  const [monthlyJumpTo, setMonthlyJumpTo] = useState<string | undefined>(undefined);
  const [advFilters, setAdvFilters] = useState<AdvFilters>(initialAdvFilters);

  // Quick filter (chips/toggle) — derived view of advFilters status + alerts.
  const statusFilter: StatusFilter = (advFilters.status || 'all') as StatusFilter;
  const alertsOnly: boolean = advFilters.alerts === 'yes';

  const setStatusFilter = (s: StatusFilter) => {
    setAdvFilters((p) => ({ ...p, status: s === 'all' ? '' : (s as DailyCashflowReportStatus) }));
  };
  const setAlertsOnly = (v: boolean) => {
    setAdvFilters((p) => ({ ...p, alerts: v ? 'yes' : '' }));
  };

  const [reports, setReports] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);

  // Sync URL query — replace, không tạo entry history mới.
  const syncedOnceRef = useRef(false);
  useEffect(() => {
    if (!syncedOnceRef.current) { syncedOnceRef.current = true; return; }
    const params = new URLSearchParams();
    if (tab !== 'daily') params.set('tab', tab);
    if (date && date !== todayVN()) params.set('date', date);
    if (canSelectBranch && branchId !== 'all') params.set('branchId', branchId);
    writeCashflowReportFiltersToParams(advFilters, params);
    const qs = params.toString();
    router.replace(`/bao-cao-thu-chi${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [tab, date, branchId, advFilters, router, canSelectBranch]);

  const load = useCallback(async () => {
    if (tab !== 'daily') return;
    setLoading(true); setError(null);
    try {
      const r = await listCashflowReports({ date, branchId: branchId === 'all' ? null : branchId });
      setReports(r.reports ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải báo cáo');
      setReports([]);
    } finally { setLoading(false); }
  }, [date, branchId, tab]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => filterCashflowReports(reports, advFilters), [reports, advFilters]);
  const active = hasActiveCashflowReportFilters(advFilters);

  const myBranchLabel = useMemo(() => {
    if (!myBranchId) return '(Không xác định)';
    const meta = BRANCH_BY_ID[myBranchId];
    return meta ? `${meta.id} — ${meta.name}` : myBranchId;
  }, [myBranchId]);

  const emptyText = active
    ? 'Không có báo cáo phù hợp với bộ lọc.'
    : (canCheckReturn || showSummaryCards
      ? 'Chưa có báo cáo thu-chi nào cho bộ lọc này.'
      : canSubmit
      ? 'Cơ sở chưa nộp báo cáo thu-chi cho ngày này. Bạn có thể nộp bằng nút bên trên.'
      : 'Cơ sở chưa nộp báo cáo thu-chi cho ngày này.');

  const submitBranch: BranchId | null = canSubmit ? (branchId === 'all' ? null : branchId) : null;
  const currentReport = submitBranch ? reports.find((r) => r.date === date && r.branchId === submitBranch) : undefined;

  function handleExportDaily() {
    if (branchId === 'all') {
      toast.error('Vui lòng chọn 1 cơ sở để xuất Excel ngày');
      return;
    }
    const url = buildCashflowExportUrl({ mode: 'daily', date, branchId });
    window.location.href = url;
  }

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-50 space-y-4 overflow-y-auto">
      {/* TAB SWITCHER */}
      <div className="flex items-center gap-1 flex-wrap bg-white rounded-xl p-1.5 ring-1 ring-slate-200 shadow-sm w-fit">
        <TabBtn active={tab === 'daily'} onClick={() => setTab('daily')} icon={<Calendar size={14} />} label="Theo ngày" />
        <TabBtn active={tab === 'monthly'} onClick={() => setTab('monthly')} icon={<CalendarRange size={14} />} label="Theo tháng" />
        <TabBtn active={tab === 'yearly'} onClick={() => setTab('yearly')} icon={<CalendarDays size={14} />} label="Theo năm" />
        <div className="ml-3 mr-2 text-xs text-slate-500 flex items-center gap-1.5">
          Vai trò: <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{myRoleCode}</span>
        </div>
      </div>

      {tab === 'daily' && (
        <>
          <CashflowReportFilters
            date={date}
            branchId={branchId}
            statusFilter={statusFilter}
            alertsOnly={alertsOnly}
            canSelectBranch={canSelectBranch}
            myBranchLabel={myBranchLabel}
            onDate={setDate}
            onBranch={setBranchId}
            onStatus={setStatusFilter}
            onAlertsOnly={setAlertsOnly}
          />

          <CashflowReportAdvancedFilter
            value={advFilters}
            onApply={setAdvFilters}
            onClear={() => setAdvFilters(EMPTY_CASHFLOW_REPORT_FILTERS)}
          />

          {/* Export Excel daily — luôn theo kỳ (ngày), KHÔNG theo filter nâng cao */}
          {branchId !== 'all' && (
            <div className="flex justify-end items-center gap-2">
              {active && (
                <span className="text-xs text-slate-500 italic">Xuất theo ngày, KHÔNG áp bộ lọc nâng cao.</span>
              )}
              <Button variant="secondary" size="sm" onClick={handleExportDaily} leftIcon={<FileSpreadsheet size={14} />}>
                Xuất Excel ngày
              </Button>
            </div>
          )}

          {submitBranch && (
            <SubmitReportInline
              date={date}
              branchId={submitBranch}
              currentReport={currentReport}
              onSubmitted={(resp) => { toast.success(`Đã nộp báo cáo (v${resp.reportVersion}). ${resp.summary.sentToCount} người nhận.`); load(); }}
              onError={(msg) => toast.error(msg)}
            />
          )}

          {/* Empty state khi filter ẩn hết */}
          {active && filtered.length === 0 && reports.length > 0 && !loading && (
            <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 flex items-start gap-3 text-sm">
              <div className="text-amber-900 flex-1">
                <div className="font-semibold mb-1">Không có báo cáo phù hợp với bộ lọc.</div>
                <div className="text-xs text-amber-800">
                  Có {reports.length} báo cáo trong kỳ — bộ lọc đang ẩn tất cả. Hãy nới lỏng hoặc xóa bộ lọc để xem.
                </div>
              </div>
              <button type="button" onClick={() => setAdvFilters(EMPTY_CASHFLOW_REPORT_FILTERS)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ring-1 ring-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors shrink-0">
                <RotateCcw size={11} /> Xóa lọc
              </button>
            </div>
          )}

          {showSummaryCards && <CashflowReportSummaryCards reports={filtered} />}

          <CashflowReportTable
            reports={filtered}
            loading={loading}
            error={error}
            emptyText={emptyText}
            onOpen={(r) => setOpenId(r.id)}
            onRefresh={load}
          />
        </>
      )}

      {tab === 'monthly' && (
        <MonthlyTab
          key={monthlyJumpTo ?? 'default'}
          myBranchId={myBranchId}
          canSelectBranch={canSelectBranch}
          myBranchLabel={myBranchLabel}
          initialMonth={monthlyJumpTo}
          onOpenReport={(id) => setOpenId(id)}
          onError={(msg) => toast.error(msg)}
        />
      )}

      {tab === 'yearly' && (
        <YearlyTab
          myBranchId={myBranchId}
          canSelectBranch={canSelectBranch}
          myBranchLabel={myBranchLabel}
          onSelectMonth={(m) => { setMonthlyJumpTo(m); setTab('monthly'); }}
          onError={(msg) => toast.error(msg)}
        />
      )}

      {openId && (
        <CashflowReportDetailDrawer
          reportId={openId}
          canCheckReturn={canCheckReturn}
          canLock={canLock}
          canUnlock={canUnlock}
          onClose={() => setOpenId(null)}
          onChanged={() => { toast.success('Cập nhật thành công'); load(); }}
          onError={(msg) => toast.error(msg)}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={[
      'inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-md transition-all duration-150 active:scale-[0.97]',
      active
        ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-700/50'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    ].join(' ')}>
      {icon}{label}
    </button>
  );
}
