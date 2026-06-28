// PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29) — buildCustomerCode helper.
//
// Mục đích: format mã khách hàng human-readable theo pattern:
//   KH-YYYY-BRANCHID-NNNNN
//
// Vd: KH-2026-HM-00012, KH-2026-TK-00001
//
// LƯU Ý: helper KHÔNG sinh sequence thật — chỉ format string. Sequence phải
// được sinh ở server (Firestore transaction hoặc counter doc riêng) và truyền
// vào helper. PR-02 sẽ implement sequence generator khi cần.
//
// KHÔNG gọi DB. KHÔNG side-effect. Pure function.

export interface BuildCustomerCodeInput {
  /** Năm 4 chữ số, vd 2026. */
  year: number;
  /** Branch id, vd "HM"/"TK"/"CTT"/"24"/"TT". Auto uppercase. */
  branchId: string;
  /** Số thứ tự khách trong năm × cơ sở, vd 12 → "00012". */
  sequence: number;
}

/**
 * Format mã khách hàng.
 *
 * Edge cases:
 *   - sequence <= 0: vẫn format thành "00000" (an toàn, không throw)
 *   - sequence > 99999: pad theo độ dài thực (vd 123456 → "123456"), không truncate
 *   - branchId rỗng: vẫn format thành "KH-YYYY--NNNNN" (an toàn, caller chịu trách nhiệm)
 *   - year không hợp lệ (NaN/<0): coerce String(year)
 *
 * Quy tắc "không throw" theo convention helper trong PR-01.
 */
export function buildCustomerCode(input: BuildCustomerCodeInput): string {
  const year = Number.isFinite(input.year) ? Math.trunc(input.year) : 0;
  const branch = String(input.branchId ?? '').trim().toUpperCase();
  const seq = Number.isFinite(input.sequence) && input.sequence > 0
    ? Math.trunc(input.sequence)
    : 0;
  const seqStr = String(seq).padStart(5, '0');
  return `KH-${year}-${branch}-${seqStr}`;
}
