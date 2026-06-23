'use client';

// PR-CASH1C-REFINE: Orchestrator UI Chi phí cơ sở — CHỈ NGHIỆP VỤ CHI.
//
// THAY ĐỔI vs PR-CASH1C gốc:
//  - BỎ DailyRevenueSummaryCard (số thu thuộc Đối chiếu doanh số / Tổng hợp doanh thu ngày)
//  - BỎ CashflowPreviewCard (Thu-Chi-Net thuộc /bao-cao-thu-chi)
//  - BỎ SubmitCashflowReportCard (nút Nộp báo cáo chuyển sang /bao-cao-thu-chi)
//  - BỎ CashflowReportResultCard (kết quả báo cáo thuộc /bao-cao-thu-chi)
//  + THÊM ExpenseStatusSummary (chỉ tổng chi 4 method + count theo status)
//  + THÊM khối hướng dẫn nghiệp vụ phân tách rõ Chi phí cơ sở ↔ Báo cáo thu-chi

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Filter, FileBarChart, Info } from 'lucide-react';
import type { BranchId } from '@/lib/branches';
import { BRANCHES, BRANCH_BY_ID, isBranchId } from '@/lib/branches';
import { useToast } from '@/components/ui/Toast';
import {
  listExpenses,
  type ExpenseDoc,
} from '@/lib/services/finance/api-client';

import { ExpenseForm } from './_components/ExpenseForm';
import { ExpenseList } from './_components/ExpenseList';
import { ExpenseStatusSummary } from './_components/ExpenseStatusSummary';

interface Props {
  myRoleCode: string;
  myBranchId: BranchId | null;
  canEdit: boolean;            // NV_KE + ADMIN
  canSelectBranch: boolean;    // top role
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

  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [expLoading, setExpLoading] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    if (!branchId) return;
    setExpLoading(true); setExpError(null);
    try {
      const r = await listExpenses(date, branchId);
      setExpenses(r.expenses ?? []);
    } catch (e: any) { setExpError(e?.message ?? 'Lỗi tải phiếu chi'); setExpenses([]); }
    finally { setExpLoading(false); }
  }, [date, branchId]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const branchName = useMemo(() => branchId ? (BRANCH_BY_ID[branchId]?.name ?? branchId) : '', [branchId]);

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

      {/* Hướng dẫn nghiệp vụ */}
      <div className="rounded-lg bg-sky-50 ring-1 ring-sky-200 px-4 py-3 flex items-start gap-3 text-sm">
        <Info size={16} className="text-sky-600 shrink-0 mt-0.5" />
        <div className="text-sky-900">
          <div className="font-semibold mb-0.5">Đây là màn ghi nhận các khoản chi thực tế của cơ sở.</div>
          <div className="text-xs text-sky-800">
            Phần doanh thu và báo cáo thu-chi tổng hợp được xem tại{' '}
            <Link href="/bao-cao-thu-chi" className="font-semibold underline-offset-2 hover:underline inline-flex items-center gap-1">
              <FileBarChart size={12} /> Báo cáo thu-chi
            </Link>.
          </div>
        </div>
      </div>

      {!branchId ? (
        <div className="card text-center py-12 text-sm text-slate-500">
          Tài khoản chưa được gán cơ sở. Vui lòng liên hệ Admin.
        </div>
      ) : (
        <>
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

          <ExpenseStatusSummary expenses={expenses} />
        </>
      )}
    </div>
  );
}
