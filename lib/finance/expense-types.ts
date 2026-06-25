// PR-CASH1B (2026-06-23) — Types cho chi phí cơ sở (branchDailyExpenses).
//
// Workflow chốt v3 docs: KHÔNG có approval workflow chi. Status 4 mức:
//   draft     — đang nhập (NV_KE chưa confirm)
//   recorded  — đã ghi nhận (vào báo cáo)
//   returned  — TP_KE trả lại để bổ sung
//   voided    — đã hủy/điều chỉnh
//
// PaymentMethod 4 enum: cash / transfer / card / other (align daily-summary API
// naming. 'other' chỉ cho expense — revenue daily-summary chỉ 3 enum).

import type { Timestamp } from 'firebase-admin/firestore';
import type { BranchId } from '@/lib/branches';

/** 4 phương thức chi — align daily-summary naming. */
export type ExpensePaymentMethod = 'cash' | 'transfer' | 'card' | 'other';

export const EXPENSE_PAYMENT_METHOD_LABEL: Record<ExpensePaymentMethod, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  card: 'Quẹt thẻ',
  other: 'Khác',
};

/** Status workflow. KHÔNG có approval — TP_KE chỉ kiểm tra cấp REPORT. */
export type ExpenseStatus = 'draft' | 'recorded' | 'returned' | 'voided';

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: 'Nháp',
  recorded: 'Đã ghi nhận',
  returned: 'Trả lại để bổ sung',
  voided: 'Đã hủy',
};

/** Nhóm chi. */
export type ExpenseCategory =
  | 'vat_tu'
  | 'sua_chua'
  | 'canteen'
  | 'nhan_su'
  | 'dien_nuoc'
  | 'marketing'
  | 'su_kien'
  | 'thue_ngoai'
  | 'van_phong_pham'
  | 'khac';

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  vat_tu: 'Vật tư',
  sua_chua: 'Sửa chữa',
  canteen: 'Căng tin',
  nhan_su: 'Nhân sự',
  dien_nuoc: 'Điện nước',
  marketing: 'Marketing',
  su_kien: 'Sự kiện',
  thue_ngoai: 'Thuê ngoài',
  van_phong_pham: 'Văn phòng phẩm',
  khac: 'Khác',
};

/** Cơ sở của khoản chi (kế toán chi khi đã có đề xuất duyệt / lệnh từ cấp trên BÊN NGOÀI app). */
export type ExpenseBasisType =
  | 'approved_request'    // đề xuất chi đã duyệt (ngoài app)
  | 'management_order'    // lệnh chi từ cấp trên
  | 'direct_invoice'      // hóa đơn trực tiếp (vd điện nước định kỳ)
  | 'other';

export const EXPENSE_BASIS_TYPE_LABEL: Record<ExpenseBasisType, string> = {
  approved_request: 'Đề xuất chi đã duyệt',
  management_order: 'Lệnh chi cấp trên',
  direct_invoice: 'Hóa đơn trực tiếp',
  other: 'Khác',
};

/** branchDailyExpenses/{auto-id} */
export interface BranchDailyExpenseDoc {
  voucherNo: string;            // Số chứng từ (NV_KE nhập tay PR đầu — chốt #11)
  date: string;                 // 'YYYY-MM-DD' — ngày chi
  month: string;                // 'YYYY-MM' (denormalize)
  branchId: BranchId;
  branchName: string;

  // Content
  description: string;
  amount: number;               // VND integer
  paymentMethod: ExpensePaymentMethod;
  expenseCategory: ExpenseCategory;

  // Counterparty
  counterpartyName: string;
  counterpartyUnit: string | null;
  counterpartyAddress: string | null;

  // Cơ sở khoản chi (đề xuất/lệnh bên ngoài app)
  expenseBasisType: ExpenseBasisType;
  expenseBasisRef: string | null;       // Số đề xuất / số lệnh nếu có
  expenseBasisNote: string | null;

  note: string | null;

  // PR-CASH-EXPENSE-BANK-ACCOUNT (2026-06-24): tài khoản ngân hàng NGUỒN khi
  // paymentMethod='transfer'. Bắt buộc khi record (status='recorded'). Với các
  // method khác (cash/card/other) phải = null. Optional vì doc CŨ chưa có field
  // — caller dùng `?? null` để safe-read (BC). Max 120 ký tự.
  transferFromAccount?: string | null;

  // Status
  status: ExpenseStatus;

  // Audit metadata
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  createdAt: Timestamp;

  updatedBy: string | null;
  updatedAt: Timestamp;

  recordedBy: string | null;
  recordedAt: Timestamp | null;

  returnedBy: string | null;
  returnedAt: Timestamp | null;
  returnReason: string | null;

  voidedBy: string | null;
  voidedAt: Timestamp | null;
  voidReason: string | null;

  // Reference back tới report ngày (set khi gom vào DailyCashflowReport)
  cashflowReportId: string | null;
}

/** POST /api/finance/expenses input. */
export interface CreateExpenseInput {
  voucherNo: string;
  date: string;
  branchId: BranchId;
  description: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  expenseCategory: ExpenseCategory;
  counterpartyName: string;
  counterpartyUnit?: string | null;
  counterpartyAddress?: string | null;
  expenseBasisType: ExpenseBasisType;
  expenseBasisRef?: string | null;
  expenseBasisNote?: string | null;
  note?: string | null;
  /** PR-CASH-EXPENSE-BANK-ACCOUNT (2026-06-24). Required nếu action='record'
   *  + paymentMethod='transfer'. Bỏ qua nếu method khác (server force null). */
  transferFromAccount?: string | null;
  /** Nếu 'record' → status='recorded' ngay. Default 'draft'. */
  action?: 'draft' | 'record';
}

/** PATCH /api/finance/expenses/[id] input. Chỉ editable nếu status=draft|returned. */
export interface UpdateExpenseInput {
  voucherNo?: string;
  description?: string;
  amount?: number;
  paymentMethod?: ExpensePaymentMethod;
  expenseCategory?: ExpenseCategory;
  counterpartyName?: string;
  counterpartyUnit?: string | null;
  counterpartyAddress?: string | null;
  expenseBasisType?: ExpenseBasisType;
  expenseBasisRef?: string | null;
  expenseBasisNote?: string | null;
  note?: string | null;
  transferFromAccount?: string | null;
}

export const VALID_EXPENSE_PAYMENT_METHODS: ReadonlySet<string> = new Set([
  'cash', 'transfer', 'card', 'other',
]);
export const VALID_EXPENSE_STATUSES: ReadonlySet<string> = new Set([
  'draft', 'recorded', 'returned', 'voided',
]);
export const VALID_EXPENSE_CATEGORIES: ReadonlySet<string> = new Set([
  'vat_tu', 'sua_chua', 'canteen', 'nhan_su', 'dien_nuoc',
  'marketing', 'su_kien', 'thue_ngoai', 'van_phong_pham', 'khac',
]);
export const VALID_EXPENSE_BASIS_TYPES: ReadonlySet<string> = new Set([
  'approved_request', 'management_order', 'direct_invoice', 'other',
]);
