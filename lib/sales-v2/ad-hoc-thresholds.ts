// PR-PROMO2-B (2026-06-23) — Thresholds + classify cho ad-hoc discount.
//
// Định nghĩa nghiệp vụ CHỐT: "Ưu đãi ngoài chương trình" = tx có giá bán thực tế
// thấp hơn baseline gói, KHÔNG gắn với chương trình KM chính thức.
//
// Threshold (chốt 2026-06-23 — Phương án A thận trọng):
//   NORMAL     : <= 3%       (sai số làm tròn, VẪN ghi nhận thống kê, không cảnh báo)
//   LOW        : > 3% - 10%  (ghi nhận, hiển thị nhẹ)
//   REVIEW     : > 10% - 20% (kế toán/QLCS/GD nên xem lại)
//   HIGH_RISK  : > 20%       (rủi ro cao, nổi bật badge đỏ)

export const AD_HOC_THRESHOLDS = {
  NORMAL_MAX: 3,    // <= 3% → NORMAL
  LOW_MAX: 10,      // 3% < x <= 10% → LOW
  REVIEW_MAX: 20,   // 10% < x <= 20% → REVIEW
  // > 20% → HIGH_RISK
} as const;

export type AdHocClassification = 'NORMAL' | 'LOW' | 'REVIEW' | 'HIGH_RISK';

export const AD_HOC_CLASSIFICATION_LABELS: Record<AdHocClassification, string> = {
  NORMAL: 'Sai số nhẹ',
  LOW: 'Giảm nhẹ',
  REVIEW: 'Cần kiểm tra',
  HIGH_RISK: 'Rủi ro cao',
};

/** Tailwind color suffix tương ứng — UI dùng để styling badge. */
export const AD_HOC_CLASSIFICATION_TONE: Record<AdHocClassification, 'slate' | 'amber' | 'orange' | 'rose'> = {
  NORMAL: 'slate',
  LOW: 'amber',
  REVIEW: 'orange',
  HIGH_RISK: 'rose',
};

/** Sort order cho list display — HIGH_RISK trước. */
export const AD_HOC_CLASSIFICATION_PRIORITY: Record<AdHocClassification, number> = {
  HIGH_RISK: 0,
  REVIEW: 1,
  LOW: 2,
  NORMAL: 3,
};

/** Classify discount percent → bucket.
 *  Edge: pct <= 3 NORMAL; 3 < pct <= 10 LOW; 10 < pct <= 20 REVIEW; pct > 20 HIGH_RISK.
 *  Input < 0 hoặc NaN → NORMAL (fallback safe — caller phải skip case không hợp lệ trước). */
export function classifyAdHoc(pct: number): AdHocClassification {
  if (!Number.isFinite(pct) || pct <= AD_HOC_THRESHOLDS.NORMAL_MAX) return 'NORMAL';
  if (pct <= AD_HOC_THRESHOLDS.LOW_MAX) return 'LOW';
  if (pct <= AD_HOC_THRESHOLDS.REVIEW_MAX) return 'REVIEW';
  return 'HIGH_RISK';
}
