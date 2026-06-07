// Phase B.2 (2026-06-07): Canonical Task types.
// Audit CRITICAL #3: Task type duplicate ở 4 file → schema drift bug (vd `quantity` vs `qty`).
// File này là SINGLE SOURCE OF TRUTH cho Task domain.
//
// Re-export từ lib/services/tasks/api-client.ts để giữ backward compat (đó là nơi
// đầu tiên define types này, đã được dùng nhiều). Future: move definition về đây
// hoàn toàn ở Phase B.3.

export type {
  Task,
  TaskStatus,
  TaskKind,
  TaskPriority,
  ProposalType,
  FinancialGroup,
  ApprovalStep,
  RevisionRequest,
  Block,
} from '../services/tasks/api-client';

export { ROLE_LABEL_VN, roleLabelVN } from '../services/tasks/api-client';
