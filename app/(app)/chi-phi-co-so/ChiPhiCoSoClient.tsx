'use client';

// PR-CASH1C: Orchestrator UI Chi phí cơ sở — Editor cho NV_KE, View-only cho TP_KE/QLCS.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import type { BranchId } from '@/lib/branches';
import { BRANCHES, BRANCH_BY_ID, isBranchId } from '@/lib/branches';
import { useToast } from '@/components/ui/Toast';
import {
  fetchDailyRevenueSummary,
  listExpenses,
  listCashflowReports,
  type DailySummaryResponse,
  type ExpenseDoc,
  type SubmitReportResponse,
} from '@/lib/services/finance/api-client';
import type { DailyCashflowReportDoc } from '@/lib/finance/cashflow-report-types';

import { DailyRevenueSummaryCard } from './_components/DailyRevenueSummaryCard';
import { ExpenseForm } from './_components/ExpenseForm';
import { ExpenseList } from './_components/ExpenseList';
import { CashflowPreviewCard } from './_components/CashflowPreviewCard';
import { SubmitCashflowReportCard } from './_components/SubmitCashflowReportCard';
import { CashflowReportResultCard } from './_components/CashflowReportResultCard';

interface Props {
  myRoleCode: string;
  myBranchId: BranchId | null;
  canEdit: boolean;        // NV_KE + ADMIN  → form + submit visible
  canSelectBranch: boolean; // top role: chọn cơ sở; NV_KE/QLCS: branch fixed
}

function todayVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export default function ChiPhiCoSoClient({ myRoleCode, myBranchId, canEdit, canSelectBranch }: Props) {
  const toast = useToast();

  const initialBranch: BranchId | null = canSelectBranch
    ? (myBranchId ?? (BRANCHES[0].id as BranchId))
    : myBranchId;

  const [date, setDate] = useState<string>(todayVN());
  const [branchId, setBranchId] = useState<BranchId | null>(initialBranch);
  const [editing, setEditing] = useState<ExpenseDoc | null>(null);

  // Data
  const [revenue, setRevenue] = useState<DailySummaryResponse | null>(null);
  const [revLoading, setRevLoading] = useState(false);
  const [revError, setRevError] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [expLoading, setExpLoading] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);

  const [report, setReport] = useState<(DailyCashflowReportDoc & { id: string }) | null>(null);
  const [repLoading, setRepLoading] = useState(false);

  const loadRevenue = useCallback(async () => {
    if (!branchId) return;
    setRevLoading(true); setRevError(null);
    try {
      const r = await fetchDailyRevenueSummary(date, branchId);
      setRevenue(r);
    } catch (e: any) { setRevError(e?.message ?? 'Lỗi tải tổng thu'); setRevenue(null); }
    finally { setRevLoading(false); }
  }, [date, branchId]);

  const loadExpenses = useCallback(async () => {
    if (!branchId) return;
    setExpLoading(true); setExpError(null);
    try {
      const r = await listExpenses(date, branchId);
      setExpenses(r.expenses ?? []);
    } catch (e: any) { setExpError(e?.message ?? 'Lỗi tải phiếu chi'); setExpenses([]); }
    finally { setExpLoading(false); }
  }, [date, branchId]);

  const loadReport = useCallback(async () => {
    if (!branchId) return;
    setRepLoading(true);
    try {
      const r = await listCashflowReports(date, branchId);
      const list = r.reports ?? [];
      // server already orders by date desc; pick by exact date+branch match.
      const match = list.find((x) => x.date === date && x.branchId === branchId) ?? null;
      setReport(match);
    } catch { setReport(null); }
    finally { setRepLoading(false); }
  }, [date, branchId]);

  useEffect(() => { loadRevenue(); loadExpenses(); loadReport(); }, [loadRevenue, loadExpenses, loadReport]);

  const branchName = useMemo(() => branchId ? (BRANCH_BY_ID[branchId]?.name ?? branchId) : '', [branchId]);

  function handleSubmitted(resp: SubmitReportResponse) {
    toast.success(`Đã nộp báo cáo thu-chi (v${resp.reportVersion}). ${resp.summary.sentToCount} người nhận.`);
    loadReport();
  }

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-50 space-y-4">
      {/* Header filter */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter size={14} /> Bộ lọc
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">Ngày</label>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setEditing(null); }}
              className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">Cơ sở</label>
            {canSelectBranch ? (
              <select
                value={branchId ?? ''}
                onChange={(e) => { const v = e.target.value; if (isBranchId(v)) setBranchId(v); }}
                className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
              >
                {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
              </select>
            ) : (
              <div className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 bg-slate-50 inline-flex items-center min-w-[12rem]">
                {branchId ? `${branchId} — ${branchName}` : '(Không xác định)'}
              </div>
            )}
          </div>
          <div className="ml-auto text-xs text-slate-500">
            Bạn đang đăng nhập với vai trò: <span className="font-mono text-slate-700">{myRoleCode}</span>
            {!canEdit && <span className="ml-2 text-amber-700">• View-only</span>}
          </div>
        </div>
      </div>

      {!branchId ? (
        <div className="card text-center py-12 text-sm text-slate-500">
          Tài khoản chưa được gán cơ sở. Vui lòng liên hệ Admin.
        </div>
      ) : (
        <>
          <DailyRevenueSummaryCard
            summary={revenue}
            loading={revLoading}
            error={revError}
            onRefresh={loadRevenue}
          />

          {canEdit && (
            <ExpenseForm
              date={date}
              branchId={branchId}
              branchName={branchName}
              editing={editing}
              onCancelEdit={() => setEditing(null)}
              onSaved={() => { toast.success(editing ? 'Đã cập nhật phiếu chi' : 'Đã lưu phiếu chi'); loadExpenses(); setEditing(null); }}
              onError={(msg) => toast.error(msg)}
            />
          )}

          <ExpenseList
            expenses={expenses}
            loading={expLoading}
            error={expError}
            canMutate={canEdit}
            onRefresh={loadExpenses}
            onEdit={(e) => { setEditing(e); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            onChanged={() => { toast.success('Cập nhật xong'); loadExpenses(); }}
            onError={(msg) => toast.error(msg)}
          />

          <CashflowPreviewCard revenue={revenue} expenses={expenses} />

          {canEdit && (
            <SubmitCashflowReportCard
              date={date}
              branchId={branchId}
              onSubmitted={handleSubmitted}
              onError={(msg) => toast.error(msg)}
            />
          )}

          <CashflowReportResultCard report={report} loading={repLoading} canSubmit={canEdit} onRefresh={loadReport} />
        </>
      )}
    </div>
  );
}
