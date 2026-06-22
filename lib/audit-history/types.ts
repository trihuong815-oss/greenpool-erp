// PR-7A (2026-06-22) / PR-7B (2026-06-23 extended) — Display types cho Audit History.
//
// PR-7B: extend để cover 2 nguồn:
//   - salesAuditLogs (2 shape: M2.1 đầy đủ vs legacy writeSalesAudit thiếu branchId/month/role)
//   - auditLogs generic (module='sales') — schema khác (createdAt vs changedAt, before/after vs old/new)
//
// Normalize → 1 shape thống nhất (AuditHistoryEntry). UI render qua source badge + fallback display.

import type { BranchId } from '@/lib/branches';

/** Nguồn audit log — UI hiển thị badge phân biệt. */
export type AuditSource = 'salesAuditLogs' | 'auditLogs';

/** Shape entry trả về từ /api/audit-history — consumed bởi UI.
 *  PR-7B (2026-06-23): thêm `source` + `occurredAtMs` (rename từ `changedAtMs` cho neutral),
 *  + `before`/`after` (cho auditLogs generic) + `actorId/actorName/actorRole` (rename neutral).
 *  Giữ `changedBy/changedByName/changedByRole/changedAtMs` cho backward compat.
 */
export interface AuditHistoryEntry {
  id: string;
  /** PR-7B: nguồn collection. */
  source: AuditSource;

  // Time — neutral name, PR-7B
  /** Milli UTC. Map từ salesAuditLogs.changedAt hoặc auditLogs.createdAt. */
  occurredAtMs: number;
  /** Backward compat alias = occurredAtMs (UI cũ đọc field này). */
  changedAtMs: number;

  // Actor — neutral PR-7B + backward compat
  actorId: string;
  actorName: string;
  actorRole: string;
  /** Backward compat aliases. */
  changedBy: string;
  changedByName: string;
  changedByRole: string;

  // Scope
  module: string;
  branchId: BranchId | null;
  month: string;
  batchId: string | null;
  transactionId: string | null;
  programId: string | null;

  // Action (TOLERANT string)
  action: string;
  field: string | null;

  // Diff — 2 schema khác:
  //   salesAuditLogs: oldValue / newValue (per-field)
  //   auditLogs:      before / after (whole object)
  // Em GIỮ CẢ 2 — UI tự switch theo source. KHÔNG ép cùng tên để tránh mất context.
  oldValue: unknown;
  newValue: unknown;
  before: unknown;
  after: unknown;

  // Context
  reason: string | null;
  ip: string | null;
}

/** API response shape — PR-7B same as PR-7A. */
export interface AuditHistoryResponse {
  items: AuditHistoryEntry[];
  /** Cursor cho page tiếp theo. null = hết. Client truyền lại ở param `cursor`. */
  nextCursor: string | null;
  /** Số bản ghi trả về trong page này. */
  count: number;
  /** PR-7B: cảnh báo nếu 1 source fail (vd thiếu index) — UI hiển thị banner riêng. */
  warnings?: string[];
}
