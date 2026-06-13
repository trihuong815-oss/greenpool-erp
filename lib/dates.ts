// V6.4 (2026-06-13): Helper timezone Hà Nội (Asia/Ho_Chi_Minh = UTC+7).
//
// Lý do: code trước đây dùng `new Date().toISOString().slice(0,10)` để lấy today
// → đây là UTC date, KHÔNG phải HN date. Vd 5h sáng HN = 22h UTC ngày hôm trước
// → so sánh deadline sai lệch 1 ngày.
//
// Cũng có nhiều chỗ `toLocaleString('vi-VN', {...})` không set timeZone — user ở
// nước ngoài (vd CEO công tác) sẽ thấy giờ lệch.
//
// Tất cả helper dưới ÉP timezone='Asia/Ho_Chi_Minh' — luôn trả/so sánh theo giờ HN.

export const HN_TZ = 'Asia/Ho_Chi_Minh';

/** Lấy ngày hiện tại theo giờ HN dạng 'YYYY-MM-DD' (dùng so sánh dueDate). */
export function todayHN(): string {
  // Intl trả 'dd/mm/yyyy' theo locale vi-VN với timeZone HN — split lại sang ISO.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HN_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()); // en-CA → 'YYYY-MM-DD'
  return parts;
}

/** Format ISO string (UTC từ server) → 'dd/mm/yyyy' theo giờ HN. */
export function formatDateHN(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('vi-VN', {
    timeZone: HN_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

/** Format ISO string → 'dd/mm/yyyy HH:mm' theo giờ HN. */
export function formatDateTimeHN(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('vi-VN', {
    timeZone: HN_TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
}

/** Format ISO string → 'HH:mm' theo giờ HN. */
export function formatTimeHN(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', {
    timeZone: HN_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** Convert dueDate (YYYY-MM-DD lưu trong DB, date-only) → epoch ms cuối ngày HN.
 *  Dùng để check overdue (dueDate < now). +07:00 = HN offset hardcoded
 *  (Asia/Ho_Chi_Minh không có DST nên offset cố định). */
export function endOfDayHN(yyyyMmDd: string): number {
  return new Date(`${yyyyMmDd}T23:59:59+07:00`).getTime();
}

/** Quá hạn: dueDate < cuối ngày HN hiện tại. */
export function isPastDueHN(yyyyMmDd: string | undefined | null): boolean {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return false;
  return endOfDayHN(yyyyMmDd) < Date.now();
}
