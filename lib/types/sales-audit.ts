// Milestone 2.1 PR-1 (2026-06-20) — Foundation types cho audit log + month lock.
// CHƯA wire vào API mutation nào. Chỉ define schema để PR-2/PR-3 dùng.
//
// Audit log:
//   - Dedicated collection `salesAuditLogs`. Append-only. Retention vĩnh viễn
//     (tối thiểu 10 năm). KHÔNG có API xoá.
//   - 1 entry / 1 mutation (create/edit_field/delete/submit/approve/...).
//   - Query nhanh qua composite indexes (xem firestore.indexes.json M2.1 PR-1).
//
// Month lock:
//   - Collection `salesMonthLocks`. DocId deterministic = `${branchId}_${month}`.
//   - Khoá tháng × cơ sở → server middleware (PR-3) chặn mọi mutation lên
//     tx/batch có month + branch khớp lock.
//   - Unlock cần reason + audit + noti CEO/CHU_TICH (anh chốt #4).

import type { Timestamp } from 'firebase-admin/firestore';
import type { BranchId } from './branches';

// ─── Audit log ─────────────────────────────────────────────────────────────

/** Phạm vi mutation — quyết định field nào required (batchId/transactionId/programId). */
export type SalesAuditModule = 'batch' | 'transaction' | 'program';

/** Action enum — closed list để typed-safe. Mở rộng sau qua PR mới (không tự động). */
export type SalesAuditAction =
  // Transaction mutation
  | 'create_tx' | 'edit_field' | 'delete_tx'
  // Batch lifecycle
  | 'submit_batch' | 'approve_batch' | 'return_batch'
  // Program lifecycle (V7 Promo workflow)
  | 'create_program' | 'submit_program' | 'approve_program' | 'reject_program'
  | 'configure_program' | 'pause_program' | 'resume_program'
  | 'auto_expire_program'
  // Month lock
  | 'lock_month' | 'unlock_month'
  // Override (top admin force edit sau khi đã approved/locked — Milestone 2.2)
  | 'override_approved'
  // M2.2 PR-6 (2026-06-20): Export Excel báo cáo doanh số.
  // module='batch' (vì query theo batchId list trong tháng + cơ sở). batchId/transactionId/programId=null.
  | 'export_sales_excel';

/** salesAuditLogs/{auto-id}.
 *  Append-only. Lưu vĩnh viễn ≥10 năm.
 *  Mọi field denormalize tại thời điểm action để query không cần join. */
export interface SalesAuditLogDoc {
  // Scope target — chỉ field thuộc module mới có giá trị, còn lại null.
  module: SalesAuditModule;
  batchId: string | null;
  transactionId: string | null;
  programId: string | null;

  // Action
  action: SalesAuditAction;
  /** Tên field bị sửa khi action='edit_field'. Vd 'collectedToday', 'packageValue', 'promoCode'. */
  field: string | null;
  /** Snapshot giá trị TRƯỚC mutation. JSON-safe (string|number|boolean|null|array|object). */
  oldValue: unknown;
  /** Snapshot giá trị SAU mutation. */
  newValue: unknown;

  // Context — denormalize để query nhanh
  branchId: BranchId;
  /** 'YYYY-MM' — luôn có để filter "audit tháng X cơ sở Y". */
  month: string;

  // Actor
  changedBy: string;        // uid
  changedByName: string;
  changedByRole: string;    // role_code tại thời điểm action (vd 'NV_KE', 'TP_KE', 'CEO')

  // Time + reason
  changedAt: Timestamp;
  /** BẮT BUỘC cho: unlock_month, override_approved, return_batch, reject_program. */
  reason: string | null;

  /** Optional: IP từ request header (x-forwarded-for). Hỗ trợ forensic về sau. */
  ip: string | null;
}

/** Input shape cho helper recordSalesAudit() — caller cung cấp, helper fill metadata. */
export interface RecordSalesAuditInput {
  module: SalesAuditModule;
  action: SalesAuditAction;
  branchId: BranchId;
  month: string;

  // Optional theo module
  batchId?: string | null;
  transactionId?: string | null;
  programId?: string | null;

  // Optional theo action
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;

  // Actor — caller phải truyền (lấy từ AuthedCaller)
  actorUid: string;
  actorName: string;
  actorRole: string;

  // Optional
  ip?: string | null;
}

// ─── Month lock ────────────────────────────────────────────────────────────

/** salesMonthLocks/{`${branchId}_${month}`}. DocId deterministic — idempotent.
 *  unlockHistory: append-only mỗi lần mở khoá. relocked=true khi sau đó lock lại. */
export interface SalesMonthLockDoc {
  branchId: BranchId;
  /** 'YYYY-MM' */
  month: string;

  /** True = tháng đang khoá. False = chưa khoá hoặc đã unlock. */
  locked: boolean;

  // Lock metadata (set khi locked=true; giữ snapshot last lock khi locked=false)
  lockedAt: Timestamp | null;
  lockedBy: string | null;        // uid
  lockedByName: string | null;
  lockedByRole: string | null;    // 'TP_KE'|'CEO'|'CHU_TICH'|'ADMIN'

  /** Lịch sử mọi lần mở khoá — immutable append. */
  unlockHistory: SalesMonthUnlockEntry[];

  // PR-JUNE-LOCK-AND-MARK (2026-06-30) — Test month marker.
  // OPTIONAL & backward-compatible: docs cũ không có 2 field này; UI mặc định
  // coi như non-test. Khi true → /tong-ket banner "Dữ liệu test" + MoM/YTD
  // logic skip month này.
  /** True = tháng này chứa data test (vd June 2026 pre-go-live). KHÔNG cản
   *  mutation (đó là việc của `locked`); chỉ là metadata cho reporting. */
  isTestMonth?: boolean;
  /** Lý do test month — vd "June 2026 pre-go-live test data". Required khi
   *  isTestMonth=true để audit. */
  testReason?: string | null;
  /** Khi marked. Audit trace ai mark. */
  testMarkedAt?: Timestamp | null;
  testMarkedBy?: string | null;          // uid
  testMarkedByName?: string | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SalesMonthUnlockEntry {
  unlockedAt: Timestamp;
  unlockedBy: string;
  unlockedByName: string;
  unlockedByRole: string;
  /** BẮT BUỘC non-empty. */
  reason: string;
  /** True nếu sau đó lock lại — cập nhật khi user thực hiện re-lock. */
  relocked: boolean;
  relockedAt: Timestamp | null;
}

/** Helper-friendly check shape — caller có thể gọi isMonthLocked(...) sync. */
export interface MonthLockState {
  locked: boolean;
  /** Người khoá hiện tại — null nếu chưa locked. */
  lockedByName: string | null;
  /** Thời điểm khoá — null nếu chưa locked. */
  lockedAt: Timestamp | null;
  // PR-JUNE-LOCK-AND-MARK (2026-06-30) — Pass-through test marker.
  isTestMonth?: boolean;
  testReason?: string | null;
}
