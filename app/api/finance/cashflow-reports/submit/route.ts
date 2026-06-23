// PR-CASH1B (2026-06-23) — Submit báo cáo thu-chi ngày (atomic action).
//
// POST /api/finance/cashflow-reports/submit  body: { date, branchId, reason? }
//
// Atomic:
//   1. Validate role + branch (NV_KE branch mình)
//   2. fetchDailyRevenueSummary (REUSE daily-summary source)
//   3. Query branchDailyExpenses status='recorded' trong (date, branchId)
//   4. aggregate + compute net + compute alerts
//   5. Upsert dailyCashflowReports/{branchId_date}:
//      - First submit → reportVersion=1, status='sent' (atomic submit+sent)
//      - Resubmit → push current snapshot vào revisions[], increment reportVersion
//   6. Resolve sentTo recipients (snapshot lúc submit)
//   7. Audit: submit + generate + send (3 actions)
//
// PR đầu KHÔNG có FCM/email — chỉ ghi sentTo + audit (PR-CASH1E sẽ wire notification).

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { isBranchId, BRANCH_BY_ID } from '@/lib/branches';
import {
  canSubmitDailyCashflowReport,
  getReportRecipients,
} from '@/lib/finance/cashflow-report-permissions';
import {
  fetchDailyRevenueSummary,
} from '@/lib/finance/daily-revenue-summary-fetcher';
import {
  aggregateExpenses,
  computeNet,
  computeAlerts,
} from '@/lib/finance/cashflow-compute';
import {
  buildCashflowReportId,
  type DailyCashflowReportDoc,
  type RevenueSource,
  type CashflowReportRevision,
} from '@/lib/finance/cashflow-report-types';
import type { BranchDailyExpenseDoc } from '@/lib/finance/expense-types';
// PR-CASH1E (2026-06-23): noti tới recipients sau submit.
import { notifyDailyCashflowSubmitted } from '@/lib/firebase/finance-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    const callerBranchId = caller.profile.facility_id ?? null;

    const body = (await req.json().catch(() => ({}))) as { date?: string; branchId?: string; reason?: string };
    const date = String(body.date ?? '').trim();
    const branchId = String(body.branchId ?? '').trim();

    if (!DATE_RE.test(date)) return NextResponse.json({ error: 'date sai format (YYYY-MM-DD)' }, { status: 400 });
    if (!isBranchId(branchId)) return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });

    if (!canSubmitDailyCashflowReport(role, callerBranchId, branchId)) {
      return NextResponse.json({
        error: 'Chỉ kế toán cơ sở (NV_KE) của cơ sở này được nộp báo cáo',
      }, { status: 403 });
    }

    const db = getFirebaseAdminDb();

    // ─── Check locked ────────────────────────────────────────────────
    const reportId = buildCashflowReportId(branchId as any, date);
    const reportRef = db.collection(COLLECTIONS.DAILY_CASHFLOW_REPORTS).doc(reportId);
    const existingDoc = await reportRef.get();
    const existing = existingDoc.exists ? (existingDoc.data() as DailyCashflowReportDoc) : null;

    if (existing && existing.status === 'locked') {
      return NextResponse.json({ error: 'Báo cáo ngày này đã được khóa, không thể nộp lại' }, { status: 403 });
    }

    // ─── 1. Fetch daily revenue summary ──────────────────────────────
    const revenueResult = await fetchDailyRevenueSummary(date, branchId as any);
    if (!revenueResult.ok) {
      return NextResponse.json({ error: `Không lấy được tổng hợp doanh thu: ${revenueResult.error}` }, { status: 500 });
    }
    const summary = revenueResult.summary;

    const revenueSource: RevenueSource = {
      sourceType: 'daily_revenue_reconciliation_summary',
      sourceDate: summary.date,
      sourceBranchId: summary.branchId,
      totalByMethod: summary.totalByMethod,
      total: summary.total,
      fetchedAt: summary.fetchedAt,
    };

    // ─── 2. Fetch expenses ────────────────────────────────────────────
    const expenseSnap = await db.collection(COLLECTIONS.BRANCH_DAILY_EXPENSES)
      .where('branchId', '==', branchId)
      .where('date', '==', date)
      .get();
    const expenseDocs: BranchDailyExpenseDoc[] = [];
    const expenseIds: string[] = [];
    for (const d of expenseSnap.docs) {
      expenseDocs.push(d.data() as BranchDailyExpenseDoc);
      expenseIds.push(d.id);
    }
    const expense = aggregateExpenses(expenseDocs, expenseIds);

    // ─── 3. Compute net ──────────────────────────────────────────────
    const net = computeNet(revenueSource, expense);

    // ─── 4. Compute alerts ────────────────────────────────────────────
    // Check voucher duplicate flag (sample: across recorded items)
    let voucherDuplicateExists = false;
    const seenVouchers = new Set<string>();
    for (const e of expenseDocs) {
      if (e.status !== 'recorded') continue;
      const key = `${e.month}::${e.voucherNo}`;
      if (seenVouchers.has(key)) {
        voucherDuplicateExists = true;
        break;
      }
      seenVouchers.add(key);
    }

    const alerts = computeAlerts(revenueSource, expense, net, {
      revenueIncomplete: {
        receptionMissing: summary.incompleteFlags.receptionMissing,
        receptionDraft: summary.incompleteFlags.receptionDraft,
        salesBatchPending: summary.incompleteFlags.salesBatchPending,
      },
      voucherDuplicateExists,
    });

    // ─── 5. Resolve recipients ────────────────────────────────────────
    const sentTo = await getReportRecipients(db, branchId);

    // ─── 6. Build doc / handle versioning ─────────────────────────────
    const now = Timestamp.now();
    const branchName = BRANCH_BY_ID[branchId as keyof typeof BRANCH_BY_ID]?.name ?? branchId;
    const month = date.slice(0, 7);

    let reportVersion = 1;
    let revisions: CashflowReportRevision[] = [];

    if (existing) {
      // Resubmit — increment version + push current snapshot vào revisions
      reportVersion = (existing.reportVersion ?? 1) + 1;
      revisions = Array.isArray(existing.revisions) ? [...existing.revisions] : [];
      revisions.push({
        reportVersion: existing.reportVersion ?? 1,
        revenueSource: existing.revenueSource,
        expense: existing.expense,
        net: existing.net,
        submittedBy: existing.submittedBy,
        submittedByName: existing.submittedByName,
        submittedAt: existing.submittedAt,
        reason: body.reason ? String(body.reason).slice(0, 500) : null,
      });
    }

    const doc: DailyCashflowReportDoc = {
      id: reportId,
      date,
      month,
      branchId: branchId as any,
      branchName,

      status: 'sent',   // submit + send atomic (chốt #7: chưa FCM, chỉ sentTo + audit)

      revenueSource,
      expense: {
        totalByMethod: expense.totalByMethod,
        expenseEntryIds: expense.expenseEntryIds,
        count: expense.count,
        returnedCount: expense.returnedCount,
        voidedCount: expense.voidedCount,
      },
      net,

      sourceRefs: {
        revenueSummaryId: null,           // daily-summary chưa persist riêng
        revenueDate: date,
        revenueBranchId: branchId as any,
        expenseEntryIds: expense.expenseEntryIds,
      },

      reportVersion,
      previousReportId: null,
      revisions,

      submittedBy: caller.profile.uid,
      submittedByName: caller.actorName,
      submittedAt: now,

      sentTo,
      sentAt: now,

      checkedBy: null,
      checkedByName: null,
      checkedAt: null,
      checkNote: null,

      returnedBy: null,
      returnedByName: null,
      returnedAt: null,
      returnReason: null,

      lockedBy: null,
      lockedByName: null,
      lockedAt: null,

      generatedBy: caller.profile.uid,
      generatedAt: now,

      alerts,

      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await reportRef.set(doc);

    // ─── 7. Audit (3 actions atomic) ──────────────────────────────────
    void writeAuditLog({
      action: 'submit_daily_cashflow_report', module: 'finance', userId: caller.profile.uid,
      branchId, before: existing ? { status: existing.status, reportVersion: existing.reportVersion } : null,
      after: { status: 'sent', reportVersion, total: net.total },
      actorName: caller.actorName, actorRole: role, source: 'api',
    }).catch(() => {});

    void writeAuditLog({
      action: 'generate_daily_cashflow_report', module: 'finance', userId: caller.profile.uid,
      branchId, before: null,
      after: { reportId, revenue: revenueSource.total, expense: expense.totalByMethod.total, net: net.total },
      actorName: caller.actorName, actorRole: role, source: 'api',
    }).catch(() => {});

    void writeAuditLog({
      action: 'send_daily_cashflow_report', module: 'finance', userId: caller.profile.uid,
      branchId, before: null,
      after: {
        reportId,
        treasurerCount: sentTo.treasurerUserIds.length,
        accountingCount: sentTo.accountingManagerUserIds.length,
        supervisionCount: sentTo.supervisionUserIds.length,
        leadershipCount: sentTo.leadershipUserIds.length,
      },
      actorName: caller.actorName, actorRole: role, source: 'api',
    }).catch(() => {});

    // PR-CASH1E (2026-06-23): noti tới Thủ quỹ/TP_KE/TP_GS/Lãnh đạo (sentTo snapshot).
    // Fire-and-forget — noti fail KHÔNG fail nghiệp vụ submit.
    void notifyDailyCashflowSubmitted({
      reportId,
      reportVersion,
      date,
      branchId,
      branchName: doc.branchName,
      status: 'sent',
      revenueTotal: revenueSource.total,
      expenseTotal: expense.totalByMethod.total,
      netTotal: net.total,
      sentTo,
    }).catch((e) => console.warn('[finance/submit] daily_cashflow_submitted notification failed:', e?.message));

    return NextResponse.json({
      ok: true,
      reportId,
      reportVersion,
      status: 'sent',
      summary: {
        revenue: revenueSource.totalByMethod,
        expense: expense.totalByMethod,
        net,
        alerts: alerts.length,
        sentToCount: sentTo.treasurerUserIds.length + sentTo.accountingManagerUserIds.length
                   + sentTo.supervisionUserIds.length + sentTo.leadershipUserIds.length,
      },
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[finance/cashflow-reports/submit] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
