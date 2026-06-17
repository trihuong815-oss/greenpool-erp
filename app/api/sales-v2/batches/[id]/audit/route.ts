// GET /api/sales-v2/batches/[id]/audit — lịch sử audit log của batch.
// Authorization: chỉ caller có quyền đọc batch (canReadBatch).
// 2026-06-17 — audit polish commit B.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canReadBatch } from '@/lib/sales-v2/scope';
import { Timestamp } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LOGS = 200;

interface AuditEntryOut {
  id: string;
  batchId: string;
  transactionId: string | null;
  action: string;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  changedByName: string;
  changedAt: string;
  reason: string | null;
}

function tsToIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date().toISOString();
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();

    // Validate caller có quyền đọc batch
    const batchDoc = await db.collection(COLLECTIONS.SALES_DAILY_BATCHES).doc(id).get();
    if (!batchDoc.exists) return NextResponse.json({ error: 'Không tìm thấy batch' }, { status: 404 });
    const batch = batchDoc.data() ?? {};
    if (!canReadBatch(caller, { saleId: batch.saleId, branchId: batch.branchId })) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    // Fetch audit logs (single where → không cần composite index, sort client-side)
    const snap = await db.collection(COLLECTIONS.SALES_AUDIT_LOGS)
      .where('batchId', '==', id)
      .limit(MAX_LOGS)
      .get();
    const logs: AuditEntryOut[] = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        batchId: String(x.batchId ?? ''),
        transactionId: x.transactionId ?? null,
        action: String(x.action ?? ''),
        field: x.field ?? null,
        oldValue: x.oldValue ?? null,
        newValue: x.newValue ?? null,
        changedBy: String(x.changedBy ?? ''),
        changedByName: String(x.changedByName ?? ''),
        changedAt: tsToIso(x.changedAt),
        reason: x.reason ?? null,
      };
    }).sort((a, b) => b.changedAt.localeCompare(a.changedAt)); // mới nhất trước

    return NextResponse.json({ ok: true, logs });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/batches/[id]/audit] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
