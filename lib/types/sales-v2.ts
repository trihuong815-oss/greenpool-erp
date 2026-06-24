// Module "Doanh số v2" — 2026-06-16
// Types cho workflow Sale nhập daily batch → Kế toán đối chiếu → Auto-link thanh toán nốt.
//
// Khác module sales cũ (FROZEN): cũ track aggregate per period × branch × sale; v2 track
// từng giao dịch (transaction) gom theo daily batch để batch-review.

import type { BranchId } from './branches';

// ─── Enums ───────────────────────────────────────────────────────────

export type SalesV2Source = 'ca_nhan' | 'walkin' | 'mkt' | 'renew' | 'ref';

export const SOURCE_LABEL: Record<SalesV2Source, string> = {
  ca_nhan: 'Nguồn cá nhân',
  walkin: 'Walkin',
  mkt: 'MKT',
  renew: 'Renew',
  ref: 'Ref',
};

export type TransactionType = 'dat_coc' | 'thanh_toan_full' | 'thanh_toan_not';

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  dat_coc: 'Đặt cọc',
  thanh_toan_full: 'Thanh toán full',
  thanh_toan_not: 'Thanh toán nốt',
};

// 2026-06-17: bỏ QR (Sale tại Green Pool không dùng riêng).
// PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): extend từ 3 → 6 methods.
// Khách có thể thanh toán bằng 2 hình thức cùng lúc → 3 combo methods.
// LEGACY keys (tien_mat/chuyen_khoan/pos) giữ nguyên — backward-compat.
export type PaymentMethod =
  | 'tien_mat'
  | 'chuyen_khoan'
  | 'pos'
  | 'tien_mat_chuyen_khoan'
  | 'tien_mat_pos'
  | 'chuyen_khoan_pos';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  tien_mat: 'Tiền mặt',
  chuyen_khoan: 'Chuyển khoản',
  pos: 'POS',
  tien_mat_chuyen_khoan: 'Tiền mặt + Chuyển khoản',
  tien_mat_pos: 'Tiền mặt + POS',
  chuyen_khoan_pos: 'Chuyển khoản + POS',
};

/** PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): chi tiết phân bổ tiền
 *  theo phương thức. Optional — record cũ chưa có sẽ được derive từ
 *  paymentMethod + collectedToday (xem deriveBreakdownFromLegacy). */
export interface PaymentBreakdown {
  cash: number;       // = bucket 'tien_mat'
  transfer: number;   // = bucket 'chuyen_khoan'
  card: number;       // = bucket 'pos'
}

export type BatchStatus =
  | 'draft'           // Sale đang nhập (lưu tạm)
  | 'pending_review'  // Sale đã submit → chờ kế toán
  | 'approved'        // Kế toán đã duyệt (data chính thức)
  | 'returned'        // Kế toán trả lại Sale sửa
  | 'locked';         // Đã khóa (thường sau khi qua kế toán + kết tháng)

export type MatchStatus =
  | 'not_applicable' // không phải thanh_toan_not
  | 'pending'        // chờ kế toán duyệt batch (chưa chạy auto-match)
  | 'matched'        // auto-match thành công 1 giao dịch
  | 'needs_review'   // tìm thấy N>1 candidate → kế toán chọn
  | 'no_match';      // không tìm thấy → "cần kiểm tra"

// V6 (2026-06-17): per-transaction review state cho kế toán đối chiếu.
//   pending  — chưa tick (mặc định sau Sale submit)
//   approved — kế toán tick ✓
//   rejected — kế toán tick ✗ + nhập rejectReason
// Logic batch:
//   - All tx approved → cho phép "Duyệt toàn bộ" (batch.status=approved)
//   - Có ≥1 rejected → cho phép "Trả lại Sale" (batch.status=returned, gom reason)
//   - Còn pending → block cả 2 action (chưa review xong)
export type TxReviewStatus = 'pending' | 'approved' | 'rejected';

// ─── Documents ───────────────────────────────────────────────────────

