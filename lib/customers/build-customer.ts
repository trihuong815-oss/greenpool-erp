// PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29) — buildCustomerDraft helper.
//
// Mục đích: từ input thô (sale nhập tên + phone + branchId) → tạo CustomerDraft
// (Omit customerId/createdAt/updatedAt — server set timestamps + auto-id).
//
// PR-01: helper PURE, KHÔNG gọi DB, KHÔNG side-effect.
// PR-02/03 sẽ wire vào /api/customers POST endpoint.
//
// BUSINESS RULES (theo audit 10-year scale):
//   - 1 SĐT có thể tạo nhiều customer nếu user xác nhận (gia đình chung số)
//   - KHÔNG auto merge, KHÔNG chặn cứng dupe
//   - Status mặc định 'active' cho khách phát sinh giao dịch
//   - Counters init về 0; cập nhật qua cron/trigger sau (eventually-consistent)

import type { BranchId } from '../branches';
import type { CustomerDraft } from '../types/customers';
import { normalizePhone } from './normalize-phone';
import { normalizeCustomerName } from './normalize-name';

export interface BuildCustomerDraftInput {
  /** Tên đầy đủ — caller đã trim. Helper giữ format gốc cho fullName. */
  fullName: string;
  /** SĐT raw — caller đã trim. Helper normalize vào phoneNormalized. */
  phone: string;
  /** Cơ sở chính khi tạo. */
  branchId: BranchId;
  /** Sale chăm sóc (optional — có thể là QLCS hoặc khách walk-in chưa assign). */
  saleId?: string | null;
  /** Nguồn (vd 'ca_nhan'/'walkin'/'mkt'/'renew'/'ref'). */
  source?: string | null;
  /** uid người tạo (sale/QLCS/admin). */
  createdBy: string;
  /** Mã khách (caller build qua buildCustomerCode trước khi gọi). */
  customerCode: string;
}

/**
 * Tạo CustomerDraft (chưa có id + timestamps — server set).
 *
 * Helper PURE — không gọi DB, không side-effect.
 */
export function buildCustomerDraft(input: BuildCustomerDraftInput): CustomerDraft {
  const fullName = String(input.fullName ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  const phoneNormalized = normalizePhone(phone);

  return {
    customerCode: input.customerCode,

    fullName,
    normalizedName: normalizeCustomerName(fullName),

    phonePrimary: phone,
    phoneNormalized,
    phones: phoneNormalized
      ? [{ phone, normalized: phoneNormalized, label: 'primary' }]
      : [],

    primaryBranchId: input.branchId,
    branchIds: [input.branchId],

    assignedSaleIds: input.saleId ? [input.saleId] : [],

    status: 'active',
    source: input.source ?? null,
    tags: [],

    createdBy: input.createdBy,

    lastTransactionAt: null,
    lastInteractionAt: null,

    totalRevenue: 0,
    totalCollected: 0,
    totalDebt: 0,

    transactionCount: 0,
    enrollmentCount: 0,
    refundCount: 0,
  };
}
