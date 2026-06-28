// Phase B.2 (2026-06-07): Barrel — single import entry cho mọi domain type.
// Usage: import { Task, UserDoc, BranchId } from '@/lib/types';

// Tasks domain
export type {
  Task, TaskStatus, TaskKind, TaskPriority,
  ProposalType, FinancialGroup, ApprovalStep, RevisionRequest, Block,
} from './tasks';
export { ROLE_LABEL_VN, roleLabelVN } from './tasks';

// Users domain
export type { UserDoc, UserPublic, FcmDevice, CallerProfile } from './users';

// PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29): Customer master types.
// PR-01 chỉ export type — helpers ở @/lib/customers; CHƯA wire vào runtime.
export type {
  Customer, CustomerDraft, CustomerStatus, CustomerPhone, CustomerPhoneLabel,
} from './customers';

// Branches domain
export type { BranchId, BranchMeta } from './branches';
export {
  BRANCH_IDS, BRANCHES, BRANCH_BY_ID,
  isBranchId, branchName, branchShortName,
} from './branches';

// LEGACY re-exports (tạm thời giữ để không break existing imports).
// Sẽ deprecation warning rồi xóa Phase B.3.
export type {
  FacilityId, BlockId, DeptId,
  Facility, Department, Role, Profile, ProfileWithRole,
  Task as LegacyTask,
  Proposal as LegacyProposal,
} from '../types-legacy';
