// PR-SUMMARY-UI-TRUNCATED-WARNING (2026-06-29) — Banner cảnh báo data integrity
// khi API /api/sales-v2/monthly-summary trả truncated: true (vượt cap 5000 tx).
//
// Tách riêng khỏi BusinessAlerts vì:
//   - Truncated là DATA INTEGRITY issue (sai số liệu) — nghiêm trọng hơn workflow alert
//   - Cần priority cao + style lớn để không bị mất nổi bật
//   - Trước đây nằm trong BusinessAlerts list 5 alert → user có thể bỏ qua
//
// Render điều kiện: ONLY khi data.truncated === true. Không bao giờ hiện
// khi loading/error/truncated=false/undefined.
//
// PR-SUMMARY-03 sẽ giải quyết gốc rễ qua materialized summary (không còn cap).
// Đến lúc đó banner này vẫn giữ làm safety net cho fallback raw path.

import { AlertTriangle } from 'lucide-react';

interface Props {
  /** True khi API monthly-summary truncate (snap.size >= LIMIT). */
  truncated: boolean | undefined;
  /** Giới hạn hiện tại của API (default 5000 nếu undefined). */
  limit?: number;
}

export default function DataTruncatedBanner({ truncated, limit }: Props) {
  if (truncated !== true) return null;

  const limitDisplay = (limit ?? 5000).toLocaleString('vi-VN');

  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-300 bg-rose-50 p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-md bg-rose-100 p-1.5">
          <AlertTriangle size={18} className="text-rose-700" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="text-sm font-semibold text-rose-900">
            Cảnh báo: Số liệu chưa đầy đủ
          </div>
          <p className="text-sm text-rose-800 leading-relaxed">
            Hệ thống đang giới hạn tải tối đa{' '}
            <span className="font-semibold tabular-nums">{limitDisplay}</span>{' '}
            giao dịch cho kỳ này. Số liệu tổng kết có thể chưa đầy đủ nếu lượng
            giao dịch vượt giới hạn.
          </p>
          <p className="text-xs text-rose-700">
            <span className="font-semibold">Vui lòng KHÔNG</span> dùng số liệu
            này để chốt báo cáo cuối kỳ trước khi quản trị viên kiểm tra hoặc
            rebuild dữ liệu. Hãy lọc theo cơ sở để giảm tải, hoặc liên hệ quản
            trị viên.
          </p>
        </div>
      </div>
    </div>
  );
}
