// Phase B.2 (2026-06-07): Re-export Branch types từ lib/branches.ts (đã là single source).

export type { BranchId, BranchMeta } from '../branches';
export { BRANCH_IDS, BRANCHES, BRANCH_BY_ID, isBranchId, branchName, branchShortName } from '../branches';
