// Audit log writer — chuẩn auditLogs (Phase 1.5+).
//
// Format đích — collection `auditLogs/{logId}`:
//   { action, module, userId, branchId, before, after, createdAt,
//     // Denormalized cho UI đọc nhanh không phải lookup users:
//     actor_name, actor_role,
//     // Module-specific anchor để query nhanh:
//     instanceId?: string,    // chỉ cho module='checklist'
//     templateId?: string,    // chỉ cho module='templates'
//     // Back-compat: UI cũ đọc trường này thay vì before/after:
//     details?: object | null,
//   }
//
// Phase 1.5 đã DROP dual-write vào collection cũ `checklistAuditLogs`
// (legacy entries đã migrate qua `auditLogs/legacy_*`).

import 'server-only';
import { getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';

export type AuditModule = 'checklist' | 'sales' | 'users' | 'templates' | 'dashboard' | 'giaoviec' | 'ky-thuat' | 'proposals';

export interface AuditLogEntry {
  action: string;
  module: AuditModule;
  userId: string;
  branchId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  // Optional metadata theo spec migration:
  source?: string;                  // 'api' | 'ui' | 'script' | 'cron'... — mặc định 'api'
  migrationVersion?: string;        // chỉ cho entries do migration tạo
  // Optional denormalized cho UI:
  actorName?: string;
  actorRole?: string;
  // Optional anchor để query nhanh (1 trong 2 tuỳ module):
  instanceId?: string;
  templateId?: string;
  // Optional back-compat blob (UI cũ đọc field này):
  details?: Record<string, unknown> | null;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const db = getFirebaseAdminDb();
  const now = new Date();

  const doc: Record<string, unknown> = {
    action: entry.action,
    module: entry.module,
    userId: entry.userId,
    branchId: entry.branchId,
    before: entry.before,
    after: entry.after,
    createdAt: now,
    source: entry.source ?? 'api',
    actor_name: entry.actorName ?? '',
    actor_role: entry.actorRole ?? '',
    details: entry.details ?? null,
  };
  if (entry.instanceId) doc.instanceId = entry.instanceId;
  if (entry.templateId) doc.templateId = entry.templateId;
  if (entry.migrationVersion) doc.migrationVersion = entry.migrationVersion;

  await db.collection(COLLECTIONS.AUDIT_LOGS).add(doc);
}
