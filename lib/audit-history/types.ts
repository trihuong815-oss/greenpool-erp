// PR-7A (2026-06-22) — Display types cho Audit History UI/API response.
// KHÔNG re-export SalesAuditLogDoc trực tiếp vì:
//   1. Timestamp serialize → number (millis) ở API → client nhận JSON-safe
//   2. action ở display layer là string tolerant (12 action ngoài enum, xem action-labels.ts)

import type { BranchId } from '@/lib/branches';

/** Shape entry trả về từ /api/audit-history → consumed bởi UI. */
export interface AuditHistoryEntry {
  id: string;

  // Time
  changedAtMs: number;  // Timestamp.toMillis() — JSON-safe

  // Actor
  changedBy: string;
  changedByName: string;
  changedByRole: string;

  // Scope
  module: string;          // 'batch' | 'transaction' | 'program' (string tolerant)
  branchId: BranchId;
  month: string;
  batchId: string | null;
  transactionId: string | null;
  programId: string | null;

  // Action (TOLERANT — không enum closed, xem action-labels.ts)
  action: string;
  field: string | null;

  // Diff (JSON-safe, có thể là unknown shape)
  oldValue: unknown;
  newValue: unknown;

  // Context
  reason: string | null;
  ip: string | null;
}

/** API response shape. */
export interface AuditHistoryResponse {
  items: AuditHistoryEntry[];
  /** Cursor cho page tiếp theo. null = hết. Client truyền lại ở param `cursor`. */
  nextCursor: string | null;
  /** Số bản ghi trả về trong page này. */
  count: number;
}
