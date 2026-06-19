// PATCH  /api/sales-v2/transactions/[id]  body: partial fields cho phép update
// DELETE /api/sales-v2/transactions/[id]
//   - Sale: chỉ batch draft/returned của mình
//   - Kế toán Phase 2 sẽ extend cho 'sửa & duyệt'
// Phase 1 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canEditTransaction } from '@/lib/sales-v2/scope';
import { serializeTransaction } from '@/lib/sales-v2/serialize';
import { getPackageById } from '@/lib/sales-v2/packages';
import { writeSalesAuditBatch } from '@/lib/sales-v2/audit';
import { computeDiscount, isDiscountType, type PromoSnapshot } from '@/lib/types/sales-program';
import type { SalesV2Source, TransactionType, PaymentMethod } from '@/lib/types/sales-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_SOURCES = new Set<SalesV2Source>(['ca_nhan', 'walkin', 'mkt', 'renew', 'ref']);
const VALID_TXN_TYPES = new Set<TransactionType>(['dat_coc', 'thanh_toan_full', 'thanh_toan_not']);
const VALID_PAY = new Set<PaymentMethod>(['tien_mat', 'chuyen_khoan', 'pos']);

const EDITABLE_FIELDS = new Set([
  'customerName', 'phone', 'guardianName', 'source', 'packageId',
  'transactionType', 'paymentMethod', 'packageValue', 'collectedToday',
  'quantity', 'unitPrice',
  'receiptNo', 'contractNo', 'note',
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
    if (!canEditTransaction(
      caller,
      { saleId: batch.saleId, branchId: batch.branchId, status: batch.status },
      { reviewStatus: tx.reviewStatus },
    )) {
      return NextResponse.json({ error: 'Không có quyền sửa giao dịch này (có thể đã được kế toán duyệt)' }, { status: 403 });
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
    if ('phone' in updates) {
      const p = String(updates.phone ?? '').trim();
      if (!/^0\d{9}$/.test(p)) {
        return NextResponse.json({ error: 'SĐT phải 10 số bắt đầu bằng 0' }, { status: 400 });
      }
      updates.phone = p;
    }
    if ('guardianName' in updates) {
      updates.guardianName = updates.guardianName ? String(updates.guardianName).trim() : null;
    }
    if ('note' in updates) {
      updates.note = updates.note ? String(updates.note).slice(0, 500) : null;
    }
    if ('receiptNo' in updates) {
      updates.receiptNo = updates.receiptNo ? String(updates.receiptNo).trim().slice(0, 50) : null;
    }
    if ('contractNo' in updates) {
      updates.contractNo = updates.contractNo ? String(updates.contractNo).trim().slice(0, 50) : null;
    }
    // ISSUE-3 audit fix 2026-06-17: nếu đổi transactionType → AUTO-CLEAR field chứng từ
    // không thuộc loại mới để tránh dirty data + sai logic auto-match.
    if ('transactionType' in updates) {
      const newType = updates.transactionType;
      // thanh_toan_full không có Số PT → clear
      if (newType === 'thanh_toan_full' && !('receiptNo' in updates)) {
        updates.receiptNo = null;
      }
      // dat_coc không có Số HĐ → clear
      if (newType === 'dat_coc' && !('contractNo' in updates)) {
        updates.contractNo = null;
      }
    }

    // Nếu đổi packageId → re-resolve package info
    let resolvedIsCustomQty: boolean | undefined;
    let resolvedManualPwq: boolean | undefined;
    if ('packageId' in updates) {
      const pkg = await getPackageById(String(updates.packageId));
      if (!pkg) return NextResponse.json({ error: 'Gói không tồn tại' }, { status: 400 });
      updates.packageId = pkg.id;
      updates.packageCode = pkg.code;
      updates.packageName = pkg.name;
      updates.serviceGroup = pkg.serviceGroup;
      updates.isChildPackage = pkg.isChildPackage;
      updates.packageIsCustomQuantity = pkg.isCustomQuantity === true;
      updates.packageUnitName = pkg.unitName ?? '';
      // V8.Y (2026-06-19): snapshot manual mode
      updates.packageManualPriceWithQty = pkg.manualPriceWithQuantity === true;
      resolvedIsCustomQty = pkg.isCustomQuantity;
      resolvedManualPwq = pkg.manualPriceWithQuantity;
    }
    // Validate + sanitize quantity/unitPrice
    if ('quantity' in updates) {
      const q = Number(updates.quantity);
      updates.quantity = Number.isFinite(q) && q > 0 ? q : null;
    }
    if ('unitPrice' in updates) {
      const u = Number(updates.unitPrice);
      updates.unitPrice = Number.isFinite(u) && u >= 0 ? u : null;
    }

    // 2026-06-17: 'thanh_toan_not' = trả nốt → packageValue effective = 0 + debt = 0.
    const finalTxnType = 'transactionType' in updates ? updates.transactionType : tx.transactionType;
    const finalCollected = 'collectedToday' in updates ? updates.collectedToday : Number(tx.collectedToday ?? 0);
    // PT: auto-compute packageValue khi gói tính theo buổi (resolvedIsCustomQty hoặc đã lưu)
    const isCustomQty = resolvedIsCustomQty ?? (tx.packageIsCustomQuantity === true);
    // V8.Y: manual mode — Sale tự nhập packageValue + qty là note (required >0). Không enforce formula.
    const isManualMode = resolvedManualPwq ?? (tx.packageManualPriceWithQty === true);
    const finalQuantity = 'quantity' in updates ? updates.quantity : (tx.quantity ?? null);
    const finalUnitPrice = 'unitPrice' in updates ? updates.unitPrice : (tx.unitPrice ?? null);

    // Manual mode: validate quantity required + clear unitPrice (mode này không có đơn giá)
    if (isManualMode && finalTxnType !== 'thanh_toan_not') {
      if (finalQuantity == null || Number(finalQuantity) <= 0) {
        return NextResponse.json({ error: 'Gói này phải có Số buổi (>0)' }, { status: 400 });
      }
      // Force unitPrice = null (gói manual không dùng đơn giá)
      updates.unitPrice = null;
      // packageValue phải > 0. Nếu user PATCH packageValue=0 → reject (block zero-value tx)
      if ('packageValue' in updates && Number(updates.packageValue ?? 0) <= 0) {
        return NextResponse.json({ error: 'Gói này phải có Giá trị gói (>0) — Sale tự nhập' }, { status: 400 });
      }
    }

    // V7 Promo audit fix (2026-06-18): luôn compute base TRƯỚC, recompute discount từ
    // snapshots, rồi final = base - discount. Đồng bộ 3 field: basePackageValue +
    // discountAmount + packageValue. Tránh drift khi user đổi qty/up/packageValue.
    const snapshots: PromoSnapshot[] = Array.isArray(tx.promoSnapshots) ? tx.promoSnapshots : [];
    const oldDiscountAmount = Number(tx.discountAmount ?? 0);

    let newBase: number;
    let newDiscount = 0;
    let finalPackageValue: number;

    if (finalTxnType === 'thanh_toan_not') {
      newBase = 0;
      finalPackageValue = 0;
      updates.basePackageValue = 0;
      updates.packageValue = 0;
      updates.discountAmount = 0;
      updates.debtAmount = 0;
    } else {
      if (isCustomQty) {
        // PT: base = qty × unitPrice. Nếu thiếu qty/up → base=0 (chờ user nhập đủ).
        const q = finalQuantity != null ? Number(finalQuantity) : 0;
        const u = finalUnitPrice != null ? Number(finalUnitPrice) : 0;
        newBase = (q > 0 && u >= 0) ? q * u : 0;
      } else {
        // Non-PT: lấy từ updates.packageValue (kế toán nhập) hoặc tx.basePackageValue cũ
        // (Sale chỉ readonly cell). Nếu doc cũ không có basePackageValue → fallback packageValue.
        if ('packageValue' in updates) {
          newBase = Number(updates.packageValue);
        } else {
          newBase = Number(tx.basePackageValue ?? tx.packageValue ?? 0);
        }
      }
      // Recompute discount từ snapshots với newBase (percent% thay đổi theo base; fixed cap ở base)
      for (const s of snapshots) {
        if (isDiscountType(s.type)) newDiscount += computeDiscount(newBase, s.type, s.value);
      }
      newDiscount = Math.min(newDiscount, newBase);
      finalPackageValue = Math.max(0, newBase - newDiscount);

      updates.basePackageValue = newBase;
      updates.discountAmount = newDiscount;
      updates.packageValue = finalPackageValue;
      updates.debtAmount = Math.max(0, finalPackageValue - finalCollected);
    }

    // Validate guardianName nếu isChildPackage
    const finalIsChild = 'isChildPackage' in updates ? updates.isChildPackage : !!tx.isChildPackage;
    const finalGuardian = 'guardianName' in updates ? updates.guardianName : tx.guardianName;
    if (finalIsChild && !finalGuardian) {
      return NextResponse.json({ error: 'Gói trẻ em bắt buộc Người giám hộ' }, { status: 400 });
    }

    // Validate thanh_toan_full → collected >= packageValue (KHÔNG áp dụng cho thanh_toan_not)
    if (finalTxnType === 'thanh_toan_full' && finalCollected < finalPackageValue) {
      return NextResponse.json({ error: 'Thanh toán full phải thu đủ giá trị gói' }, { status: 400 });
    }
    // V6 2026-06-17: validate chứng từ theo finalTxnType
    const finalReceiptNo = 'receiptNo' in updates ? updates.receiptNo : (tx.receiptNo ?? null);
    const finalContractNo = 'contractNo' in updates ? updates.contractNo : (tx.contractNo ?? null);
    if (finalTxnType === 'dat_coc' && !finalReceiptNo) {
      return NextResponse.json({ error: 'Đặt cọc bắt buộc Số phiếu thu' }, { status: 400 });
    }
    if ((finalTxnType === 'thanh_toan_full' || finalTxnType === 'thanh_toan_not') && !finalContractNo) {
      return NextResponse.json({ error: 'Thanh toán (full/nốt) bắt buộc Số hợp đồng' }, { status: 400 });
    }

    updates.updatedAt = Timestamp.now();
    await txRef.update(updates);

    // V7 Promo audit fix (2026-06-18): adjust promo stats delta nếu discount thay đổi.
    // Decrement(old) + Increment(new) cho từng promo trong snapshots → totalDiscount
    // không drift sau khi kế toán sửa qty/up/packageValue.
    const discountDelta = newDiscount - oldDiscountAmount;
    if (discountDelta !== 0 && snapshots.length > 0) {
      const discountPromos = snapshots.filter((s) => isDiscountType(s.type));
      void Promise.all(discountPromos.map(async (s) => {
        try {
          await db.collection(COLLECTIONS.SALES_PROGRAMS).doc(s.id).update({
            totalDiscount: FieldValue.increment(discountDelta),
            updatedAt: updates.updatedAt,
          });
        } catch (e) {
          console.warn('[sales-v2/tx PATCH] promo discount stat adjust failed', s.id, e);
        }
      }));
    }

    // Audit log: chỉ ghi khi kế toán/quản lý sửa (khác saleId owner). Sale tự sửa
    // batch draft của mình không cần log (đỡ noise).
    const isReviewerEdit = batch.saleId !== caller.profile.uid;
    if (isReviewerEdit) {
      const SKIP = new Set(['updatedAt', 'debtAmount']); // derived fields
      const changes = Object.entries(updates)
        .filter(([k]) => !SKIP.has(k))
        .filter(([k, v]) => tx[k] !== v)
        .map(([field, newValue]) => ({ field, oldValue: tx[field] ?? null, newValue }));
      if (changes.length > 0) {
        void writeSalesAuditBatch(db, tx.batchId, id, changes, {
          uid: caller.profile.uid,
          name: caller.actorName,
        });
      }
    }

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
    if (!canEditTransaction(
      caller,
      { saleId: batch.saleId, branchId: batch.branchId, status: batch.status },
      { reviewStatus: tx.reviewStatus },
    )) {
      return NextResponse.json({ error: 'Không có quyền xoá (giao dịch đã được kế toán duyệt)' }, { status: 403 });
    }

    // V7 Promo (2026-06-18): decrement promo stats trước khi xoá tx → tránh stats drift.
    // Snapshot ở tx ghi rõ promoIds + discountAmount/bonusQuantity/bonusDays — đảo dấu để trừ.
    const promoSnapshots: Array<{ id: string; type: string }> = Array.isArray(tx.promoSnapshots) ? tx.promoSnapshots : [];
    const txDiscount = Number(tx.discountAmount ?? 0);
    const txBonusSessions = Number(tx.bonusQuantity ?? 0);
    const txBonusDays = Number(tx.bonusDays ?? 0);
    if (promoSnapshots.length > 0) {
      await Promise.all(promoSnapshots.map(async (s) => {
        try {
          const pRef = db.collection(COLLECTIONS.SALES_PROGRAMS).doc(s.id);
          const dec: Record<string, any> = {
            usageCount: FieldValue.increment(-1),
            updatedAt: Timestamp.now(),
          };
          if (s.type === 'percent' || s.type === 'fixed_amount') {
            dec.totalDiscount = FieldValue.increment(-txDiscount);
          } else if (s.type === 'bonus_sessions') {
            dec.totalBonusSessions = FieldValue.increment(-txBonusSessions);
          } else if (s.type === 'bonus_days') {
            dec.totalBonusDays = FieldValue.increment(-txBonusDays);
          }
          await pRef.update(dec);
        } catch (e) {
          console.warn('[sales-v2/tx DELETE] promo stat decrement failed', s.id, e);
        }
      }));
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
