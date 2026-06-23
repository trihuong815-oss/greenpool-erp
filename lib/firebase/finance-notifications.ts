// PR-CASH1E (2026-06-23) — Wrapper notification cho Daily Cashflow Thu-Chi.
//
// 3 event:
//   1. notifyDailyCashflowSubmitted — sau khi NV_KE nộp báo cáo
//        → Thủ quỹ / TP_KE / TP_GS / Lãnh đạo (informational)
//   2. notifyDailyCashflowChecked   — sau khi TP_KE đánh dấu đã kiểm tra
//        → người nộp + NV_KE branch (informational)
//   3. notifyDailyCashflowReturned  — sau khi TP_KE trả lại để bổ sung
//        → người nộp + NV_KE branch (ACTION_REQUIRED: NV_KE cần nộp lại)
//
// Tất cả đều ĐI QUA engine sendNotificationEvent (không bypass), fire-and-forget.
// Caller dùng `void notify...(...)` + `.catch(...)` để không fail nghiệp vụ chính.

import 'server-only';
import { sendNotificationEvent } from './noti-engine';
import { getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';
import type { ReportSentTo } from '@/lib/finance/cashflow-report-types';

function fmtVnd(n: number): string {
  return `${Number(n ?? 0).toLocaleString('vi-VN')} ₫`;
}

// ── Pure helpers (testable, không động DB / engine) ──────────────────────

export function _buildSubmittedRecipients(sentTo: ReportSentTo): string[] {
  return Array.from(new Set([
    ...(sentTo.treasurerUserIds ?? []),
    ...(sentTo.accountingManagerUserIds ?? []),
    ...(sentTo.supervisionUserIds ?? []),
    ...(sentTo.leadershipUserIds ?? []),
  ].filter(Boolean)));
}

export function _buildSubmittedMessage(input: Pick<NotifySubmittedInput, 'branchName' | 'date' | 'revenueTotal' | 'expenseTotal' | 'netTotal'>): string {
  return `${input.branchName} đã nộp báo cáo thu-chi ngày ${input.date}. ` +
    `Tổng thu ${fmtVnd(input.revenueTotal)}, tổng chi ${fmtVnd(input.expenseTotal)}, ` +
    `net ${fmtVnd(input.netTotal)}.`;
}

export function _buildCheckedMessage(input: Pick<NotifyCheckedInput, 'branchName' | 'date' | 'checkedByName' | 'checkNote'>): string {
  const noteSuffix = input.checkNote ? ` Ghi chú: ${input.checkNote}` : '';
  return `Báo cáo thu-chi ngày ${input.date} của ${input.branchName} ` +
    `đã được ${input.checkedByName} kiểm tra.${noteSuffix}`;
}

export function _buildReturnedMessage(input: Pick<NotifyReturnedInput, 'branchName' | 'date' | 'returnReason'>): string {
  return `Báo cáo thu-chi ngày ${input.date} của ${input.branchName} ` +
    `bị trả lại để bổ sung. Lý do: ${input.returnReason}`;
}

export function _buildLinkUrl(target: 'bao-cao' | 'chi-phi', date: string, branchId: string): string {
  const path = target === 'bao-cao' ? '/bao-cao-thu-chi' : '/chi-phi-co-so';
  return `${path}?date=${encodeURIComponent(date)}&branchId=${encodeURIComponent(branchId)}`;
}

/** Resolve NV_KE cùng branch (active) — dùng để gửi noti checked/returned cho team kế toán cơ sở. */
async function resolveBranchAccountantUids(branchId: string): Promise<string[]> {
  try {
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.USERS)
      .where('status', '==', 'active')
      .where('roleId', '==', 'NV_KE')
      .where('branchId', '==', branchId)
      .get();
    return snap.docs.map((d) => d.id);
  } catch {
    return [];
  }
}

// ── Event 1: SUBMITTED ───────────────────────────────────────────────────

export interface NotifySubmittedInput {
  reportId: string;
  reportVersion: number;
  date: string;          // YYYY-MM-DD
  branchId: string;
  branchName: string;
  status: 'submitted' | 'sent';
  revenueTotal: number;
  expenseTotal: number;
  netTotal: number;
  /** Snapshot sentTo trong report (resolve sẵn khi submit). */
  sentTo: ReportSentTo;
}