/** salesDailyBatches/{id} — 1 doc / sale / ngày. */
export interface SalesDailyBatch {
  id: string;
  date: string;          // 'YYYY-MM-DD'
  month: string;         // 'YYYY-MM' (denormalize cho query)
  branchId: BranchId;
  branchName: string;
  saleId: string;
  saleName: string;
  status: BatchStatus;
  totalTransactions: number;
  totalSalesAmount: number;      // tổng giá trị gói
  totalCollectedAmount: number;  // tổng thực thu
  totalDebtAmount: number;       // totalSales - totalCollected
  submittedAt?: string | null;   // ISO timestamp khi Sale bấm Gửi đối chiếu
  submittedBy?: string | null;   // uid Sale
  reviewedAt?: string | null;    // ISO timestamp khi kế toán duyệt
  reviewedBy?: string | null;    // uid kế toán
  returnedAt?: string | null;
  returnReason?: string | null;
  createdAt: string;
  updatedAt: string;
  /** M2.1 PR-4 (2026-06-20): derive runtime từ users.roleId của saleId.
   *  CHỈ enrich khi feature flag SALES_V2_QLCS_BADGE ON. Undefined nếu flag OFF
   *  hoặc user bị delete → UI fallback ẩn badge.
   *  KHÔNG lưu vào Firestore — derive mỗi lần GET. */
  submitterRoleType?: 'sale' | 'qlcs' | 'other';
}

/** salesTransactions/{id} — mỗi dòng trong data grid. */
export interface SalesTransaction {
  id: string;
  batchId: string;
  date: string;          // sync với batch.date
  month: string;
  branchId: BranchId;
  branchName: string;
  saleId: string;
  saleName: string;
  // Customer
  customerName: string;
  phone: string;
  guardianName?: string | null;  // bắt buộc nếu gói HBTE/isChildPackage
  // Package
  source: SalesV2Source;
  packageId: string;
  packageCode: string;           // = group.name (HBTE/HBNL/YOGA...)
  packageName: string;
  serviceGroup: string;          // = group.name
  isChildPackage: boolean;       // derive khi nhập
  // Transaction
  transactionType: TransactionType;
  paymentMethod: PaymentMethod;
  /** PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): phân bổ tiền theo phương thức.
   *  Optional vì record cũ chưa có. Đọc qua resolveBreakdown() để fallback legacy. */
  paymentBreakdown?: PaymentBreakdown | null;
  packageValue: number;          // giá trị gói (doanh số)
  collectedToday: number;        // thực thu hôm nay
  debtAmount: number;            // packageValue - collectedToday (HIỆN TẠI — giảm khi auto-link)
  // V6 (2026-06-17 audit BUG-1): snapshot debt LÚC TẠO (chỉ cho dat_coc). Không đổi
  // khi auto-match link → dùng cho "Công nợ phát sinh" trong dashboard tháng.
  originalDebt?: number;
  // V6 (2026-06-17) PT/Bơi PT: gói tính theo buổi. Nếu package.isCustomQuantity:
  //   quantity = số buổi (vd 10 buổi PT)
  //   unitPrice = đơn giá/buổi (vd 500.000)
  //   packageValue = auto = quantity × unitPrice (server enforce)
  // Gói cố định: cả 2 = null.
  quantity?: number | null;
  unitPrice?: number | null;
  // Snapshot tại lúc tạo — dùng cho PATCH/report sau này biết tx này có thuộc PT mode không
  // (kể cả gói gốc sau này bị tắt isCustomQuantity).
  packageIsCustomQuantity?: boolean;
  // Snapshot unitName ('buổi'/'lượt'/...) — UI/báo cáo dùng để hiển thị "10 buổi" / "30 lượt".
  packageUnitName?: string;
  // V8.Y (2026-06-19) — gói "tự nhập giá + ghi số buổi" (vd HB CLB Kid/Aqua).
  // Khác PT (isCustomQuantity): qty CHỈ là note, packageValue Sale tự nhập (KHÔNG enforce
  // qty×unitPrice). 2 mode mutually exclusive. Snapshot vào tx để lock hành vi sau khi admin đổi.
  packageManualPriceWithQty?: boolean;
  // V7 Promo (2026-06-18): chương trình khuyến mãi áp dụng (tối đa 2: 1 giảm + 1 tặng)
  // Tx doc lưu snapshot full vào promoSnapshots → admin sửa promo sau không phá tx cũ.
  // packageValue (final billed) = basePackageValue - discountAmount (server enforce)
  promoIds?: string[];                 // [] hoặc null khi không có promo
  promoSnapshots?: Array<{
    id: string;
    code: string;
    name: string;
    type: 'percent' | 'fixed_amount' | 'bonus_sessions' | 'bonus_days';
    value: number;
  }>;
  basePackageValue?: number;           // packageValue TRƯỚC promo (= qty×up nếu PT hoặc input gốc)
  discountAmount?: number;             // tiền giảm
  bonusQuantity?: number;              // buổi tặng (cho bonus_sessions)
  bonusDays?: number;                  // ngày tặng (cho bonus_days)
  // V6 (2026-06-17): chứng từ tracking
  // - receiptNo: số phiếu thu — required cho 'dat_coc' (mới), optional+link key cho 'thanh_toan_not'
  // - contractNo: số hợp đồng — required cho 'thanh_toan_full' và 'thanh_toan_not'
  receiptNo?: string | null;
  contractNo?: string | null;
  note?: string | null;
  // Per-tx review (V6 2026-06-17)
  reviewStatus: TxReviewStatus;
  rejectReason?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  // Auto-link (chỉ chạy khi batch approved)
  matchedTransactionId?: string | null;
  matchedTargetSummary?: string | null; // "DD/MM/YYYY · Tên KH" — denormalize cho UI tooltip
  matchStatus: MatchStatus;
  createdAt: string;
  updatedAt: string;
}

