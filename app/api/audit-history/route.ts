// GET /api/audit-history?month=YYYY-MM&branchId=X&source=all|salesAuditLogs|auditLogs&cursor=<millis>&pageSize=50
//
// PR-7A (2026-06-22): scope hẹp — chỉ salesAuditLogs.
// PR-7B (2026-06-23): UNION 2 collection — salesAuditLogs + auditLogs (module='sales').
//   source=all (default) → query cả 2, merge in-memory sort DESC theo occurredAtMs.
//   source=salesAuditLogs / source=auditLogs → query 1 collection (backward compat + debug).
//
// Permission: 7 role (ADMIN/CEO/CHU_TICH/GD_KD/GD_VP/TP_KE/TP_GS).
// Pagination: cursor = millis nhỏ nhất trong page hiện tại. Trang sau query
//   2 collection với startAfter(Timestamp.fromMillis(cursor)) DESC.
//   Safe: no duplicate, no skip. Trade-off: pageSize thực tế có thể < pageSize
//   nếu 1 source hết hoặc filter làm rỗng.
// Ordering: occurredAtMs DESC, tie-break source ('auditLogs' < 'salesAuditLogs')
//   rồi docId ASC (helper mergeAuditEntries).
//
// Filter strategy (chốt 2026-06-23):
//   - month + branchId: server-side. Docs salesAuditLogs LEGACY (writeSalesAudit)
//     thiếu month/branchId → silent skip khi filter strict. UI banner cảnh báo.
//   - auditLogs generic không có month field → filter month CHỈ áp dụng cho
//     salesAuditLogs. Source 'all' với filter month: auditLogs subset trả empty.
//
// Friendly error nếu thiếu Firestore index:
//   "Audit index chưa sẵn sàng hoặc chưa được deploy. Vui lòng deploy Firestore indexes rồi thử lại."

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canReadAuditHistory } from '@/lib/audit-history/can-read';
import { parseAuditHistoryQuery, type AuditSourceFilter } from '@/lib/audit-history/query-params';
import {
  normalizeSalesAuditLog, normalizeGenericAuditLog, mergeAuditEntries,
} from '@/lib/audit-history/normalize';
import type { AuditHistoryEntry, AuditHistoryResponse } from '@/lib/audit-history/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** True nếu error message từ Firestore là missing-index. */
function isMissingIndexError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /index|FAILED_PRECONDITION|requires an index/i.test(m);
}

/** Query salesAuditLogs theo filter + cursor. Trả array AuditHistoryEntry đã normalize.
 *  Throw nếu Firestore lỗi (caller catch để build friendly error). */
async function querySalesAuditLogs(
  db: FirebaseFirestore.Firestore,
  params: { month: string | null; branchId: string | null; cursorMs: number | null; pageSize: number },
): Promise<AuditHistoryEntry[]> {
  let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.SALES_AUDIT_LOGS);
  if (params.month && params.branchId) {
    q = q.where('branchId', '==', params.branchId).where('month', '==', params.month);
  } else if (params.month) {
    q = q.where('month', '==', params.month);
  } else if (params.branchId) {
    q = q.where('branchId', '==', params.branchId);
  }
  q = q.orderBy('changedAt', 'desc');
  if (params.cursorMs !== null) {
    q = q.startAfter(Timestamp.fromMillis(params.cursorMs));
  }
  q = q.limit(params.pageSize);
  const snap = await q.get();
  return snap.docs.map((d) => normalizeSalesAuditLog(d.id, d.data()));
}

/** Query auditLogs generic (module='sales') theo filter + cursor.
 *  Note: auditLogs KHÔNG có field `month` → filter month=non-null trả empty cho source này. */
