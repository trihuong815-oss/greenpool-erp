'use client';

// PR-CASH1C-GRID (2026-06-23) — Orchestrator UI Chi phí cơ sở dạng SỔ CHI BẢNG DÒNG.
// PR-CASH-FILTERS (2026-06-24) — Bộ lọc nâng cao + URL query state.
// PR-CASH-DATE-RANGE-UX (2026-06-24) — Bố cục lọc chuyên nghiệp + date range thật
// (calendar picker native) + presets (Hôm nay/Hôm qua/7 ngày/30 ngày/Tháng này/...).
//
// API /api/finance/expenses hỗ trợ dateFrom/dateTo thật (cap 31 ngày).
// Filter nâng cao client-side; range = server-side (Firestore composite index sẵn có).

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Filter, FileBarChart, Info, Lock, RotateCcw, Check } from 'lucide-react';
import type { BranchId } from '@/lib/branches';
import { BRANCHES, BRANCH_BY_ID, isBranchId } from '@/lib/branches';
import { useToast } from '@/components/ui/Toast';
import {
  listExpenses,
  listCashflowReports,
  type ExpenseDoc,
} from '@/lib/services/finance/api-client';
import {
  EMPTY_EXPENSE_FILTERS,
  filterExpenses,
  hasActiveExpenseFilters,
  sumExpenseAmount,
  sumRecordedExpenseAmount,
  type ExpenseFilters,
} from '@/lib/finance/filter-expenses';
import {
  readExpenseFiltersFromQuery,
  writeExpenseFiltersToParams,
  readDateRangeFromQuery,
  writeDateRangeToParams,
} from '@/lib/finance/filter-url';
import {
  rangeDays,
  type DateRange,
} from '@/lib/finance/date-presets';
import { DateRangeBar } from '@/components/finance/DateRangeBar';

import { ExpenseLedgerGrid } from './_components/ExpenseLedgerGrid';
import { ExpenseStatusSummary } from './_components/ExpenseStatusSummary';
import { ExpenseFilterPanel } from './_components/ExpenseFilterPanel';

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

