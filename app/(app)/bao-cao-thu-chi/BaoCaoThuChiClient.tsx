'use client';

// PR-CASH1G (2026-06-23): Orchestrator UI /bao-cao-thu-chi với 3 tab Theo ngày/tháng/năm.
// Daily tab giữ logic PR-CASH1D + PR-CASH1F (lock). Monthly/Yearly là tab mới.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, CalendarRange, CalendarDays, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { BranchId } from '@/lib/branches';
import { BRANCH_BY_ID } from '@/lib/branches';
import { useToast } from '@/components/ui/Toast';
import { listCashflowReports, buildCashflowExportUrl } from '@/lib/services/finance/api-client';
import type { DailyCashflowReportDoc } from '@/lib/finance/cashflow-report-types';

import { CashflowReportFilters, type StatusFilter } from './_components/CashflowReportFilters';
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
  canSubmit: boolean;
  canSelectBranch: boolean;
  showSummaryCards: boolean;
}

function todayVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

type TabKey = 'daily' | 'monthly' | 'yearly';

export default function BaoCaoThuChiClient({ myRoleCode, myBranchId, canCheckReturn, canLock, canSubmit, canSelectBranch, showSummaryCards }: Props) {
  const toast = useToast();
  type Doc = DailyCashflowReportDoc & { id: string };

  const [tab, setTab] = useState<TabKey>('daily');

  const initialBranch: BranchId | 'all' = canSelectBranch ? 'all' : (myBranchId ?? 'all');

  const [date, setDate] = useState<string>(todayVN());
  const [branchId, setBranchId] = useState<BranchId | 'all'>(initialBranch);
  // Monthly tab — controlled từ YearlyTab khi user click 1 tháng.
  const [monthlyJumpTo, setMonthlyJumpTo] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [alertsOnly, setAlertsOnly] = useState(false);

  const [reports, setReports] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (alertsOnly && (!Array.isArray(r.alerts) || r.alerts.length === 0)) return false;
      return true;
    });
  }, [reports, statusFilter, alertsOnly]);

  const myBranchLabel = useMemo(() => {
    if (!myBranchId) return '(Không xác định)';
    const meta = BRANCH_BY_ID[myBranchId];
    return meta ? `${meta.id} — ${meta.name}` : myBranchId;
  }, [myBranchId]);

  const emptyText = canCheckReturn || showSummaryCards
    ? 'Chưa có báo cáo thu-chi nào cho bộ lọc này.'
    : canSubmit
    ? 'Cơ sở chưa nộp báo cáo thu-chi cho ngày này. Bạn có thể nộp bằng nút bên trên.'
    : 'Cơ sở chưa nộp báo cáo thu-chi cho ngày này.';

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
    <div className="flex-1 p-3 md:p-6 bg-slate-50 space-y-4">
      {/* TAB SWITCHER */}
      <div className="flex items-center gap-2 flex-wrap bg-white rounded-lg p-1 ring-1 ring-slate-200 shadow-sm w-fit">
        <TabBtn active={tab === 'daily'} onClick={() => setTab('daily')} icon={<Calendar size={14} />} label="Theo ngày" />
        <TabBtn active={tab === 'monthly'} onClick={() => setTab('monthly')} icon={<CalendarRange size={14} />} label="Theo tháng" />
        <TabBtn active={tab === 'yearly'} onClick={() => setTab('yearly')} icon={<CalendarDays size={14} />} label="Theo năm" />
        <div className="ml-2 text-xs text-slate-500 pr-2">
          Vai trò: <span className="font-mono text-slate-700">{myRoleCode}</span>
        </div>
      </div>

      {/* DAILY TAB */}
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

          {/* Export Excel daily — chỉ khi đã chọn 1 cơ sở cụ thể */}
          {branchId !== 'all' && (
            <div className="flex justify-end">
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

      {/* MONTHLY TAB */}
      {tab === 'monthly' && (
        <MonthlyTab
          key={monthlyJumpTo ?? 'default'}    // remount để pick initial month từ YearlyTab
          myBranchId={myBranchId}
          canSelectBranch={canSelectBranch}
          myBranchLabel={myBranchLabel}
          initialMonth={monthlyJumpTo}
          onOpenReport={(id) => setOpenId(id)}
          onError={(msg) => toast.error(msg)}
        />
      )}

      {/* YEARLY TAB */}
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
      'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition',
      active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'text-slate-600 hover:bg-slate-50',
    ].join(' ')}>
      {icon}{label}
    </button>
  );
}
