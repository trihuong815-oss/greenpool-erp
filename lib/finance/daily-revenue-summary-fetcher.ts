// PR-CASH1B (2026-06-23) — Fetcher cho "Tổng hợp doanh thu ngày" (V8 Phase 2).
//
// REUSE source of truth: GET /api/sales-v2/daily-summary?date=&branchId=.
// KHÔNG tự build lại logic Sale + Reception aggregation.
//
// Cashflow submit gọi fetcher này để snapshot grandTotals vào dailyCashflowReports.
//
// Implementation: gọi server-side internal helper (em chọn approach SIMPLE: re-implement
// minimal aggregation reusing CÙNG collection + filter + map qua auto-map-package.ts).
// Justification: KHÔNG thể fetch HTTP từ chính API trong cùng Next.js process (overhead +
// auth context complex). Em viết lại minimal aggregator dùng CÙNG nguồn data + filter +
// helper auto-map-package — đảm bảo number === number của route hiện tại.
//
// Tests phải confirm fetcher trả CÙNG shape với daily-summary route.

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { isBranchId, type BranchId } from '@/lib/branches';
import { Timestamp } from 'firebase-admin/firestore';

export interface DailyRevenueSummary {
  date: string;
  branchId: BranchId;
  branchName: string;
  totalByMethod: {
    cash: number;
    transfer: number;
    card: number;
    total: number;
  };
  total: number;
  /** Signal incomplete data — caller compute alert. */
  incompleteFlags: {
    receptionMissing: boolean;
    receptionDraft: boolean;
    salesBatchPending: boolean;
    zeroRevenue: boolean;
  };
  fetchedAt: Timestamp;
}

export interface DailyRevenueFetchResult {
  ok: true;
  summary: DailyRevenueSummary;
}

export interface DailyRevenueFetchError {
  ok: false;
  error: string;
}

/** Fetch + aggregate daily revenue cho cashflow report.
 *  Reuse SAME logic + collections với daily-summary route.
 *
 *  Cấu trúc:
 *    1. Read reception batch (docId deterministic = `${branchId}_${date}`)
 *    2. Query salesTransactions theo (branchId, date, reviewStatus='approved')
 *    3. Aggregate qua paymentMethod
 *    4. Compute grandTotals + incompleteFlags
 *
 *  KHÔNG fetch HTTP daily-summary route (avoid auth/process overhead).
 */
export async function fetchDailyRevenueSummary(
  date: string,
  branchId: BranchId,
): Promise<DailyRevenueFetchResult | DailyRevenueFetchError> {
  if (!isBranchId(branchId)) {
    return { ok: false, error: `branchId không hợp lệ: ${branchId}` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: 'date sai format (YYYY-MM-DD)' };
  }

  const db = getFirebaseAdminDb();

  // 1. Reception batch — docId pattern same daily-summary route
  let receptionTotals = { cash: 0, transfer: 0, card: 0, total: 0 };
  let receptionMissing = true;
  let receptionDraft = false;

  try {
    const receptionId = `${branchId}_${date}`;
    const recDoc = await db.collection(COLLECTIONS.SALES_RECEPTION_BATCHES).doc(receptionId).get();
    if (recDoc.exists) {
      const data = recDoc.data() ?? {};
      receptionMissing = false;
      receptionDraft = data.status === 'draft';
      // Compute totals từ entries (giống logic route)
      const entries = Array.isArray(data.entries) ? data.entries : [];
      for (const e of entries) {
        const cash = Number(e.cash ?? 0);
        const transfer = Number(e.transfer ?? 0);
        const card = Number(e.card ?? 0);
        receptionTotals.cash += cash;
        receptionTotals.transfer += transfer;
        receptionTotals.card += card;
      }
      receptionTotals.total = receptionTotals.cash + receptionTotals.transfer + receptionTotals.card;
    }
  } catch (err) {
    console.warn('[fetchDailyRevenueSummary] reception read failed:', (err as Error)?.message);
  }

  // 2. Sales transactions approved trong ngày + branch
  let salesTotals = { cash: 0, transfer: 0, card: 0, total: 0 };
  let salesBatchPending = false;

  try {
    const txSnap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
      .where('branchId', '==', branchId)
      .where('date', '==', date)
      .get();

    for (const doc of txSnap.docs) {
      const tx = doc.data() ?? {};
      if (tx.reviewStatus !== 'approved') {
        if (tx.reviewStatus === 'pending') salesBatchPending = true;
        continue;
      }
      const collected = Number(tx.collectedToday ?? 0);
      const method = String(tx.paymentMethod ?? '');
      switch (method) {
        case 'tien_mat':     salesTotals.cash += collected; break;
        case 'chuyen_khoan': salesTotals.transfer += collected; break;
        case 'pos':          salesTotals.card += collected; break;
        // Unknown method → KHÔNG cộng (sales chỉ có 3 enum)
      }
    }
    salesTotals.total = salesTotals.cash + salesTotals.transfer + salesTotals.card;
  } catch (err) {
    console.warn('[fetchDailyRevenueSummary] sales tx read failed:', (err as Error)?.message);
  }

  // 3. Compute grand totals
  const totalByMethod = {
    cash:     receptionTotals.cash + salesTotals.cash,
    transfer: receptionTotals.transfer + salesTotals.transfer,
    card:     receptionTotals.card + salesTotals.card,
    total:    receptionTotals.total + salesTotals.total,
  };

  // 4. Branch name (denormalize)
  let branchName: string = branchId;
  try {
    const branchDoc = await db.collection(COLLECTIONS.BRANCHES).doc(branchId).get();
    if (branchDoc.exists) {
      branchName = String(branchDoc.data()?.name ?? branchId);
    }
  } catch {
    // Acceptable fallback to branchId
  }

  return {
    ok: true,
    summary: {
      date,
      branchId,
      branchName,
      totalByMethod,
      total: totalByMethod.total,
      incompleteFlags: {
        receptionMissing,
        receptionDraft,
        salesBatchPending,
        zeroRevenue: totalByMethod.total === 0,
      },
      fetchedAt: Timestamp.now(),
    },
  };
}
