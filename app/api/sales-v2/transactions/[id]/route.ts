// PATCH  /api/sales-v2/transactions/[id]  body: partial fields cho phép update
// DELETE /api/sales-v2/transactions/[id]
//   - Sale: chỉ batch draft/returned của mình
//   - Kế toán Phase 2 sẽ extend cho 'sửa & duyệt'
// Phase 1 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canEditTransaction } from '@/lib/sales-v2/scope';
import { serializeTransaction } from '@/lib/sales-v2/serialize';
import { getPackageById } from '@/lib/sales-v2/packages';
import type { SalesV2Source, TransactionType, PaymentMethod } from '@/lib/types/sales-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_SOURCES = new Set<SalesV2Source>(['ca_nhan', 'walkin', 'mkt', 'renew', 'ref']);
const VALID_TXN_TYPES = new Set<TransactionType>(['dat_coc', 'thanh_toan_full', 'thanh_toan_not']);
const VALID_PAY = new Set<PaymentMethod>(['tien_mat', 'chuyen_khoan', 'pos']);

const EDITABLE_FIELDS = new Set([
  'customerName', 'phone', 'guardianName', 'source', 'packageId',
  'transactionType', 'paymentMethod', 'packageValue', 'collectedToday', 'note',
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const txRef = db.collection(COLLECTIONS.SALES_TRANSACTIONS).doc(id);
    const txDoc = await txRef.get();
    if (!txDoc.exists) return NextResponse.json({ error: 'Không tìm thấy giao dịch' }, { status: 404 });
    const tx = txDoc.data() ?? {};

    // Read batch để check authorization + status
    const batchDoc = await db.collection(COLLECTIONS.SALES_DAILY_BATCHES).doc(tx.batchId).get();
    if (!batchDoc.exists) return NextResponse.json({ error: 'Batch không tồn tại' }, { status: 404 });
    const batch = batchDoc.data() ?? {};
    if (!canEditTransaction(caller, { saleId: batch.saleId, branchId: batch.branchId, status: batch.status })) {
      return NextResponse.json({ error: 'Không có quyền sửa' }, { status: 403 });
    }

    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!EDITABLE_FIELDS.has(k)) continue;
      updates[k] = v;
    }

    // Validate giá trị nếu có
    if ('source' in updates && !VALID_SOURCES.has(updates.source)) {
      return NextResponse.json({ error: 'Sai nguồn khách' }, { status: 400 });
    }
    if ('transactionType' in updates && !VALID_TXN_TYPES.has(updates.transactionType)) {
      return NextResponse.json({ error: 'Sai loại giao dịch' }, { status: 400 });
    }
    if ('paymentMethod' in updates && !VALID_PAY.has(updates.paymentMethod)) {
      return NextResponse.json({ error: 'Sai hình thức thu' }, { status: 400 });
    }
    if ('packageValue' in updates) {
      const v = Number(updates.packageValue);
      if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: 'Giá trị gói không hợp lệ' }, { status: 400 });
      updates.packageValue = v;
    }
    if ('collectedToday' in updates) {
      const v = Number(updates.collectedToday);
      if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: 'Thu hôm nay không hợp lệ' }, { status: 400 });
      updates.collectedToday = v;
    }
    if ('customerName' in updates) updates.customerName = String(updates.customerName ?? '').trim();
    if ('phone' in updates) updates.phone = String(updates.phone ?? '').trim();
    if ('guardianName' in updates) {
      updates.guardianName = updates.guardianName ? String(updates.guardianName).trim() : null;
    }
    if ('note' in updates) {
      updates.note = updates.note ? String(updates.note).slice(0, 500) : null;
    }

    // Nếu đổi packageId → re-resolve package info
    if ('packageId' in updates) {
      const pkg = await getPackageById(String(updates.packageId));
      if (!pkg) return NextResponse.json({ error: 'Gói không tồn tại' }, { status: 400 });
      updates.packageId = pkg.id;
      updates.packageCode = pkg.code;
      updates.packageName = pkg.name;
      updates.serviceGroup = pkg.serviceGroup;
      updates.isChildPackage = pkg.isChildPackage;
    }

    // Recompute debtAmount nếu thay đổi packageValue/collectedToday
    const finalPackageValue = 'packageValue' in updates ? updates.packageValue : Number(tx.packageValue ?? 0);
    const finalCollected = 'collectedToday' in updates ? updates.collectedToday : Number(tx.collectedToday ?? 0);
    updates.debtAmount = Math.max(0, finalPackageValue - finalCollected);

    // Validate guardianName nếu isChildPackage
    const finalIsChild = 'isChildPackage' in updates ? updates.isChildPackage : !!tx.isChildPackage;
    const finalGuardian = 'guardianName' in updates ? updates.guardianName : tx.guardianName;
    if (finalIsChild && !finalGuardian) {
      return NextResponse.json({ error: 'Gói trẻ em bắt buộc Người giám hộ' }, { status: 400 });
    }

    // Validate transactionType=thanh_toan_full → collected >= packageValue (cho phép nốt vượt)
    const finalTxnType = 'transactionType' in updates ? updates.transactionType : tx.transactionType;
    if (finalTxnType === 'thanh_toan_full' && finalCollected < finalPackageValue) {
      return NextResponse.json({ error: 'Thanh toán full phải thu đủ giá trị gói' }, { status: 400 });
    }

    updates.updatedAt = Timestamp.now();
    await txRef.update(updates);

    const newDoc = await txRef.get();
    return NextResponse.json({ ok: true, transaction: serializeTransaction(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/transactions/[id]] PATCH error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const txRef = db.collection(COLLECTIONS.SALES_TRANSACTIONS).doc(id);
    const txDoc = await txRef.get();
    if (!txDoc.exists) return NextResponse.json({ ok: true }); // idempotent

    const tx = txDoc.data() ?? {};
    const batchDoc = await db.collection(COLLECTIONS.SALES_DAILY_BATCHES).doc(tx.batchId).get();
    if (!batchDoc.exists) return NextResponse.json({ error: 'Batch không tồn tại' }, { status: 404 });
    const batch = batchDoc.data() ?? {};
    if (!canEditTransaction(caller, { saleId: batch.saleId, branchId: batch.branchId, status: batch.status })) {
      return NextResponse.json({ error: 'Không có quyền xoá' }, { status: 403 });
    }

    await txRef.delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/transactions/[id]] DELETE error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
