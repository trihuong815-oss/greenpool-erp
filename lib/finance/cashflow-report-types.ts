// PR-CASH1B (2026-06-23) — Types cho báo cáo thu-chi ngày (dailyCashflowReports).
//
// Source of truth phần THU = daily-summary API (V8 Phase 2). Cashflow report
// SNAPSHOT grandTotals tại thời điểm submit — KHÔNG tự build lại logic Sale + Reception.
//
// Workflow chốt:
//   draft       — đang tổng hợp
//   submitted   — NV_KE đã bấm "Nộp báo cáo"
//   sent        — server đã distribute
//   checked     — TP_KE đã kiểm tra báo cáo
//   returned    — TP_KE trả lại để bổ sung
//   locked      — ngày đã chốt (defer PR-CASH1E)

import type { Timestamp } from 'firebase-admin/firestore';
import type { BranchId } from '@/lib/branches';
import type { ExpensePaymentMethod } from './expense-types';

export type DailyCashflowReportStatus =
  | 'draft'
  | 'submitted'
  | 'sent'
  | 'checked'
  | 'returned'
  | 'locked';

export const DAILY_CASHFLOW_REPORT_STATUS_LABEL: Record<DailyCashflowReportStatus, string> = {
  draft: 'Nháp',
  submitted: 'Đã nộp',
  sent: 'Đã gửi',
  checked: 'Đã kiểm tra',
  returned: 'Trả lại bổ sung',
  locked: 'Đã chốt',
};

/** Alert codes — server compute lúc submit. UI render badge. */
export type CashflowAlertCode =
  | 'DAILY_REVENUE_ZERO'              // revenue.total === 0
  | 'DAILY_REVENUE_MAY_BE_INCOMPLETE' // reception draft / batch pending
  | 'REVENUE_CHANGED_AFTER_SUBMIT'    // daily-summary diff vs revenueSource snapshot
  | 'EXPENSE_HAS_OTHER_PAYMENT_METHOD' // có chi paymentMethod='other'
  | 'EXPENSE_VOUCHER_DUPLICATE'       // voucherNo trùng trong branch+month
  | 'EXPENSE_RETURNED_EXISTS'         // có expense status='returned' trong ngày
  | 'NET_NEGATIVE_CASH'               // net.cash < 0 (chi nhiều hơn thu tiền mặt)
  | 'MISSING_EVIDENCE';               // chi không có attachment (PR sau)

export const CASHFLOW_ALERT_LABEL: Record<CashflowAlertCode, string> = {
  DAILY_REVENUE_ZERO: 'Tổng thu ngày = 0',
  DAILY_REVENUE_MAY_BE_INCOMPLETE: 'Tổng hợp doanh thu ngày có thể chưa đầy đủ',
  REVENUE_CHANGED_AFTER_SUBMIT: 'Tổng thu ngày đã thay đổi sau khi nộp báo cáo',
  EXPENSE_HAS_OTHER_PAYMENT_METHOD: 'Có khoản chi phương thức "Khác"',
  EXPENSE_VOUCHER_DUPLICATE: 'Số chứng từ trùng trong cùng cơ sở/tháng',
  EXPENSE_RETURNED_EXISTS: 'Có khoản chi đang trả lại bổ sung',
  NET_NEGATIVE_CASH: 'Tồn tiền mặt âm trong ngày',
  MISSING_EVIDENCE: 'Có khoản chi thiếu chứng từ',
};

export interface CashflowAlert {
  code: CashflowAlertCode;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

/** Snapshot từ daily-summary tại thời điểm submit. */
export interface RevenueSource {
  sourceType: 'daily_revenue_reconciliation_summary';
  sourceDate: string;                   // 'YYYY-MM-DD'
  sourceBranchId: BranchId;
  totalByMethod: {
    cash: number;
    transfer: number;
    card: number;
    total: number;
  };
  /** = totalByMethod.total — duplicate cho convenience query. */
  total: number;
  fetchedAt: Timestamp;
}

/** Aggregate chi (chỉ status='recorded' vào tính). */
export interface ExpenseAggregate {
  totalByMethod: {
    cash: number;
    transfer: number;
    card: number;
    other: number;
    total: number;
  };
  /** ID các expense status='recorded' đã include. */
  expenseEntryIds: string[];
  count: number;
  returnedCount: number;
  voidedCount: number;
}

/** Net = revenue - expense per method. */
export interface NetCashflow {
  cash: number;
  transfer: number;
  card: number;
  other: number;          // = 0 - expense.other (revenue không có 'other')
  total: number;
}

/** Distribution snapshot lúc submit. */
export interface ReportSentTo {
  treasurerUserIds: string[];        // THU_QUY
  accountingManagerUserIds: string[]; // TP_KE
  supervisionUserIds: string[];       // TP_GS
  leadershipUserIds: string[];        // CEO + CHU_TICH + GD_VP + GD_KD
}

/** Revision history — preserve previous reportVersion snapshot. */
export interface CashflowReportRevision {
  reportVersion: number;
  revenueSource: RevenueSource;
  expense: ExpenseAggregate;
  net: NetCashflow;
  submittedBy: string;
  submittedByName: string;
  submittedAt: Timestamp;
  reason: string | null;            // lý do nộp lại (vd "Doanh thu đã thay đổi")
}

/** dailyCashflowReports/{branchId}_{date} — docId deterministic */
export interface DailyCashflowReportDoc {
  id: string;
  date: string;
  month: string;
  branchId: BranchId;
  branchName: string;

  status: DailyCashflowReportStatus;

  // ─── Snapshot nguồn thu (REUSE daily-summary) ───
  revenueSource: RevenueSource;

  // ─── Aggregate chi ───
  expense: ExpenseAggregate;

  // ─── Net ───
  net: NetCashflow;

  // ─── Source refs ───
  sourceRefs: {
    revenueSummaryId: string | null;  // null nếu daily-summary chưa persist
    revenueDate: string;
    revenueBranchId: BranchId;
    expenseEntryIds: string[];
  };

  // ─── Versioning ───
  reportVersion: number;              // 1, 2, 3... — increment mỗi lần resubmit
  previousReportId: string | null;    // (defer — chỉ dùng nếu split version sang doc khác)
  revisions: CashflowReportRevision[]; // history append-only

  // ─── Submit ───
  submittedBy: string;
  submittedByName: string;
  submittedAt: Timestamp;

  // ─── Distribute ───
  sentTo: ReportSentTo;
  sentAt: Timestamp | null;

  // ─── Check (TP_KE) — KHÔNG phải duyệt chi ───
  checkedBy: string | null;
  checkedByName: string | null;
  checkedAt: Timestamp | null;
  checkNote: string | null;

  // ─── Return ───
  returnedBy: string | null;
  returnedByName: string | null;
  returnedAt: Timestamp | null;
  returnReason: string | null;

  // ─── Lock (defer PR-CASH1E) ───
  lockedBy: string | null;
  lockedByName: string | null;
  lockedAt: Timestamp | null;

  // ─── Generate metadata ───
  generatedBy: string;                // = submittedBy hoặc 'system' nếu auto
  generatedAt: Timestamp;

  // ─── Alerts ───
  alerts: CashflowAlert[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Helper compute docId deterministic. */
export function buildCashflowReportId(branchId: BranchId, date: string): string {
  return `${branchId}_${date}`;
}
