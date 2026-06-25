// PR-CASH-EXPENSE-BANK-ACCOUNT (2026-06-24) — Pure helpers cho trường
// "Chuyển từ TK" (tài khoản nguồn) của phiếu chi.

import type { ExpensePaymentMethod } from './expense-types';

export const TRANSFER_ACCOUNT_MAX_LEN = 120;

/** True nếu paymentMethod đó cần nhập tài khoản nguồn (chỉ 'transfer'). */
export function requiresTransferAccount(method: ExpensePaymentMethod): boolean {
  return method === 'transfer';
}

/** Normalize input: nếu method≠transfer → null (force clear).
 *  Nếu method=transfer → trim + slice max-len; '' → null (caller validate require trước record). */
export function normalizeTransferAccount(
  method: ExpensePaymentMethod,
  raw: string | null | undefined,
): string | null {
  if (!requiresTransferAccount(method)) return null;
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim().slice(0, TRANSFER_ACCOUNT_MAX_LEN);
  return trimmed.length === 0 ? null : trimmed;
}

export type TransferAccountValidation = { ok: true } | { ok: false; error: string };

/** Validate khi RECORD (status='recorded'):
 *  - method=transfer → bắt buộc non-empty
 *  - method≠transfer → bỏ qua (server tự normalize null)
 *
 *  Dùng cho cả client (chặn submit) + server (chặn record).
 */
export function validateTransferAccountForRecord(
  method: ExpensePaymentMethod,
  value: string | null | undefined,
): TransferAccountValidation {
  if (!requiresTransferAccount(method)) return { ok: true };
  const v = normalizeTransferAccount(method, value);
  if (!v) return { ok: false, error: 'Vui lòng nhập tài khoản chuyển khoản nguồn.' };
  return { ok: true };
}
