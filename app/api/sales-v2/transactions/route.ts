// GET  /api/sales-v2/transactions?batchId=X  — list transactions của batch
// POST /api/sales-v2/transactions  body: { batchId, ...SalesTransactionInput }
//   - Sale only, batch ở status draft/returned
//   - Validate package + auto-derive packageCode/Name/serviceGroup/isChildPackage
//   - Compute debtAmount
//   - Validate guardianName bắt buộc nếu isChildPackage
// Phase 1 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canReadBatch, canEditTransaction } from '@/lib/sales-v2/scope';
import { serializeTransaction } from '@/lib/sales-v2/serialize';
import { getPackageById } from '@/lib/sales-v2/packages';
import { getProgramsByIds, toSnapshot } from '@/lib/sales-v2/programs';
import {
  computeDiscount, isDiscountType, isBonusType, validatePromoCombo,
  type PromoSnapshot,
} from '@/lib/types/sales-program';
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
    const inputPackageValue = Number(body.packageValue ?? 0);
    const collectedToday = Number(body.collectedToday ?? 0);
    const receiptNo = body.receiptNo ? String(body.receiptNo).trim().slice(0, 50) : null;
    const contractNo = body.contractNo ? String(body.contractNo).trim().slice(0, 50) : null;
    const note = body.note ? String(body.note).slice(0, 500) : null;
    // V6 (PT): nếu gói tính theo buổi → Sale gửi quantity + unitPrice, server auto packageValue
    const inputQuantity = body.quantity != null ? Number(body.quantity) : null;
    const inputUnitPrice = body.unitPrice != null ? Number(body.unitPrice) : null;
    // V7 Promo (2026-06-18): Sale gửi promoIds[] tối đa 2 (1 giảm + 1 tặng).
    const inputPromoIds: string[] = Array.isArray(body.promoIds)
      ? body.promoIds.map(String).filter((s: string) => s.length > 0).slice(0, 2)
      : [];

    if (!customerName) return NextResponse.json({ error: 'Thiếu tên khách hàng' }, { status: 400 });
    if (!phone) return NextResponse.json({ error: 'Thiếu SĐT' }, { status: 400 });
    if (!/^0\d{9}$/.test(phone)) return NextResponse.json({ error: 'SĐT phải 10 số bắt đầu bằng 0' }, { status: 400 });
    if (!VALID_SOURCES.has(source)) return NextResponse.json({ error: 'Sai nguồn khách' }, { status: 400 });
    if (!packageId) return NextResponse.json({ error: 'Thiếu gói' }, { status: 400 });
    if (!VALID_TXN_TYPES.has(transactionType)) return NextResponse.json({ error: 'Sai loại giao dịch' }, { status: 400 });
    if (!VALID_PAY.has(paymentMethod)) return NextResponse.json({ error: 'Sai hình thức thu' }, { status: 400 });
    if (!Number.isFinite(inputPackageValue) || inputPackageValue < 0) return NextResponse.json({ error: 'Giá trị gói không hợp lệ' }, { status: 400 });
    if (!Number.isFinite(collectedToday) || collectedToday < 0) return NextResponse.json({ error: 'Thu hôm nay không hợp lệ' }, { status: 400 });
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

    // V6 PT: nếu gói isCustomQuantity → server enforce packageValue = quantity × unitPrice
    let finalPackageValue = inputPackageValue;
    let finalQuantity: number | null = null;
    let finalUnitPrice: number | null = null;
    if (pkg.isCustomQuantity && transactionType !== 'thanh_toan_not') {
      if (inputQuantity == null || !Number.isFinite(inputQuantity) || inputQuantity <= 0) {
        return NextResponse.json({ error: `Gói tính theo ${pkg.unitName ?? 'buổi'} — phải nhập số ${pkg.unitName ?? 'buổi'}` }, { status: 400 });
      }
      if (inputUnitPrice == null || !Number.isFinite(inputUnitPrice) || inputUnitPrice < 0) {
        return NextResponse.json({ error: 'Đơn giá / buổi không hợp lệ' }, { status: 400 });
      }
      finalQuantity = inputQuantity;
      finalUnitPrice = inputUnitPrice;
      finalPackageValue = inputQuantity * inputUnitPrice;
    }
    // ─── V7 Promo apply ───
    // finalPackageValue (lúc này) = basePackageValue TRƯỚC promo.
    // Resolve programs → validate active + scope (branch/month/package) → compute.
    const isThanhToanNot = transactionType === 'thanh_toan_not';
    let promoSnapshots: PromoSnapshot[] = [];
    let discountAmount = 0;
    let bonusQuantity = 0;
    let bonusDays = 0;
    const basePackageValue = isThanhToanNot ? 0 : finalPackageValue;

    if (inputPromoIds.length > 0 && !isThanhToanNot) {
      const programs = await getProgramsByIds(inputPromoIds);
      if (programs.length !== inputPromoIds.length) {
        return NextResponse.json({ error: 'Một số chương trình không tồn tại' }, { status: 400 });
      }
      // Validate combo (max 1 discount + 1 bonus)
      const comboCheck = validatePromoCombo(programs.map((p) => ({ promoType: p.promoType })));
      if (!comboCheck.ok) {
        return NextResponse.json({ error: comboCheck.error }, { status: 400 });
      }
      // Validate scope mỗi promo: status='active', branch khớp, month khớp, package trong scope
      for (const p of programs) {
        if (p.status !== 'active') {
          return NextResponse.json({ error: `Chương trình "${p.name}" không còn active (${p.status})` }, { status: 400 });
        }
        if (p.branchId !== batch.branchId) {
          return NextResponse.json({ error: `Chương trình "${p.name}" thuộc cơ sở khác` }, { status: 400 });
        }
        if (p.month !== batch.month) {
          return NextResponse.json({ error: `Chương trình "${p.name}" thuộc tháng ${p.month}, không phải tháng ${batch.month}` }, { status: 400 });
        }
        if (p.packageIds.length > 0 && !p.packageIds.includes(pkg.id)) {
          return NextResponse.json({ error: `Chương trình "${p.name}" không áp dụng cho gói "${pkg.name}"` }, { status: 400 });
        }
        if (p.promoType === 'bonus_sessions' && pkg.isCustomQuantity !== true) {
          return NextResponse.json({ error: `"Tặng buổi" chỉ áp gói PT` }, { status: 400 });
        }
      }
      // Compute (1 discount + 1 bonus tối đa)
      for (const p of programs) {
        if (isDiscountType(p.promoType)) {
          discountAmount += computeDiscount(basePackageValue, p.promoType, p.promoValue);
        } else if (isBonusType(p.promoType)) {
          if (p.promoType === 'bonus_sessions') bonusQuantity += Math.max(0, Math.floor(p.promoValue));
          else if (p.promoType === 'bonus_days') bonusDays += Math.max(0, Math.floor(p.promoValue));
        }
        promoSnapshots.push(toSnapshot(p));
      }
      // Discount không thể > base
      discountAmount = Math.min(discountAmount, basePackageValue);
    }

    // packageValue CUỐI = base - discount (sau promo). Cho thanh_toan_not = 0.
    const effectivePackageValue = isThanhToanNot ? 0 : basePackageValue - discountAmount;

    if (collectedToday > effectivePackageValue && !isThanhToanNot) {
      return NextResponse.json({ error: 'Thu hôm nay không thể lớn hơn giá trị gói (sau khuyến mãi)' }, { status: 400 });
    }

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
      quantity: finalQuantity,
      unitPrice: finalUnitPrice,
      packageIsCustomQuantity: pkg.isCustomQuantity === true,
      packageUnitName: pkg.unitName ?? '',
      // V7 Promo snapshots (immutable per tx — admin sửa promo sau không ảnh hưởng tx này)
      promoIds: promoSnapshots.map((s) => s.id),
      promoSnapshots,
      basePackageValue,
      discountAmount,
      bonusQuantity,
      bonusDays,
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

    // V7 Promo stats: increment usage/discount/bonus cho từng program.
    // Fire-and-forget — không block response. Nếu fail, không phá tx.
    if (promoSnapshots.length > 0) {
      void Promise.all(promoSnapshots.map(async (s) => {
        try {
          const pRef = db.collection(COLLECTIONS.SALES_PROGRAMS).doc(s.id);
          const inc: Record<string, any> = {
            usageCount: FieldValue.increment(1),
            updatedAt: now,
          };
          if (s.type === 'percent' || s.type === 'fixed_amount') {
            // Mỗi tx có thể chứa 1 discount → discountAmount toàn tx được attribute hoàn toàn cho discount promo này.
            inc.totalDiscount = FieldValue.increment(discountAmount);
          } else if (s.type === 'bonus_sessions') {
            inc.totalBonusSessions = FieldValue.increment(bonusQuantity);
          } else if (s.type === 'bonus_days') {
            inc.totalBonusDays = FieldValue.increment(bonusDays);
          }
          await pRef.update(inc);
        } catch (e) {
          console.warn('[sales-v2/tx POST] promo stat increment failed', s.id, e);
        }
      }));
    }

    return NextResponse.json({ ok: true, transaction: serializeTransaction(ref.id, data) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/transactions] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
