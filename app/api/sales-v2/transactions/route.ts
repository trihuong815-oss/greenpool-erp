// GET  /api/sales-v2/transactions?batchId=X  — list transactions của batch
// POST /api/sales-v2/transactions  body: { batchId, ...SalesTransactionInput }
//   - Sale only, batch ở status draft/returned
//   - Validate package + auto-derive packageCode/Name/serviceGroup/isChildPackage
//   - Compute debtAmount
//   - Validate guardianName bắt buộc nếu isChildPackage
// Phase 1 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canReadBatch, canEditTransaction } from '@/lib/sales-v2/scope';
import { serializeTransaction } from '@/lib/sales-v2/serialize';
import { getPackageById } from '@/lib/sales-v2/packages';
import type { SalesV2Source, TransactionType, PaymentMethod, MatchStatus } from '@/lib/types/sales-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_SOURCES = new Set<SalesV2Source>(['ca_nhan', 'walkin', 'mkt', 'renew', 'ref']);
const VALID_TXN_TYPES = new Set<TransactionType>(['dat_coc', 'thanh_toan_full', 'thanh_toan_not']);
const VALID_PAY = new Set<PaymentMethod>(['tien_mat', 'chuyen_khoan', 'pos']);

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const batchId = req.nextUrl.searchParams.get('batchId');
    if (!batchId) return NextResponse.json({ error: 'Thiếu batchId' }, { status: 400 });

    const db = getFirebaseAdminDb();
    // Read batch để check authorization
    const batchDoc = await db.collection(COLLECTIONS.SALES_DAILY_BATCHES).doc(batchId).get();
    if (!batchDoc.exists) return NextResponse.json({ error: 'Không tìm thấy batch' }, { status: 404 });
    const batch = batchDoc.data() ?? {};
    if (!canReadBatch(caller, { saleId: batch.saleId, branchId: batch.branchId })) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    // Single-field where → Firestore auto-index. Sort client-side để tránh composite index.
    const txSnap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
      .where('batchId', '==', batchId)
      .get();
    const transactions = txSnap.docs
      .map((d) => serializeTransaction(d.id, d.data()))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return NextResponse.json({ ok: true, transactions });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/transactions] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
    }
    const batchId = String(body.batchId ?? '');
    if (!batchId) return NextResponse.json({ error: 'Thiếu batchId' }, { status: 400 });

    // Validate fields
    const customerName = String(body.customerName ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const guardianName = body.guardianName ? String(body.guardianName).trim() : null;
    const source = body.source as SalesV2Source;
    const packageId = String(body.packageId ?? '');
    const transactionType = body.transactionType as TransactionType;
    const paymentMethod = body.paymentMethod as PaymentMethod;
    const packageValue = Number(body.packageValue ?? 0);
    const collectedToday = Number(body.collectedToday ?? 0);
    const receiptNo = body.receiptNo ? String(body.receiptNo).trim().slice(0, 50) : null;
    const contractNo = body.contractNo ? String(body.contractNo).trim().slice(0, 50) : null;
    const note = body.note ? String(body.note).slice(0, 500) : null;

    if (!customerName) return NextResponse.json({ error: 'Thiếu tên khách hàng' }, { status: 400 });
    if (!phone) return NextResponse.json({ error: 'Thiếu SĐT' }, { status: 400 });
    if (!/^0\d{9}$/.test(phone)) return NextResponse.json({ error: 'SĐT phải 10 số bắt đầu bằng 0' }, { status: 400 });
    if (!VALID_SOURCES.has(source)) return NextResponse.json({ error: 'Sai nguồn khách' }, { status: 400 });
    if (!packageId) return NextResponse.json({ error: 'Thiếu gói' }, { status: 400 });
    if (!VALID_TXN_TYPES.has(transactionType)) return NextResponse.json({ error: 'Sai loại giao dịch' }, { status: 400 });
    if (!VALID_PAY.has(paymentMethod)) return NextResponse.json({ error: 'Sai hình thức thu' }, { status: 400 });
    if (!Number.isFinite(packageValue) || packageValue < 0) return NextResponse.json({ error: 'Giá trị gói không hợp lệ' }, { status: 400 });
    if (!Number.isFinite(collectedToday) || collectedToday < 0) return NextResponse.json({ error: 'Thu hôm nay không hợp lệ' }, { status: 400 });
    if (collectedToday > packageValue && transactionType !== 'thanh_toan_not') {
      return NextResponse.json({ error: 'Thu hôm nay không thể lớn hơn giá trị gói' }, { status: 400 });
    }
    // V6 2026-06-17: validate chứng từ theo transactionType
    if (transactionType === 'dat_coc' && !receiptNo) {
      return NextResponse.json({ error: 'Đặt cọc bắt buộc nhập Số phiếu thu' }, { status: 400 });
    }
    if ((transactionType === 'thanh_toan_full' || transactionType === 'thanh_toan_not') && !contractNo) {
      return NextResponse.json({ error: 'Thanh toán (full/nốt) bắt buộc nhập Số hợp đồng' }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const batchRef = db.collection(COLLECTIONS.SALES_DAILY_BATCHES).doc(batchId);
    const batchDoc = await batchRef.get();
    if (!batchDoc.exists) return NextResponse.json({ error: 'Không tìm thấy batch' }, { status: 404 });
    const batch = batchDoc.data() ?? {};
    if (!canEditTransaction(caller, { saleId: batch.saleId, branchId: batch.branchId, status: batch.status })) {
      return NextResponse.json({ error: 'Không có quyền thêm giao dịch vào batch này' }, { status: 403 });
    }

    // Resolve package info
    const pkg = await getPackageById(packageId);
    if (!pkg) return NextResponse.json({ error: 'Gói không tồn tại hoặc đã ngừng' }, { status: 400 });

    if (pkg.isChildPackage && !guardianName) {
      return NextResponse.json({ error: 'Gói trẻ em bắt buộc Người giám hộ' }, { status: 400 });
    }

    // 2026-06-17: tx 'thanh_toan_not' = trả nốt công nợ cũ → KHÔNG tạo doanh số mới
    // → packageValue effective = 0 (không cộng vào doanh số batch), debt = 0.
    // Số tiền nốt chỉ ghi nhận ở collectedToday + sẽ link với tx cũ qua auto-match.
    const isThanhToanNot = transactionType === 'thanh_toan_not';
    const effectivePackageValue = isThanhToanNot ? 0 : packageValue;
    const debtAmount = isThanhToanNot ? 0 : Math.max(0, effectivePackageValue - collectedToday);
    const now = Timestamp.now();
    const matchStatus: MatchStatus = isThanhToanNot ? 'pending' : 'not_applicable';

    const ref = db.collection(COLLECTIONS.SALES_TRANSACTIONS).doc();
    const data = {
      batchId,
      date: batch.date,
      month: batch.month,
      branchId: batch.branchId,
      branchName: batch.branchName,
      saleId: batch.saleId,
      saleName: batch.saleName,
      customerName,
      phone,
      guardianName,
      source,
      packageId: pkg.id,
      packageCode: pkg.code,
      packageName: pkg.name,
      serviceGroup: pkg.serviceGroup,
      isChildPackage: pkg.isChildPackage,
      transactionType,
      paymentMethod,
      packageValue: effectivePackageValue,
      collectedToday,
      debtAmount,
      // BUG-1 audit fix: snapshot debt cho 'dat_coc' (không đổi khi auto-match link)
      originalDebt: transactionType === 'dat_coc' ? debtAmount : 0,
      receiptNo,
      contractNo,
      note,
      reviewStatus: 'pending',
      rejectReason: null,
      reviewedAt: null,
      reviewedBy: null,
      matchedTransactionId: null,
      matchStatus,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);

    return NextResponse.json({ ok: true, transaction: serializeTransaction(ref.id, data) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/transactions] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