export default function ChiPhiCoSoClient({ myBranchId, canEdit, canSelectBranch }: Props) {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Bootstrap state từ URL — sanitize an toàn, scope branch theo quyền.
  const initialBranch: BranchId | null = useMemo(() => {
    const fromUrl = searchParams?.get('branchId') ?? '';
    if (canSelectBranch) {
      if (isBranchId(fromUrl)) return fromUrl;
      return myBranchId ?? (BRANCHES[0].id as BranchId);
    }
    return myBranchId;
  }, [searchParams, canSelectBranch, myBranchId]);

  const initialRange: DateRange = useMemo(
    () => readDateRangeFromQuery((k) => searchParams?.get(k) ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const initialFilters = useMemo<ExpenseFilters>(
    () => readExpenseFiltersFromQuery((k) => searchParams?.get(k) ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [range, setRange] = useState<DateRange>(initialRange);
  const [branchId, setBranchId] = useState<BranchId | null>(initialBranch);
  const [filters, setFilters] = useState<ExpenseFilters>(initialFilters);

  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock detection — chỉ check khi range = 1 ngày để giữ behavior cũ.
  const [isLocked, setIsLocked] = useState(false);
  const [lockedByName, setLockedByName] = useState<string | null>(null);
  const [lockedAt, setLockedAt] = useState<string | null>(null);

  const isSingleDay = range.dateFrom === range.dateTo;
  const days = rangeDays(range);

  // Sync URL query → state thay đổi.
  const syncedOnceRef = useRef(false);
  useEffect(() => {
    if (!syncedOnceRef.current) { syncedOnceRef.current = true; return; }
    const params = new URLSearchParams();
    writeDateRangeToParams(range, params);
    if (branchId && canSelectBranch) params.set('branchId', branchId);
    writeExpenseFiltersToParams(filters, params);
    const qs = params.toString();
    router.replace(`/chi-phi-co-so${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [range, branchId, filters, router, canSelectBranch]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true); setError(null);
    try {
      // Range fetch (server-side dateFrom/dateTo thật).
      const expensesP = listExpenses({
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        branchId,
      });
      // Lock check chỉ khi single day — multi-day lock state phức tạp, defer.
      const reportP = isSingleDay
        ? listCashflowReports({ date: range.dateFrom, branchId }).catch(() => ({ reports: [] as any[] }))
        : Promise.resolve({ reports: [] as any[] });
      const [r, reportR] = await Promise.all([expensesP, reportP]);
      setExpenses(r.expenses ?? []);
      const match = (reportR.reports ?? []).find((x: any) => x.date === range.dateFrom && x.branchId === branchId);
      const locked = isSingleDay && match?.status === 'locked';
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
  }, [range.dateFrom, range.dateTo, branchId, isSingleDay]);

  useEffect(() => { load(); }, [load]);

  const branchName = useMemo(() => branchId ? (BRANCH_BY_ID[branchId]?.name ?? branchId) : '', [branchId]);

  const filteredExpenses = useMemo(() => filterExpenses(expenses, filters), [expenses, filters]);
  const active = hasActiveExpenseFilters(filters);
  const totalRecordedAll = useMemo(() => sumRecordedExpenseAmount(expenses), [expenses]);
  const totalRecordedFiltered = useMemo(() => sumRecordedExpenseAmount(filteredExpenses), [filteredExpenses]);
  const totalAllFiltered = useMemo(() => sumExpenseAmount(filteredExpenses), [filteredExpenses]);

  // Totals label theo state: filter-on > range-on > single-day default.
  const totalLabel = active
    ? 'Tổng theo bộ lọc'
    : (days > 1 ? 'Tổng chi trong khoảng' : 'Tổng chi trong ngày');

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-50 space-y-4 overflow-y-auto">
      {/* Helper strip — gọn, KHÔNG dùng banner lớn rối mắt */}
      <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
        <Info size={12} className="text-sky-500 shrink-0" />
        <span>Mỗi dòng = một phiếu chi.</span>
        <Link href="/bao-cao-thu-chi" className="inline-flex items-center gap-0.5 text-sky-600 hover:text-sky-800 font-medium">
          <FileBarChart size={11} /> Báo cáo thu-chi tổng hợp
        </Link>
      </div>

      {/* PR-CHIPHI-NORMALIZE (2026-06-27): bỏ "Vai trò: XXX" inline (redundant
          với AppTopBar subtitle). "View-only" chip thu gọn, chỉ hiện khi !canEdit. */}
      <div className="card shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Filter size={14} className="text-emerald-600" /> Bộ lọc
          </div>
          {!canEdit && (
            <span className="text-[11px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-md ring-1 ring-amber-200">
              Chỉ xem
            </span>
          )}
        </div>

        {/* Hàng lọc chính: time range + branch */}
        <div className="flex flex-wrap items-end gap-2">
          <DateRangeBar value={range} onChange={(r) => setRange(r)} />
          <div className="flex flex-col">
            <label className="text-xs font-medium text-slate-600 mb-1">Cơ sở</label>
            {canSelectBranch ? (
              <select
                value={branchId ?? ''}
                onChange={(e) => { const v = e.target.value; if (isBranchId(v)) setBranchId(v); }}
                className="h-9 px-3 text-sm rounded-lg bg-white ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
              >
                {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
              </select>
            ) : (
              <div className="h-9 px-3 text-sm rounded-lg ring-1 ring-slate-200 bg-slate-50 inline-flex items-center min-w-[12rem] font-medium text-slate-700">
                {branchId ? `${branchId} — ${branchName}` : '(Không xác định)'}
              </div>
            )}
          </div>
        </div>

        {/* Hàng thao tác: lọc nâng cao + chips */}
        <ExpenseFilterPanel
          value={filters}
          onApply={setFilters}
          onClear={() => setFilters(EMPTY_EXPENSE_FILTERS)}
        />
      </div>

      {!branchId ? (
        <div className="card text-center py-12 text-sm text-slate-500">
          Tài khoản chưa được gán cơ sở. Vui lòng liên hệ Admin.
        </div>
      ) : (
        <>
          {/* PR-CHIPHI-NORMALIZE (2026-06-27): bỏ gradient violet/purple loud
              → solid bg-violet-50 ring-violet-200 chuẩn rule "không gradient lớn". */}
          {isLocked && (
            <div className="rounded-lg bg-violet-50 ring-1 ring-violet-200 px-4 py-3 flex items-start gap-3 text-sm">
              <Lock size={16} className="text-violet-600 shrink-0 mt-0.5" />
              <div className="text-violet-900 flex-1">
                <div className="font-semibold mb-0.5">Ngày này đã khóa báo cáo thu-chi.</div>
                <div className="text-xs text-violet-700 leading-relaxed">
                  Bạn chỉ có thể xem, không thể thêm/sửa/ghi nhận chi phí.
                  {lockedByName ? <> Người khóa: <strong>{lockedByName}</strong>.</> : null}
                  {lockedAt ? <> Thời gian: <span className="font-mono">{lockedAt}</span>.</> : null}
                </div>
              </div>
            </div>
          )}

          {!isSingleDay && canEdit && (
            <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-800">
              <Check size={12} className="inline mr-1" />
              Đang xem nhiều ngày — chế độ chỉ đọc. Để THÊM phiếu chi mới, chọn preset "Hôm nay" hoặc range 1 ngày cụ thể.
            </div>
          )}

          {active && filteredExpenses.length === 0 && expenses.length > 0 && (
            <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 flex items-start gap-3 text-sm">
              <div className="text-amber-900 flex-1">
                <div className="font-semibold mb-1">Không có dữ liệu phù hợp với bộ lọc.</div>
                <div className="text-xs text-amber-800">
                  Có {expenses.length} dòng trong khoảng — bộ lọc đang ẩn tất cả. Hãy nới lỏng hoặc xóa bộ lọc để xem.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_EXPENSE_FILTERS)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ring-1 ring-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors shrink-0"
              >
                <RotateCcw size={11} /> Xóa lọc
              </button>
            </div>
          )}

          <ExpenseLedgerGrid
            date={range.dateFrom}
            branchId={branchId}
            branchName={branchName}
            expenses={filteredExpenses}
            loading={loading}
            error={error}
            canEdit={canEdit && !isLocked && isSingleDay}
            onRefresh={load}
            onChanged={load}
            onError={(msg) => toast.error(msg)}
            onSuccess={(msg) => toast.success(msg)}
          />

          {/* PR-CHIPHI-NORMALIZE (2026-06-27): tổng card compact — value lớn 1 dòng
              + 2 dòng breakdown nhỏ chỉ hiện khi filter active. Bỏ shadow-sm dày. */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between text-sm flex-wrap gap-2">
              <span className="font-semibold text-slate-700">
                {totalLabel}
                <span className="ml-2 text-[11px] font-normal text-slate-500">(chỉ tính đã ghi nhận)</span>
              </span>
              <span className="text-[22px] font-semibold leading-tight text-slate-900 tabular-nums">
                {totalRecordedFiltered.toLocaleString()} ₫
              </span>
            </div>
            {active && (
              <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                <div className="flex items-center justify-between">
                  <span>Tổng theo bộ lọc (gồm nháp/trả lại/hủy)</span>
                  <span className="tabular-nums">{totalAllFiltered.toLocaleString()} ₫</span>
                </div>
                {totalRecordedAll !== totalRecordedFiltered && (
                  <div className="flex items-center justify-between">
                    <span>{days > 1 ? 'Tổng toàn khoảng' : 'Tổng toàn ngày'} (đã ghi nhận, không filter)</span>
                    <span className="tabular-nums">{totalRecordedAll.toLocaleString()} ₫</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <ExpenseStatusSummary expenses={filteredExpenses} />
        </>
      )}
    </div>
  );
}