/** salesAuditLogs/{id} — log mọi chỉnh sửa của kế toán. */
export interface SalesAuditLog {
  id: string;
  batchId: string;
  transactionId?: string | null; // null nếu action ở batch level
  action: 'edit_field' | 'approve' | 'return' | 'auto_match' | 'manual_link';
  field?: string | null;         // tên field bị sửa (vd 'collectedToday')
  oldValue?: unknown;
  newValue?: unknown;
  changedBy: string;             // uid
  changedByName: string;
  changedAt: string;             // ISO timestamp
  reason?: string | null;
}

/** salesMonthlySummary/{month_branchId_saleId} — rebuild via cron daily. */
export interface SalesMonthlySummary {
  id: string;                    // composite key: `${month}_${branchId}_${saleId}`
  month: string;                 // 'YYYY-MM'
  branchId: BranchId;
  saleId: string;
  saleName: string;
  totalSalesAmount: number;
  totalCollectedAmount: number;
  totalDebtGenerated: number;
  totalDebtRemaining: number;    // sau khi trừ thanh_toan_not đã match
  totalTransactions: number;
  bySource: Record<SalesV2Source, { count: number; salesAmount: number; collected: number }>;
  byPackage: Record<string, { count: number; salesAmount: number; collected: number }>;
  updatedAt: string;
}

// ─── Input types (API payload) ────────────────────────────────────────

export interface SalesTransactionInput {
  customerName: string;
  phone: string;
  guardianName?: string | null;
  source: SalesV2Source;
  packageId: string;
  transactionType: TransactionType;
  paymentMethod: PaymentMethod;
  packageValue: number;
  collectedToday: number;
  /** PR-SALES-PAYMENT-SPLIT-SAFE (2026-06-24): phân bổ tiền theo phương thức.
   *  Optional — nếu không gửi, server sẽ derive từ paymentMethod + collectedToday
   *  (chỉ valid cho 3 method legacy). Bắt buộc gửi nếu paymentMethod là combo. */
  paymentBreakdown?: PaymentBreakdown | null;
  receiptNo?: string | null;
  contractNo?: string | null;
  note?: string | null;
  // PT/Bơi PT — số buổi + đơn giá / buổi
  quantity?: number | null;
  unitPrice?: number | null;
  // V7 Promo — Sale gửi list promoIds. Server resolve + validate combo + apply.
  promoIds?: string[];
}

export interface SalesBatchSubmitInput {
  date: string;                  // 'YYYY-MM-DD'
  transactions: SalesTransactionInput[];
}
