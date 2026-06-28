// PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29) — normalizeCustomerName helper.
//
// Mục đích: chuẩn hoá tên khách hàng tiếng Việt để search prefix + sort.
//
// Quy tắc:
//   - Trim leading/trailing space
//   - Lowercase
//   - Bỏ dấu tiếng Việt: "Nguyễn" → "nguyen", "Đào" → "dao"
//   - Đ/đ → d (special case Unicode NFD không tách)
//   - Gộp nhiều space → 1 space
//   - Giữ chữ cái/số/khoảng trắng
//
// KHÔNG xoá chữ cái đặc biệt (vd dấu ' cho tên nước ngoài) — chỉ strip diacritic VN.
// KHÔNG validate, KHÔNG throw — input rỗng/null/undefined trả "".

/**
 * Chuẩn hoá tên Việt Nam.
 * @param input — string thô (có thể null/undefined/rỗng)
 * @returns tên lowercase, no diacritic, single space; "" nếu input không hợp lệ
 */
export function normalizeCustomerName(input: string | null | undefined): string {
  if (input == null) return '';
  const raw = String(input).trim();
  if (raw === '') return '';

  // Bước 1: Unicode NFD để tách diacritic (vd "ễ" → "e" + combining mark "̂" + "̃")
  // Bước 2: strip combining marks (̀–ͯ)
  // Bước 3: lowercase
  // Bước 4: Đ/đ → d (Đ/đ không tách qua NFD vì nó là chữ cái độc lập)
  // Bước 5: gộp space
  const stripped = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped;
}
