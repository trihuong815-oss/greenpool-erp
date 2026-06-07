// Phase B.3 (2026-06-07): Centralized task serialization helpers.
// Audit HIGH #8: serialize + asScope duplicate ở 8 file → sửa shape phải update 8 nơi.
// Đã miss: [taskId]/route.ts:38 asScope KHÔNG có currentApprover field → potential permission bug.
//
// Giờ mọi route import từ đây. Đổi shape 1 chỗ, test bắt regression.

import 'server-only';
import type { TaskForScope } from './tasks-scope';

/**
 * Convert Firestore doc data → JSON-serializable + normalize defaults.
 * Mọi route handler return task data dùng helper này.
 */
export function serializeTask(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    // Convert Firestore Timestamp → ISO string
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
      out[k] = v.toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  // Defensive normalize — đảm bảo UI luôn nhận đúng shape kể cả với legacy docs.
  out.kind = out.kind ?? 'assignment';
  out.assigneeUserIds = Array.isArray(out.assigneeUserIds) ? out.assigneeUserIds : [];
  out.attachments = Array.isArray(out.attachments) ? out.attachments : [];
  out.progressPct = typeof out.progressPct === 'number' ? out.progressPct : 0;
  out.priority = out.priority ?? 'normal';
  out.crossBlock = !!out.crossBlock;
  out.assigneeDeptId = out.assigneeDeptId ?? null;
  out.assigneeFacilityId = out.assigneeFacilityId ?? null;
  out.approvalRequiredFrom = out.approvalRequiredFrom ?? null;
  out.approvedBy = out.approvedBy ?? null;
  out.approvedAt = out.approvedAt ?? null;
  out.rejectionReason = out.rejectionReason ?? null;
  out.dueDate = out.dueDate ?? null;
  // Phase 12.5+ chain fields
  out.approvalChain = Array.isArray(out.approvalChain) ? out.approvalChain : [];
  out.approvalsCompleted = Array.isArray(out.approvalsCompleted) ? out.approvalsCompleted : [];
  out.currentApprover = out.currentApprover ?? null;
  return out;
}

/**
 * Map Firestore doc → TaskForScope (cho canReadTask/canApproveTask checks).
 * Giữ TẤT CẢ fields cần thiết cho permission logic.
 */
export function taskScopeFromDoc(d: Record<string, any>): TaskForScope {
  return {
    createdBy: d.createdBy,
    createdByBlock: d.createdByBlock,
    assigneeBlock: d.assigneeBlock,
    assigneeDeptId: d.assigneeDeptId ?? null,
    assigneeFacilityId: d.assigneeFacilityId ?? null,
    assigneeUserIds: Array.isArray(d.assigneeUserIds) ? d.assigneeUserIds : [],
    status: d.status,
    approvalRequiredFrom: d.approvalRequiredFrom ?? null,
    currentApprover: d.currentApprover ?? null,
  };
}
