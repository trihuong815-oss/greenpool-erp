// PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24) — Pure helpers cho phân bổ
// thu theo phương thức. Dùng cho cả client validation + server validation +
// daily-summary aggregation (legacy fallback).
//
// 6 PaymentMethod: 3 single (tien_mat/chuyen_khoan/pos) + 3 combo
// (tien_mat_chuyen_khoan/tien_mat_pos/chuyen_khoan_pos).

import type { PaymentMethod, PaymentBreakdown } from '@/lib/types/sales-v2';

export type PaymentBucket = 'cash' | 'transfer' | 'card';

/** Map mỗi paymentMethod → các bucket cần thu tiền (active fields). */
const ACTIVE_FIELDS: Record<PaymentMethod, ReadonlyArray<PaymentBucket>> = {
  tien_mat: ['cash'],
  chuyen_khoan: ['transfer'],
  pos: ['card'],
  tien_mat_chuyen_khoan: ['cash', 'transfer'],
  tien_mat_pos: ['cash', 'card'],
  chuyen_khoan_pos: ['transfer', 'card'],
};

/** Trả về bucket nào ĐANG ACTIVE (Sale phải nhập tiền) theo paymentMethod. */
export function getActivePaymentFields(method: PaymentMethod): ReadonlyArray<PaymentBucket> {
  return ACTIVE_FIELDS[method] ?? [];
}

/** True nếu paymentMethod là combo 2 hình thức. */
export function isSplitPayment(method: PaymentMethod): boolean {
  return getActivePaymentFields(method).length === 2;
}

export const EMPTY_BREAKDOWN: PaymentBreakdown = { cash: 0, transfer: 0, card: 0 };

/** Chuẩn hoá breakdown theo paymentMethod + input:
 *  - 1 method: tự gán toàn bộ collectedToday vào bucket đúng; inactive=0.
 *  - 2 method: dùng input breakdown nguyên; inactive forced = 0.
 *
 *  Caller có thể truyền breakdownInput=undefined khi method là single — em tự derive.
 *  Khi method là split, breakdownInput PHẢI có cả 2 bucket active > 0 (validate riêng). */
export function normalizePaymentBreakdown(
  method: PaymentMethod,
  collectedToday: number,
  breakdownInput?: Partial<PaymentBreakdown> | null,
): PaymentBreakdown {
  const active = getActivePaymentFields(method);
  const out: PaymentBreakdown = { cash: 0, transfer: 0, card: 0 };

  if (active.length === 1) {
    const k = active[0];
    out[k] = Number(collectedToday) || 0;
    return out;
  }

  // Split: lấy 2 ô active từ input, các ô khác = 0.
  for (const k of active) {
    const v = breakdownInput?.[k];
    out[k] = Number(v) || 0;
  }
  return out;
}

/** True nếu tổng breakdown khớp collectedToday (cho phép sai số 1 đồng do làm tròn). */
export function breakdownMatchesTotal(breakdown: PaymentBreakdown, collectedToday: number): boolean {
  const sum = breakdown.cash + breakdown.transfer + breakdown.card;
  return Math.abs(sum - collectedToday) < 1;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/** Validate đầy đủ paymentMethod + breakdown + collectedToday.
 *  - Các ô active của method phải > 0.
 *  - Các ô inactive phải = 0.
 *  - Không có giá trị âm/NaN.
 *  - Tổng breakdown = collectedToday.
 *
 *  Caller gọi sau khi đã normalizePaymentBreakdown. */
export function validatePaymentBreakdown(
  method: PaymentMethod,
  collectedToday: number,
  breakdown: PaymentBreakdown,
): ValidationResult {
  if (!Number.isFinite(collectedToday) || collectedToday < 0) {
    return { ok: false, error: 'Thu hôm nay phải là số ≥ 0' };
  }
  const active = new Set<PaymentBucket>(getActivePaymentFields(method));
  for (const k of ['cash', 'transfer', 'card'] as const) {
    const v = breakdown[k];
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, error: `Số tiền ${k} không hợp lệ` };
    }
    if (active.has(k)) {
      if (v <= 0) return { ok: false, error: 'Vui lòng nhập đủ số tiền cho 2 hình thức thanh toán.' };
    } else {
      if (v !== 0) return { ok: false, error: `Bucket ${k} không thuộc phương thức ${method} — phải = 0` };
    }
  }
  if (!breakdownMatchesTotal(breakdown, collectedToday)) {
    return { ok: false, error: 'Tổng tiền theo phương thức không khớp Thu hôm nay' };
  }
  // Single method must have ≥ 0 active (collectedToday có thể = 0 vd dat_coc 0đ).
  // Nhưng phía caller cấp cao (validateRow) đã check thu > 0 cho transactionType cụ thể.
  return { ok: true };
}

/** Khi record cũ chưa có paymentBreakdown — derive từ paymentMethod + collectedToday.
 *  Chỉ valid cho 3 method LEGACY (tien_mat/chuyen_khoan/pos) — combo method PHẢI
 *  đã được tạo bởi version mới có breakdown. Nếu combo gặp legacy → fallback 0
 *  (defensive) và log warning ở caller. */
export function deriveBreakdownFromLegacy(
  method: PaymentMethod,
  collectedToday: number,
): PaymentBreakdown {
  const out: PaymentBreakdown = { cash: 0, transfer: 0, card: 0 };
  const amt = Number(collectedToday) || 0;
  if (method === 'tien_mat') out.cash = amt;
  else if (method === 'chuyen_khoan') out.transfer = amt;
  else if (method === 'pos') out.card = amt;
  // combo method without breakdown → all zero (defensive, caller logs warning)
  return out;
}

/** Resolve breakdown từ doc:
 *  - Nếu doc.paymentBreakdown có (record mới) → dùng nguyên.
 *  - Nếu null/undefined → derive legacy.
 *
 *  Dùng ở daily-summary aggregator + report builders. */
export function resolveBreakdown(
  doc: { paymentMethod: PaymentMethod; collectedToday: number; paymentBreakdown?: PaymentBreakdown | null },
): PaymentBreakdown {
  if (doc.paymentBreakdown
    && typeof doc.paymentBreakdown.cash === 'number'
    && typeof doc.paymentBreakdown.transfer === 'number'
    && typeof doc.paymentBreakdown.card === 'number'
  ) {
    return doc.paymentBreakdown;
  }
  return deriveBreakdownFromLegacy(doc.paymentMethod, doc.collectedToday);
}
