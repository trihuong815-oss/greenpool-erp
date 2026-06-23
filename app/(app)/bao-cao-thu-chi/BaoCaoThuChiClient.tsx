'use client';

// PR-CASH1D: Orchestrator UI /bao-cao-thu-chi.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BranchId } from '@/lib/branches';
import { BRANCH_BY_ID } from '@/lib/branches';
import { useToast } from '@/components/ui/Toast';
import { listCashflowReports } from '@/lib/services/finance/api-client';
import type { DailyCashflowReportDoc } from '@/lib/finance/cashflow-report-types';

import { CashflowReportFilters, type StatusFilter } from './_components/CashflowReportFilters';
import { CashflowReportSummaryCards } from './_components/CashflowReportSummaryCards';
import { CashflowReportTable } from './_components/CashflowReportTable';
import { CashflowReportDetailDrawer } from './_components/CashflowReportDetailDrawer';

interface Props {
  myRoleCode: string;
  myBranchId: BranchId | null;
  canCheckReturn: boolean;     // TP_KE / ADMIN
  canSelectBranch: boolean;    // top role + THU_QUY + TP_KE + TP_GS
  showSummaryCards: boolean;   // multi-branch viewers (top + THU_QUY + TP_KE + TP_GS)
}

function todayVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export default function BaoCaoThuChiClient({ myRoleCode, myBranchId, canCheckReturn, canSelectBranch, showSummaryCards }: Props) {
  const toast = useToast();
  type Doc = DailyCashflowReportDoc & { id: string };

  const initialBranch: BranchId | 'all' = canSelectBranch ? 'all' : (myBranchId ?? 'all');

  const [date, setDate] = useState<string>(todayVN());
  const [branchId, setBranchId] = useState<BranchId | 'all'>(initialBranch);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [alertsOnly, setAlertsOnly] = useState(false);

  const [reports, setReports] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await listCashflowReports({ date, branchId: branchId === 'all' ? null : branchId });
      setReports(r.reports ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải báo cáo');
      setReports([]);
    } finally { setLoading(false); }
  }, [date, branchId]);

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
    : 'Cơ sở chưa nộp báo cáo thu-chi cho ngày này.';

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-50 space-y-4">
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

      {showSummaryCards && <CashflowReportSummaryCards reports={filtered} />}

      <CashflowReportTable
        reports={filtered}
        loading={loading}
        error={error}
        emptyText={emptyText}
        onOpen={(r) => setOpenId(r.id)}
        onRefresh={load}
      />

      <div className="text-xs text-slate-500 px-1">
        Đang đăng nhập với vai trò: <span className="font-mono text-slate-700">{myRoleCode}</span>
        {!canCheckReturn && <span className="ml-2 text-amber-700">• View-only</span>}
      </div>

      {openId && (
        <CashflowReportDetailDrawer
          reportId={openId}
          canCheckReturn={canCheckReturn}
          onClose={() => setOpenId(null)}
          onChanged={() => { toast.success('Cập nhật thành công'); load(); }}
          onError={(msg) => toast.error(msg)}
        />
      )}
    </div>
  );
}
