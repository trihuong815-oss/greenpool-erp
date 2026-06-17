// POST /api/sales-v2/batches/by-date  body { date: 'YYYY-MM-DD' }
//   Get-or-create batch của Sale cho 1 ngày cụ thể.
//   Cho phép Sale nhập doanh số ngày hôm qua/trước đó (vd sáng hôm sau mới đến nhập).
//   Validate:
//     - date không trong tương lai (so với hôm nay VN)
//     - date không quá xa quá khứ (tối đa MAX_PAST_DAYS = 7 ngày)
//   Doc id deterministic = ${saleId}_${date} → idempotent.
//
// 2026-06-17 — Phase 1 extension theo feedback user.

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { resolveSaleContext } from '@/lib/sales-v2/scope';
import { serializeBatch, todayInVN, monthFromDate } from '@/lib/sales-v2/serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PAST_DAYS = 7; // Sale chỉ nhập trong vòng 7 ngày gần đây

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const ctx = await resolveSaleContext(caller);
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: 403 });

    const body = await req.json().catch(() => null);
    const date = String(body?.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Sai định dạng ngày (cần YYYY-MM-DD)' }, { status: 400 });
    }

    // Validate range
    const today = todayInVN();
    if (date > today) {
      return NextResponse.json({ error: 'Không nhập được ngày trong tương lai' }, { status: 400 });
    }
    const dt = new Date(`${date}T12:00:00+07:00`).getTime();
    const todayT = new Date(`${today}T12:00:00+07:00`).getTime();
    const diffDays = Math.round((todayT - dt) / (24 * 3600 * 1000));
    if (diffDays > MAX_PAST_DAYS) {
      return NextResponse.json({
        error: `Chỉ nhập được trong vòng ${MAX_PAST_DAYS} ngày gần đây. Liên hệ kế toán nếu cần nhập ngày cũ hơn.`,
      }, { status: 400 });
    }

    const month = monthFromDate(date);
    const db = getFirebaseAdminDb();
    const col = db.collection(COLLECTIONS.SALES_DAILY_BATCHES);
    const docId = `${ctx.saleId}_${date}`;
    const ref = col.doc(docId);
    const existing = await ref.get();
    if (existing.exists) {
      return NextResponse.json({ ok: true, batch: serializeBatch(existing.id, existing.data() ?? {}), created: false });
    }

    const now = Timestamp.now();
    const data = {
      date,
      month,
      branchId: ctx.branchId,
      branchName: ctx.branchName,
      saleId: ctx.saleId,
      saleName: ctx.saleName,
      status: 'draft' as const,
      totalTransactions: 0,
      totalSalesAmount: 0,
      totalCollectedAmount: 0,
      totalDebtAmount: 0,
      submittedAt: null,
      submittedBy: null,
      reviewedAt: null,
      reviewedBy: null,
      returnedAt: null,
      returnReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);
    return NextResponse.json({ ok: true, batch: serializeBatch(ref.id, data), created: true });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/batches/by-date] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
