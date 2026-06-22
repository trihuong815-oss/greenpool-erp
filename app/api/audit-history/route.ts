// GET /api/audit-history?month=YYYY-MM&branchId=X&cursor=<millis>&pageSize=50
//
// PR-7A (2026-06-22) — Read-only list audit log Sales V2.
// Scope: chỉ collection salesAuditLogs (Option A đã chốt). auditLogs generic defer PR-7B.
// Permission: 7 role (ADMIN/CEO/CHU_TICH/GD_KD/GD_VP/TP_KE/TP_GS).
// Pagination: cursor-based (changedAt millis). pageSize 50, max 100.
// Ordering: changedAt DESC (mới nhất trước).
//
// Server-side filter (dùng Firestore index):
//   - month + branchId   → reuse index branchId+month+changedAt (M2.1 PR-1)
//   - month only         → cần composite mới (month+changedAt DESC) — PR-7A thêm
//   - branchId only      → cần composite mới (branchId+changedAt DESC) — PR-7A thêm
//   - none               → orderBy changedAt DESC standalone (Firestore default single-field DESC)
//
// Client-side filter (defer PR-7B nếu cần index):
//   - action, module, changedBy, dateRange → UI filter trên page hiện tại (sau khi server trả ≤100).
//   - Trade-off ghi rõ trong UI tooltip.

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canReadAuditHistory } from '@/lib/audit-history/can-read';
import { parseAuditHistoryQuery } from '@/lib/audit-history/query-params';
import type { AuditHistoryEntry, AuditHistoryResponse } from '@/lib/audit-history/types';
import type { SalesAuditLogDoc } from '@/lib/types/sales-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  // ─── Build Firestore query ─────────────────────────────────────────────
  const db = getFirebaseAdminDb();
  let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.SALES_AUDIT_LOGS);

  if (query.month && query.branchId) {
    // Index có sẵn: branchId + month + changedAt DESC
    q = q.where('branchId', '==', query.branchId).where('month', '==', query.month);
  } else if (query.month) {
    // Index PR-7A mới: month + changedAt DESC
    q = q.where('month', '==', query.month);
  } else if (query.branchId) {
    // Index PR-7A mới: branchId + changedAt DESC
    q = q.where('branchId', '==', query.branchId);
  }
  // else: không filter equality → orderBy changedAt DESC standalone (Firestore default)

  q = q.orderBy('changedAt', 'desc');

  // Cursor pagination: startAfter timestamp (parse cursor as millis)
  if (query.cursor) {
    const cursorMs = Number(query.cursor);
    q = q.startAfter(Timestamp.fromMillis(cursorMs));
  }

  // Limit + 1 để biết còn page tiếp không
  q = q.limit(query.pageSize + 1);

  // ─── Execute ───────────────────────────────────────────────────────────
  let snap;
  try {
    snap = await q.get();
  } catch (err) {
    console.error('[audit-history] firestore query failed:', {
      err: err instanceof Error ? err.message : String(err),
      query,
    });
    return NextResponse.json(
      { error: 'Lỗi truy vấn audit log. Có thể thiếu Firestore index.' },
      { status: 500 },
    );
  }

  const docs = snap.docs;
  const hasMore = docs.length > query.pageSize;
  const pageDocs = hasMore ? docs.slice(0, query.pageSize) : docs;

  // ─── Map → response ────────────────────────────────────────────────────
  const items: AuditHistoryEntry[] = pageDocs.map((d) => {
    const data = d.data() as SalesAuditLogDoc;
    const changedAt = data.changedAt;
    const ms = changedAt && typeof changedAt.toMillis === 'function' ? changedAt.toMillis() : 0;
    return {
      id: d.id,
      changedAtMs: ms,
      changedBy: data.changedBy ?? '',
      changedByName: data.changedByName ?? '',
      changedByRole: data.changedByRole ?? '',
      module: String(data.module ?? ''),
      branchId: data.branchId,
      month: data.month ?? '',
      batchId: data.batchId ?? null,
      transactionId: data.transactionId ?? null,
      programId: data.programId ?? null,
      action: String(data.action ?? ''),
      field: data.field ?? null,
      oldValue: data.oldValue ?? null,
      newValue: data.newValue ?? null,
      reason: data.reason ?? null,
      ip: data.ip ?? null,
    };
  });

  const nextCursor = hasMore && pageDocs.length > 0
    ? String(pageDocs[pageDocs.length - 1].data().changedAt.toMillis())
    : null;

  const response: AuditHistoryResponse = {
    items,
    nextCursor,
    count: items.length,
  };

  return NextResponse.json(response);
}
