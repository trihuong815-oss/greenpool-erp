// PR-CASH1B (2026-06-23) — Pure helpers compute aggregate + net + alerts.
// Tách khỏi route để testable + reuse trong submit endpoint.

import type {
  BranchDailyExpenseDoc,
  ExpensePaymentMethod,
} from './expense-types';
import type {
  RevenueSource,
  ExpenseAggregate,
  NetCashflow,
  CashflowAlert,
} from './cashflow-report-types';

/** Aggregate expenses by paymentMethod. CHỈ status='recorded' vào totals.
 *  Returned/voided count riêng để compute alert. */
export function aggregateExpenses(
  expenses: Array<Pick<BranchDailyExpenseDoc, 'amount' | 'paymentMethod' | 'status'>>,
  expenseIds: string[],
): ExpenseAggregate & { _recordedIds: string[] } {
  const totalByMethod = { cash: 0, transfer: 0, card: 0, other: 0, total: 0 };
  let count = 0;
  let returnedCount = 0;
  let voidedCount = 0;
  const recordedIds: string[] = [];

  for (let i = 0; i < expenses.length; i++) {
    const e = expenses[i];
    const id = expenseIds[i];
    if (e.status === 'returned') { returnedCount++; continue; }
    if (e.status === 'voided') { voidedCount++; continue; }
    if (e.status !== 'recorded') continue;     // skip 'draft'
    const amount = Number(e.amount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) continue;
    totalByMethod[e.paymentMethod] += amount;
    count++;
    if (id) recordedIds.push(id);
  }
  totalByMethod.total = totalByMethod.cash + totalByMethod.transfer + totalByMethod.card + totalByMethod.other;

  return {
    totalByMethod,
    expenseEntryIds: recordedIds,
    count,
    returnedCount,
    voidedCount,
    _recordedIds: recordedIds,
  };
}

/** Compute net = revenue - expense per method.
 *  revenue chỉ có 3 method (cash/transfer/card), expense có 4 (+ other).
 *  net.other = 0 - expense.other (luôn âm hoặc 0). */
export function computeNet(
  revenueSource: Pick<RevenueSource, 'totalByMethod'>,
  expense: ExpenseAggregate,
): NetCashflow {
  return {
    cash:     revenueSource.totalByMethod.cash     - expense.totalByMethod.cash,
    transfer: revenueSource.totalByMethod.transfer - expense.totalByMethod.transfer,
    card:     revenueSource.totalByMethod.card     - expense.totalByMethod.card,
    other:    0                                    - expense.totalByMethod.other,
    total:    revenueSource.totalByMethod.total    - expense.totalByMethod.total,
  };
}

interface AlertContext {
  revenueIncomplete?: {
    receptionMissing?: boolean;
    receptionDraft?: boolean;
    salesBatchPending?: boolean;
  };
  voucherDuplicateExists?: boolean;
}

/** Compute alerts dựa trên state. */
export function computeAlerts(
  revenue: Pick<RevenueSource, 'totalByMethod'>,
  expense: ExpenseAggregate,
  net: NetCashflow,
  context: AlertContext = {},
): CashflowAlert[] {
  const alerts: CashflowAlert[] = [];

  if (revenue.totalByMethod.total === 0) {
    alerts.push({
      code: 'DAILY_REVENUE_ZERO',
      severity: 'warning',
      message: 'Tổng thu ngày = 0. Vui lòng kiểm tra Đối chiếu doanh số trước khi nộp.',
    });
  }

  const inc = context.revenueIncomplete ?? {};
  if (inc.receptionMissing || inc.receptionDraft || inc.salesBatchPending) {
    const reasons: string[] = [];
    if (inc.receptionMissing) reasons.push('quầy lễ tân chưa nhập');
    if (inc.receptionDraft) reasons.push('quầy lễ tân còn nháp');
    if (inc.salesBatchPending) reasons.push('Sale còn batch chờ duyệt');
    alerts.push({
      code: 'DAILY_REVENUE_MAY_BE_INCOMPLETE',
      severity: 'warning',
      message: `Tổng hợp doanh thu ngày có thể chưa đầy đủ (${reasons.join(', ')}).`,
    });
  }

  if (expense.totalByMethod.other > 0) {
    alerts.push({
      code: 'EXPENSE_HAS_OTHER_PAYMENT_METHOD',
      severity: 'info',
      message: `Có ${expense.totalByMethod.other.toLocaleString()} đ chi phương thức "Khác".`,
    });
  }

  if (expense.returnedCount > 0) {
    alerts.push({
      code: 'EXPENSE_RETURNED_EXISTS',
      severity: 'warning',
      message: `Có ${expense.returnedCount} khoản chi đang chờ kế toán cơ sở bổ sung.`,
    });
  }

  if (context.voucherDuplicateExists) {
    alerts.push({
      code: 'EXPENSE_VOUCHER_DUPLICATE',
      severity: 'warning',
      message: 'Phát hiện số chứng từ trùng trong cùng cơ sở/tháng.',
    });
  }

  if (net.cash < 0) {
    alerts.push({
      code: 'NET_NEGATIVE_CASH',
      severity: 'warning',
      message: `Tồn tiền mặt trong ngày âm: ${net.cash.toLocaleString()} đ.`,
    });
  }

  return alerts;
}

/** Detect revenue snapshot diff vs current daily-summary.
 *  Returns true nếu CÓ thay đổi (caller compute alert REVENUE_CHANGED_AFTER_SUBMIT). */
export function hasRevenueChanged(
  snapshot: Pick<RevenueSource, 'totalByMethod'>,
  current: Pick<RevenueSource, 'totalByMethod'>,
): boolean {
  return snapshot.totalByMethod.cash !== current.totalByMethod.cash
      || snapshot.totalByMethod.transfer !== current.totalByMethod.transfer
      || snapshot.totalByMethod.card !== current.totalByMethod.card
      || snapshot.totalByMethod.total !== current.totalByMethod.total;
}
