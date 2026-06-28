// PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29) — Customer helpers barrel.
//
// Usage: import { normalizePhone, normalizeCustomerName,
//                  buildCustomerCode, buildCustomerDraft } from '@/lib/customers';
//
// LƯU Ý: helpers ở PR-01 CHƯA được nối vào runtime app. Chỉ export để
// PR-02/03 sau import. Không có side-effect khi import barrel.

export { normalizePhone } from './normalize-phone';
export { normalizeCustomerName } from './normalize-name';
export { buildCustomerCode, type BuildCustomerCodeInput } from './customer-code';
export { buildCustomerDraft, type BuildCustomerDraftInput } from './build-customer';
