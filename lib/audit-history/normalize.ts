// PR-7B (2026-06-23) — Normalize 2 audit schema về AuditHistoryEntry.
//
// 2 source schemas:
//   A. salesAuditLogs (M2.1 PR-1 schema mới — SalesAuditLogDoc):
//      { changedAt, changedBy, changedByName, changedByRole, action, module,
//        branchId, month, batchId, transactionId, programId,
//        field, oldValue, newValue, reason, ip }
//   A'. salesAuditLogs LEGACY (writeSalesAudit Phase 2 — thiếu fields):
//      { changedAt, changedBy, changedByName, action ('approved'|'return'|'edit_field'|...),
//        batchId, transactionId, field, oldValue, newValue, reason }
//      → KHÔNG có: branchId, month, changedByRole, module, programId, ip
//   B. auditLogs generic (writeAuditLog — module='sales'):
//      { createdAt, userId, actor_name, actor_role, action, module, branchId,
//        before, after, source, details, instanceId?, templateId? }
//      → KHÔNG có: month, changedAt, transactionId, programId, oldValue/newValue, field
//
// Strategy: fallback `null`/`''` cho field thiếu. Action TOLERANT string.

import type { Timestamp } from 'firebase-admin/firestore';
import type { BranchId } from '@/lib/branches';
import { isBranchId } from '@/lib/branches';
import type { AuditHistoryEntry, AuditSource } from './types';

// ─── Helper: extract millis từ Timestamp | Date | string | number ───────────

function toMillis(v: unknown): number {
  if (!v) return 0;
  // firebase-admin Timestamp
  if (typeof v === 'object' && v !== null && typeof (v as any).toMillis === 'function') {
    try { return (v as Timestamp).toMillis(); } catch { return 0; }
  }
  // Date
  if (v instanceof Date) return v.getTime();
  // ISO string
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  // millis number
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}

function safeBranchId(v: unknown): BranchId | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  return isBranchId(v) ? (v as BranchId) : null;
}

function safeString(v: unknown, def = ''): string {
  if (v === null || v === undefined) return def;
  if (typeof v === 'string') return v;
  return String(v);
}

// ─── Normalize functions ───────────────────────────────────────────────────

/** salesAuditLogs (cả M2.1 mới + writeSalesAudit legacy) → AuditHistoryEntry.
 *  Field thiếu (legacy) fallback `null`/`''`. UI tự hiển thị "—" hoặc skip trong filter. */
export function normalizeSalesAuditLog(id: string, data: Record<string, any>): AuditHistoryEntry {
  const ms = toMillis(data.changedAt);
  const actorId = safeString(data.changedBy);
  const actorName = safeString(data.changedByName);
  const actorRole = safeString(data.changedByRole);  // legacy không có → ''

  return {
    id,
    source: 'salesAuditLogs' as AuditSource,
    occurredAtMs: ms,
    changedAtMs: ms,
    actorId,
    actorName,
    actorRole,
    changedBy: actorId,
    changedByName: actorName,
    changedByRole: actorRole,
    module: safeString(data.module),                  // legacy → ''
    branchId: safeBranchId(data.branchId),            // legacy → null
    month: safeString(data.month),                    // legacy → ''
    batchId: data.batchId ?? null,
    transactionId: data.transactionId ?? null,
    programId: data.programId ?? null,
    action: safeString(data.action),
    field: data.field ?? null,
    oldValue: data.oldValue ?? null,
    newValue: data.newValue ?? null,
    before: null,                                     // không applicable
    after: null,                                      // không applicable
    reason: data.reason ?? null,
    ip: data.ip ?? null,
  };
}

/** auditLogs generic (writeAuditLog) → AuditHistoryEntry.
 *  Schema khác: createdAt thay vì changedAt, before/after thay vì oldValue/newValue,
 *  actor_name/actor_role snake_case, không có month/transactionId/programId/field. */
export function normalizeGenericAuditLog(id: string, data: Record<string, any>): AuditHistoryEntry {
  const ms = toMillis(data.createdAt);
  const actorId = safeString(data.userId);
  const actorName = safeString(data.actor_name);
  const actorRole = safeString(data.actor_role);

  return {
    id,
    source: 'auditLogs' as AuditSource,
    occurredAtMs: ms,
    changedAtMs: ms,
    actorId,
    actorName,
    actorRole,
    changedBy: actorId,
    changedByName: actorName,
    changedByRole: actorRole,
    module: safeString(data.module),
    branchId: safeBranchId(data.branchId),
    month: '',                                        // auditLogs generic không có month
    batchId: null,                                    // không có (chỉ tasks/checklist dùng instanceId)
    transactionId: null,                              // không có
    programId: null,                                  // không có explicit field; có trong after.id nếu là program
    action: safeString(data.action),
    field: null,                                      // generic không có field
    oldValue: null,                                   // không applicable
    newValue: null,                                   // không applicable
    before: data.before ?? null,
    after: data.after ?? null,
    reason: null,                                     // generic không có reason explicit
    ip: null,                                         // không có
  };
}

// ─── Merge + sort ──────────────────────────────────────────────────────────

/** Merge nhiều array AuditHistoryEntry → 1 array sort DESC theo occurredAtMs.
 *  Tie-break stability: occurredAtMs DESC → source ('salesAuditLogs' < 'auditLogs' alphabetical)
 *  → id ASC. Đảm bảo deterministic order khi 2 doc cùng millis. */
export function mergeAuditEntries(...batches: AuditHistoryEntry[][]): AuditHistoryEntry[] {
  const flat: AuditHistoryEntry[] = [];
  for (const b of batches) flat.push(...b);
  flat.sort((a, b) => {
    if (a.occurredAtMs !== b.occurredAtMs) return b.occurredAtMs - a.occurredAtMs;  // DESC
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return flat;
}
