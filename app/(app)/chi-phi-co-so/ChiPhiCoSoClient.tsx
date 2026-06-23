'use client';

// PR-CASH1C-GRID (2026-06-23) — Orchestrator UI Chi phí cơ sở dạng SỔ CHI BẢNG DÒNG.
//
// /chi-phi-co-so chỉ nghiệp vụ CHI:
//  - Filter ngày + cơ sở
//  - Hướng dẫn nghiệp vụ (link sang /bao-cao-thu-chi cho THU + Net + Báo cáo)
//  - ExpenseLedgerGrid: bảng inline-editable, nhập liên tục, auto-add row sau lưu/ghi nhận
//  - ExpenseStatusSummary: tổng chi 4 method + count theo status (CHỈ CHI)
//
// KHÔNG có: Tổng thu, Thu-Chi-Net, Nộp báo cáo thu-chi, Duyệt chi.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Filter, FileBarChart, Info, Lock } from 'lucide-react';
import type { BranchId } from '@/lib/branches';
import { BRANCHES, BRANCH_BY_ID, isBranchId } from '@/lib/branches';
import { useToast } from '@/components/ui/Toast';
import {
  listExpenses,
  listCashflowReports,
  type ExpenseDoc,
} from '@/lib/services/finance/api-client';

import { ExpenseLedgerGrid } from './_components/ExpenseLedgerGrid';
import { ExpenseStatusSummary } from './_components/ExpenseStatusSummary';

interface Props {
  myRoleCode: string;
  myBranchId: BranchId | null;
  canEdit: boolean;
  canSelectBranch: boolean;
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

  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PR-CASH1F (2026-06-23): biết trạng thái khóa của ngày/cơ sở để khóa UI.
  const [isLocked, setIsLocked] = useState(false);
  const [lockedByName, setLockedByName] = useState<string | null>(null);
  const [lockedAt, setLockedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true); setError(null);
    try {
      const [r, reportR] = await Promise.all([
        listExpenses(date, branchId),
        listCashflowReports({ date, branchId }).catch(() => ({ reports: [] as any[] })),
      ]);
      setExpenses(r.expenses ?? []);
      const match = (reportR.reports ?? []).find((x: any) => x.date === date && x.branchId === branchId);
      const locked = match?.status === 'locked';
      setIsLocked(locked);
      setLockedByName(locked ? (match?.lockedByName ?? null) : null);
      setLockedAt(locked ? (match?.lockedAt?._seconds
        ? new Date(match.lockedAt._seconds * 1000).toLocaleString('vi-VN')
        : (match?.lockedAt ? String(match.lockedAt).slice(0, 16).replace('T', ' ') : null)) : null);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải phiếu chi');
      setExpenses([]);
      setIsLocked(false);
    }
    finally { setLoading(false); }
  }, [date, branchId]);

  useEffect(() => { load(); }, [load]);

  const branchName = useMemo(() => branchId ? (BRANCH_BY_ID[branchId]?.name ?? branchId) : '', [branchId]);

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-50 space-y-4 overflow-y-auto">
      {/* Header filter — polished */}
      <div className="card shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter size={14} className="text-emerald-600" /> Bộ lọc
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Ngày</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors duration-150"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Cơ sở</label>
            {canSelectBranch ? (
              <select
                value={branchId ?? ''}
                onChange={(e) => { const v = e.target.value; if (isBranchId(v)) setBranchId(v); }}
                className="h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors duration-150"
              >
                {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
              </select>
            ) : (
              <div className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 bg-slate-50 inline-flex items-center min-w-[12rem] font-medium text-slate-700">
                {branchId ? `${branchId} — ${branchName}` : '(Không xác định)'}
              </div>
            )}
          </div>
          <div className="ml-auto text-xs text-slate-500">
            Vai trò: <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{myRoleCode}</span>
            {!canEdit && <span className="ml-2 text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-md ring-1 ring-amber-200">• View-only</span>}
          </div>
        </div>
      </div>

      {/* Hướng dẫn nghiệp vụ — polished gradient + clearer hierarchy */}
      <div className="rounded-xl bg-gradient-to-r from-sky-50 to-blue-50/60 ring-1 ring-sky-200 px-4 py-3 flex items-start gap-3 text-sm shadow-sm">
        <div className="rounded-lg p-1.5 bg-sky-100 text-sky-700 shrink-0">
          <Info size={16} />
        </div>
        <div className="text-sky-900 flex-1">
          <div className="font-semibold mb-1">
            Đây là Sổ chi tiết các khoản CHI của cơ sở — mỗi dòng = một phiếu chi.
          </div>
          <div className="text-xs text-sky-800 leading-relaxed">
            Phần doanh thu và báo cáo thu-chi tổng hợp được xem tại{' '}
            <Link href="/bao-cao-thu-chi" className="font-semibold underline-offset-2 hover:underline inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 transition-colors">
              <FileBarChart size={12} /> Báo cáo thu-chi
            </Link>
            . Nhập xong một dòng và bấm <strong className="text-sky-900">Lưu nháp</strong> / <strong className="text-sky-900">Ghi nhận chi</strong>,
            hệ thống tự thêm dòng mới bên dưới để nhập tiếp.
          </div>
        </div>
      </div>

      {!branchId ? (
        <div className="card text-center py-12 text-sm text-slate-500">
          Tài khoản chưa được gán cơ sở. Vui lòng liên hệ Admin.
        </div>
      ) : (
        <>
          {/* PR-CASH1F (2026-06-23): banner ngày đã khóa — polished */}
          {isLocked && (
            <div className="rounded-xl bg-gradient-to-r from-violet-50 to-purple-50/60 ring-1 ring-violet-300 px-4 py-3 flex items-start gap-3 text-sm shadow-sm">
              <div className="rounded-lg p-1.5 bg-violet-100 text-violet-700 shrink-0">
                <Lock size={16} />
              </div>
              <div className="text-violet-900 flex-1">
                <div className="font-semibold mb-1">Ngày này đã khóa báo cáo thu-chi.</div>
                <div className="text-xs text-violet-800 leading-relaxed">
                  Bạn chỉ có thể xem, không thể thêm/sửa/ghi nhận chi phí.
                  {lockedByName ? <> Người khóa: <strong className="text-violet-900">{lockedByName}</strong>.</> : null}
                  {lockedAt ? <> Thời gian: <span className="font-mono text-violet-900">{lockedAt}</span>.</> : null}
                </div>
              </div>
            </div>
          )}

          <ExpenseLedgerGrid
            date={date}
            branchId={branchId}
            branchName={branchName}
            expenses={expenses}
            loading={loading}
            error={error}
            canEdit={canEdit && !isLocked}
            onRefresh={load}
            onChanged={load}
            onError={(msg) => toast.error(msg)}
            onSuccess={(msg) => toast.success(msg)}
          />

          <ExpenseStatusSummary expenses={expenses} />
        </>
      )}
    </div>
  );
}
