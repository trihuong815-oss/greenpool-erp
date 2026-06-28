// PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29) — Customer master type.
//
// Mục đích: tạo NỀN dữ liệu khách hàng trung tâm chuẩn bị scale 10 năm
// (5 cơ sở × 10.000 khách/cơ sở/năm = 50.000/năm = 500.000/10 năm).
//
// Business rules đã chốt (audit 10-year data scale):
//   1. Một số điện thoại CÓ THỂ mua nhiều gói (gia đình dùng chung).
//   2. KHÔNG dùng phoneNormalized để CHẶN CỨNG mua thêm.
//   3. phoneNormalized chỉ dùng để search/gợi ý duplicate MỀM.
//   4. KHÔNG tự động merge khách (cần xác nhận thủ công).
//   5. Customer là hồ sơ trung tâm; salesTransactions là từng giao dịch.
//   6. Giao dịch CŨ chưa có customerId VẪN HỢP LỆ (không phá schema).
//   7. PR này KHÔNG migration, KHÔNG đụng salesTransactions, KHÔNG UI.
//
// Phase tiếp theo (theo roadmap):
//   - PR-DATA-02: search + soft dupe trong /nhap
//   - PR-DATA-03: link customerId vào tx mới (giữ snapshot)
//   - PR-DATA-04: customer detail page + lịch sử mua/payment/refund

import type { BranchId } from '../branches';

/** Trạng thái khách hàng — dùng cho filter list. */
export type CustomerStatus = 'lead' | 'active' | 'inactive' | 'lost';

/** Nhãn loại SĐT — cho gia đình dùng chung số. */
export type CustomerPhoneLabel =
  | 'primary'
  | 'father'
  | 'mother'
  | 'guardian'
  | 'other';

/** SĐT trong danh sách phones[] của customer. */
export interface CustomerPhone {
  /** SĐT raw (giữ format nhập, hiển thị UI). */
  phone: string;
  /** SĐT đã normalize (chỉ digit, prefix 0) — dùng search/dedupe mềm. */
  normalized: string;
  /** Label loại SĐT (gia đình). */
  label?: CustomerPhoneLabel;
}

/**
 * Customer master document — collection `customers`.
 *
 * Counter fields (totalRevenue, transactionCount, ...) là EVENTUALLY-CONSISTENT —
 * cập nhật qua cron/trigger khi salesTransactions thay đổi, KHÔNG đảm bảo atomic
 * với mọi giao dịch. Báo cáo chính xác PHẢI aggregate từ salesTransactions/payments
 * trực tiếp (hoặc qua monthlyBranchSalesSummaries — PR-SUMMARY-01).
 *
 * Counter chỉ phục vụ UI "Khách VIP / Top spender" + customer detail card —
 * không dùng cho báo cáo tài chính.
 */
export interface Customer {
  /** Auto-generated doc id. */
  customerId: string;
  /** Mã human-readable, vd "KH-2026-HM-00012". Build qua buildCustomerCode. */
  customerCode: string;

  /** Tên đầy đủ (giữ format gốc, hiển thị UI). */
  fullName: string;
  /** Tên đã normalize (lowercase, no diacritic) — search prefix. */
  normalizedName: string;

  /** SĐT chính (raw, hiển thị UI). */
  phonePrimary: string;
  /** SĐT chính đã normalize — dedup key chính. */
  phoneNormalized: string;
  /** Tất cả SĐT của khách (gia đình). */
  phones: CustomerPhone[];

  /** Cơ sở đầu tiên/chính. */
  primaryBranchId: BranchId;
  /** Tất cả cơ sở đã giao dịch (array-contains query). */
  branchIds: BranchId[];

  /** Sale chăm sóc (có thể nhiều người qua các năm). */
  assignedSaleIds: string[];

  status: CustomerStatus;
  source?: string | null;
  tags?: string[];

  // Timestamps — set ở server (Firestore Timestamp).
  // Dùng `unknown` để type-safe với cả admin SDK Timestamp + client SDK Timestamp
  // (không lock vào 1 SDK, callsite tự cast theo context).
  createdAt: unknown;
  updatedAt: unknown;
  createdBy: string;

  // Last activity — eventually-consistent.
  lastTransactionAt?: unknown | null;
  lastInteractionAt?: unknown | null;

  // Counters — eventually-consistent. KHÔNG dùng cho báo cáo tài chính.
  totalRevenue: number;
  totalCollected: number;
  totalDebt: number;

  transactionCount: number;
  enrollmentCount: number;
  refundCount: number;
}

/**
 * Subset Customer dùng cho create draft client-side — không có id/timestamps
 * (server sẽ set). Caller build qua buildCustomerDraft().
 */
export type CustomerDraft = Omit<Customer, 'customerId' | 'createdAt' | 'updatedAt'>;
