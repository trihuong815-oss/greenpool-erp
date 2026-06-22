// PR-PROMO1A (2026-06-22) — Deadline helper cho /chuong-trinh.
//
// Quy tắc nghiệp vụ Green Pool:
//   - Hạn nộp đề xuất KM = ngày 25 (theo giờ VN, UTC+7) của tháng trước
//     tháng áp dụng. VD: KM tháng 7 → hạn 25/6.
//   - Nhắc trước 2 ngày: từ ngày 23 hiển thị banner "Còn 2 ngày..."
//   - Ngày 25: banner "Hôm nay là hạn cuối..."
//   - Sau ngày 25: banner "Đã quá hạn... nộp muộn sẽ ghi nhận."
//
// LƯU Ý: Status compare dùng "now" injected để testable. Production gọi
// getDeadlineStatusForNow(targetMonth) sẽ tự dùng new Date() — wrapper riêng.

export const PROMO_DEADLINE_DAY = 25;
export const PROMO_REMINDER_LEAD_DAYS = 2;
export const VN_OFFSET_MS = 7 * 3600 * 1000;

export type DeadlineStatus =
  | 'no_warning'   // < D-2: chưa cần cảnh báo
  | 'reminder_d2'  // D-2 hoặc D-1: nhắc còn 2/1 ngày
  | 'd_day'        // D=25: hạn cuối hôm nay
  | 'overdue';     // > D: đã quá hạn

/** Lấy timestamp VN (UTC+7) từ epoch ms. Trả về Date với UTC fields = VN local. */
function toVNDate(ms: number): { year: number; month: number; day: number } {
  const d = new Date(ms + VN_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,   // 1-12
    day: d.getUTCDate(),
  };
}

/** Tính tháng deadline cho 1 program với month='YYYY-MM'.
 *  Deadline ở tháng TRƯỚC tháng program áp dụng. VD program 2026-07 → deadline 2026-06-25.
 *  Trả về { year, month } theo lịch VN. */
export function getDeadlineMonth(targetMonth: string): { year: number; month: number } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) return null;
  const [y, m] = targetMonth.split('-').map(Number);
  // Tháng trước = m - 1, rollover nếu m = 1.
  const dy = m === 1 ? y - 1 : y;
  const dm = m === 1 ? 12 : m - 1;
  return { year: dy, month: dm };
}

/** So sánh hiện tại (VN) với deadline ngày 25 của tháng deadline.
 *  - Nếu hiện tại Ở THÁNG TRƯỚC deadline → 'no_warning' (chưa đến lúc nhắc).
 *  - Nếu hiện tại Ở SAU THÁNG DEADLINE → 'overdue'.
 *  - Cùng tháng deadline: so sánh day vs 25.
 */
export function getDeadlineStatus(
  targetMonth: string,
  now: number,
): DeadlineStatus {
  const dl = getDeadlineMonth(targetMonth);
  if (!dl) return 'no_warning';
  const vn = toVNDate(now);

  // So sánh year+month numerically
  const dlKey = dl.year * 12 + dl.month;
  const nowKey = vn.year * 12 + vn.month;

  if (nowKey < dlKey) return 'no_warning';        // chưa tới tháng deadline
  if (nowKey > dlKey) return 'overdue';           // đã sang tháng sau deadline

  // Cùng tháng deadline
  const day = vn.day;
  if (day < PROMO_DEADLINE_DAY - PROMO_REMINDER_LEAD_DAYS) return 'no_warning';
  if (day < PROMO_DEADLINE_DAY) return 'reminder_d2';
  if (day === PROMO_DEADLINE_DAY) return 'd_day';
  return 'overdue';
}

/** Render label tiếng Việt cho banner. targetMonth = 'YYYY-MM'. */
export function getDeadlineMessage(status: DeadlineStatus, targetMonth: string): string {
  const dl = getDeadlineMonth(targetMonth);
  const dlText = dl ? `${PROMO_DEADLINE_DAY}/${String(dl.month).padStart(2, '0')}` : `${PROMO_DEADLINE_DAY}`;
  switch (status) {
    case 'reminder_d2':
      return `Còn vài ngày đến hạn (${dlText}) gửi đề xuất chương trình khuyến mãi tháng ${formatMonthHuman(targetMonth)}.`;
    case 'd_day':
      return `Hôm nay (${dlText}) là hạn cuối gửi đề xuất chương trình khuyến mãi tháng ${formatMonthHuman(targetMonth)}.`;
    case 'overdue':
      return `Đã quá hạn (${dlText}) gửi đề xuất chương trình khuyến mãi tháng ${formatMonthHuman(targetMonth)}. Nếu nộp sau hạn, hệ thống sẽ ghi nhận nộp muộn.`;
    case 'no_warning':
    default:
      return '';
  }
}

/** Format 'YYYY-MM' → 'MM/YYYY' cho human-friendly. */
function formatMonthHuman(targetMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) return targetMonth;
  const [y, m] = targetMonth.split('-');
  return `${m}/${y}`;
}

/** Tone (Tailwind color suffix) tương ứng status — caller dùng cho banner styling. */
export function getDeadlineTone(status: DeadlineStatus): 'slate' | 'amber' | 'orange' | 'rose' {
  switch (status) {
    case 'reminder_d2': return 'amber';
    case 'd_day':       return 'orange';
    case 'overdue':     return 'rose';
    case 'no_warning':
    default:            return 'slate';
  }
}