async function queryGenericAuditLogs(
  db: FirebaseFirestore.Firestore,
  params: { month: string | null; branchId: string | null; cursorMs: number | null; pageSize: number },
): Promise<AuditHistoryEntry[]> {
  // PR-7B: auditLogs không có month → nếu user filter month, source này trả empty
  // (semantic đúng: không có dữ liệu month-specific trong generic logs).
  if (params.month) return [];

  let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.AUDIT_LOGS)
    .where('module', '==', 'sales');
  if (params.branchId) {
    q = q.where('branchId', '==', params.branchId);
  }
  q = q.orderBy('createdAt', 'desc');
  if (params.cursorMs !== null) {
    q = q.startAfter(new Date(params.cursorMs));
  }
  q = q.limit(params.pageSize);
  const snap = await q.get();
  return snap.docs.map((d) => normalizeGenericAuditLog(d.id, d.data()));
}

export async function GET(req: NextRequest) {
  // ─── Auth ──────────────────────────────────────────────────────────────
  let caller;
  try {
    caller = await getAuthedCaller();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw err;
  }

  // ─── Permission ────────────────────────────────────────────────────────
  if (!canReadAuditHistory(caller.profile.role_code)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // ─── Parse query ───────────────────────────────────────────────────────
  let query;
  try {
    query = parseAuditHistoryQuery(req.nextUrl.searchParams);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid query' },
      { status: 400 },
    );
  }

  const cursorMs = query.cursor ? Number(query.cursor) : null;
  const db = getFirebaseAdminDb();
  // Mỗi source query pageSize riêng → đảm bảo merge có đủ dữ liệu cho page.
  const perSourceSize = query.pageSize;

  // ─── Fetch theo source ─────────────────────────────────────────────────
  const warnings: string[] = [];
  const tasks: Array<Promise<AuditHistoryEntry[]>> = [];
  const taskLabels: AuditSourceFilter[] = [];

  if (query.source === 'all' || query.source === 'salesAuditLogs') {
    tasks.push(querySalesAuditLogs(db, {
      month: query.month, branchId: query.branchId, cursorMs, pageSize: perSourceSize,
    }));
    taskLabels.push('salesAuditLogs');
  }
  if (query.source === 'all' || query.source === 'auditLogs') {
    tasks.push(queryGenericAuditLogs(db, {
      month: query.month, branchId: query.branchId, cursorMs, pageSize: perSourceSize,
    }));
    taskLabels.push('auditLogs');
  }

  // Promise.allSettled — 1 source fail không phá toàn bộ
  const results = await Promise.allSettled(tasks);
  const batches: AuditHistoryEntry[][] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const src = taskLabels[i];
    if (r.status === 'fulfilled') {
      batches.push(r.value);
    } else {
      const err = r.reason;
      console.error('[audit-history] query failed:', { source: src, err: err instanceof Error ? err.message : String(err) });
      if (isMissingIndexError(err)) {
        warnings.push(
          `Audit index chưa sẵn sàng hoặc chưa được deploy cho nguồn "${src}". Vui lòng deploy Firestore indexes rồi thử lại.`,
        );
      } else {
        warnings.push(`Lỗi truy vấn nguồn "${src}": ${err instanceof Error ? err.message : 'unknown'}`);
      }
      batches.push([]);
    }
  }

  // ─── Merge + slice ─────────────────────────────────────────────────────
  const merged = mergeAuditEntries(...batches);
  // Slice tối đa pageSize sau merge
  const pageItems = merged.slice(0, query.pageSize);

  // nextCursor = millis nhỏ nhất trong page hiện tại (nếu có item)
  // Trang sau query both collection startAfter(cursor) → safe no dup
  // Trả null nếu cả 2 source đều trả < perSourceSize → hết dữ liệu
  const allSourcesExhausted = batches.every((b) => b.length < perSourceSize);
  const nextCursor = (pageItems.length > 0 && !allSourcesExhausted)
    ? String(pageItems[pageItems.length - 1].occurredAtMs)
    : null;

  const response: AuditHistoryResponse = {
    items: pageItems,
    nextCursor,
    count: pageItems.length,
    ...(warnings.length > 0 ? { warnings } : {}),
  };

  return NextResponse.json(response);
}