export async function notifyDailyCashflowSubmitted(input: NotifySubmittedInput): Promise<void> {
  const recipients = Array.from(new Set([
    ...(input.sentTo.treasurerUserIds ?? []),
    ...(input.sentTo.accountingManagerUserIds ?? []),
    ...(input.sentTo.supervisionUserIds ?? []),
    ...(input.sentTo.leadershipUserIds ?? []),
  ].filter(Boolean)));

  if (recipients.length === 0) return;

  const message = `${input.branchName} đã nộp báo cáo thu-chi ngày ${input.date}. ` +
    `Tổng thu ${fmtVnd(input.revenueTotal)}, tổng chi ${fmtVnd(input.expenseTotal)}, ` +
    `net ${fmtVnd(input.netTotal)}.`;

  await sendNotificationEvent({
    type: 'daily_cashflow_submitted',
    module: 'finance',
    entityId: input.reportId,
    entityCode: `${input.branchId}_${input.date}_v${input.reportVersion}`,
    title: 'Báo cáo thu-chi mới',
    message,
    linkUrl: `/bao-cao-thu-chi?date=${encodeURIComponent(input.date)}&branchId=${encodeURIComponent(input.branchId)}`,
    recipients,
    priority: 'normal',
    // PR-CASH1E-FIX (2026-06-23): finance event mặc định bật email (báo cáo tài chính
    // ít event/ngày, thư mục tổng hợp, không spam). User vẫn opt-out qua /bao-mat nếu muốn.
    channels: { inApp: true, push: true, email: true },
    pushTag: `finance-cashflow-${input.reportId}`,
    pushData: {
      kind: 'daily_cashflow_submitted',
      reportId: input.reportId,
      branchId: input.branchId,
      date: input.date,
    },
  });
}

// ── Event 2: CHECKED ─────────────────────────────────────────────────────

export interface NotifyCheckedInput {
  reportId: string;
  reportVersion: number;
  date: string;
  branchId: string;
  branchName: string;
  submittedByUid: string | null;
  checkedByName: string;
  checkNote: string | null;
}

export async function notifyDailyCashflowChecked(input: NotifyCheckedInput): Promise<void> {
  const branchAccountants = await resolveBranchAccountantUids(input.branchId);
  const recipients = Array.from(new Set([
    ...(input.submittedByUid ? [input.submittedByUid] : []),
    ...branchAccountants,
  ].filter(Boolean)));

  if (recipients.length === 0) return;

  const noteSuffix = input.checkNote ? ` Ghi chú: ${input.checkNote}` : '';
  const message = `Báo cáo thu-chi ngày ${input.date} của ${input.branchName} ` +
    `đã được ${input.checkedByName} kiểm tra.${noteSuffix}`;

  await sendNotificationEvent({
    type: 'daily_cashflow_checked',
    module: 'finance',
    entityId: input.reportId,
    entityCode: `${input.branchId}_${input.date}_v${input.reportVersion}`,
    title: 'Báo cáo thu-chi đã được kiểm tra',
    message,
    linkUrl: `/chi-phi-co-so?date=${encodeURIComponent(input.date)}&branchId=${encodeURIComponent(input.branchId)}`,
    recipients,
    priority: 'low',  // informational
    channels: { inApp: true, push: true, email: true },
    pushTag: `finance-cashflow-${input.reportId}`,
    pushData: {
      kind: 'daily_cashflow_checked',
      reportId: input.reportId,
      branchId: input.branchId,
      date: input.date,
    },
  });
}

// ── Event 3: RETURNED (action_required) ──────────────────────────────────

export interface NotifyReturnedInput {
  reportId: string;
  reportVersion: number;
  date: string;
  branchId: string;
  branchName: string;
  submittedByUid: string | null;
  returnedByName: string;
  returnReason: string;
}

export async function notifyDailyCashflowReturned(input: NotifyReturnedInput): Promise<void> {
  const branchAccountants = await resolveBranchAccountantUids(input.branchId);
  const recipients = Array.from(new Set([
    ...(input.submittedByUid ? [input.submittedByUid] : []),
    ...branchAccountants,
  ].filter(Boolean)));

  if (recipients.length === 0) return;

  const message = `Báo cáo thu-chi ngày ${input.date} của ${input.branchName} ` +
    `bị trả lại để bổ sung. Lý do: ${input.returnReason}`;

  // type='daily_cashflow_returned' đã trong ACTION_REQUIRED_TYPES set
  // → engine tự đặt isActionRequired=true + actionStatus='pending'.
  await sendNotificationEvent({
    type: 'daily_cashflow_returned',
    module: 'finance',
    entityId: input.reportId,
    entityCode: `${input.branchId}_${input.date}_v${input.reportVersion}`,
    title: 'Báo cáo thu-chi bị trả lại',
    message,
    linkUrl: `/chi-phi-co-so?date=${encodeURIComponent(input.date)}&branchId=${encodeURIComponent(input.branchId)}`,
    recipients,
    priority: 'high',  // cần xử lý gấp
    channels: { inApp: true, push: true, email: true },
    pushTag: `finance-cashflow-${input.reportId}`,
    pushData: {
      kind: 'daily_cashflow_returned',
      reportId: input.reportId,
      branchId: input.branchId,
      date: input.date,
    },
  });
}
