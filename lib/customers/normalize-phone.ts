// PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29) — normalizePhone helper.
//
// Mục đích: chuẩn hoá SĐT Việt Nam về 1 format duy nhất để search + dedup MỀM.
//
// Quy tắc:
//   - "+84 983 088 810" → "0983088810" (prefix +84 → 0)
//   - "84 983 088 810"  → "0983088810" (prefix 84 → 0, không có +)
//   - "0983 088 810"    → "0983088810" (strip space)
//   - "0983.088.810"    → "0983088810" (strip .)
//   - "0983-088-810"    → "0983088810" (strip -)
//   - "(0983) 088 810"  → "0983088810" (strip ngoặc)
//   - "0983088810"      → "0983088810" (giữ nguyên)
//   - null/undefined/"" → "" (an toàn, KHÔNG throw)
//
// KHÔNG validate độ dài/format quá cứng — chỉ normalize. Số sai vẫn pass.
// Caller (UI) chịu trách nhiệm validate trước khi save vào Firestore.
//
// BUSINESS RULE: phoneNormalized CHỈ dùng để search/gợi ý dupe MỀM —
// KHÔNG dùng để CHẶN CỨNG khách mua thêm gói.

/**
 * Chuẩn hoá SĐT Việt Nam.
 * @param input — string thô (có thể null/undefined/rỗng)
 * @returns SĐT chỉ chứa digit, prefix 0; "" nếu input không hợp lệ
 */
export function normalizePhone(input: string | null | undefined): string {
  if (input == null) return '';
  const raw = String(input).trim();
  if (raw === '') return '';

  // Chỉ giữ chữ số (strip space, ., -, (, ), +, chữ cái, etc.)
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return '';

  // Chuẩn prefix Việt Nam:
  // - Bắt đầu bằng '84' và có 11-12 digit (84 + 9-10 số) → đổi thành '0' + phần còn lại
  //   (cover cả "+84983088810" → digits "84983088810" 11 ký tự, "0084983088810" → "84983088810" sau strip leading 00)
  // - Bắt đầu bằng '0' đã đúng format → giữ
  // - Còn lại (vd 9-10 digit không prefix) → giữ nguyên (caller decide)
  if (digits.startsWith('84') && digits.length >= 10 && digits.length <= 12) {
    return '0' + digits.slice(2);
  }
  return digits;
}
