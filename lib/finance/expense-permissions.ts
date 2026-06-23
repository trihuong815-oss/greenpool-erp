// PR-CASH1B (2026-06-23) — Permission helpers cho branchDailyExpenses.
//
// Workflow: KHÔNG có approval. Chỉ NV_KE branch mình tạo/sửa, TP_KE check ở report level.
// PR đầu QLCS chỉ read own branch (defer create), Sale deny.

import type { ExpenseStatus, BranchDailyExpenseDoc } from './expense-types';

const TOP_READ_ROLES: ReadonlySet<string> = new Set([
  'CEO', 'CHU_TICH', 'ADMIN', 'GD_KD', 'GD_VP', 'TP_KE', 'TP_GS', 'THU_QUY',
]);

function isQLCS(roleCode: string): boolean {
  return roleCode.startsWith('QLCS_');
}

/** Tạo phiếu chi: NV_KE branch mình OR ADMIN. */
export function canCreateExpense(roleCode: string | null | undefined): boolean {
  if (!roleCode) return false;
  return roleCode === 'NV_KE' || roleCode === 'ADMIN';
}

/** Edit phiếu chi: creator (NV_KE) + status='draft'|'returned' branch mình. ADMIN bypass. */
export function canEditExpense(
  roleCode: string | null | undefined,
  callerUid: string,
  callerBranchId: string | null,
  expense: Pick<BranchDailyExpenseDoc, 'createdBy' | 'branchId' | 'status'>,
): boolean {
  if (!roleCode || !callerUid) return false;
  if (roleCode === 'ADMIN') return true;
  if (roleCode !== 'NV_KE') return false;
  if (expense.createdBy !== callerUid) return false;
  if (callerBranchId !== expense.branchId) return false;
  return expense.status === 'draft' || expense.status === 'returned';
}

/** Record (draft → recorded): NV_KE branch mình. */
export function canRecordExpense(
  roleCode: string | null | undefined,
  callerUid: string,
  callerBranchId: string | null,
  expense: Pick<BranchDailyExpenseDoc, 'createdBy' | 'branchId' | 'status'>,
): boolean {
  if (!roleCode || !callerUid) return false;
  if (roleCode === 'ADMIN') return true;
  if (roleCode !== 'NV_KE') return false;
  if (expense.createdBy !== callerUid) return false;
  if (callerBranchId !== expense.branchId) return false;
  return expense.status === 'draft' || expense.status === 'returned';
}

/** Return phiếu chi (recorded → returned): TP_KE + ADMIN. */
export function canReturnExpense(
  roleCode: string | null | undefined,
  expense: Pick<BranchDailyExpenseDoc, 'status'>,
): boolean {
  if (!roleCode) return false;
  if (roleCode !== 'TP_KE' && roleCode !== 'ADMIN') return false;
  return expense.status === 'recorded';
}

/** Void phiếu chi: TP_KE + ADMIN (chỉ recorded). */
export function canVoidExpense(
  roleCode: string | null | undefined,
  expense: Pick<BranchDailyExpenseDoc, 'status'>,
): boolean {
  if (!roleCode) return false;
  if (roleCode !== 'TP_KE' && roleCode !== 'ADMIN') return false;
  return expense.status === 'recorded';
}

/** Delete draft: creator (NV_KE) + status='draft'. */
export function canDeleteExpense(
  roleCode: string | null | undefined,
  callerUid: string,
  callerBranchId: string | null,
  expense: Pick<BranchDailyExpenseDoc, 'createdBy' | 'branchId' | 'status'>,
): boolean {
  if (!roleCode || !callerUid) return false;
  if (roleCode === 'ADMIN') return true;
  if (roleCode !== 'NV_KE') return false;
  if (expense.createdBy !== callerUid) return false;
  if (callerBranchId !== expense.branchId) return false;
  return expense.status === 'draft';
}

/** Read phiếu chi:
 *  - Top role + THU_QUY + TP_GS: all branches
 *  - NV_KE + QLCS: chỉ branch mình */
export function canReadExpense(
  roleCode: string | null | undefined,
  callerBranchId: string | null,
  expense: Pick<BranchDailyExpenseDoc, 'branchId'>,
): boolean {
  if (!roleCode) return false;
  if (TOP_READ_ROLES.has(roleCode)) return true;
  if (roleCode === 'NV_KE' || isQLCS(roleCode)) {
    return callerBranchId === expense.branchId;
  }
  return false;
}

/** Branch filter cho list query — server enforce. */
export function getExpenseBranchScope(
  roleCode: string | null | undefined,
  callerBranchId: string | null,
): { allBranches: boolean; branchId: string | null } {
  if (!roleCode) return { allBranches: false, branchId: null };
  if (TOP_READ_ROLES.has(roleCode)) return { allBranches: true, branchId: null };
  if (roleCode === 'NV_KE' || isQLCS(roleCode)) {
    return { allBranches: false, branchId: callerBranchId };
  }
  return { allBranches: false, branchId: null };
}

/** True nếu transition status hợp lệ. */
const VALID_TRANSITIONS: Record<ExpenseStatus, ReadonlyArray<ExpenseStatus>> = {
  draft:    ['recorded', 'voided'],
  recorded: ['returned', 'voided'],
  returned: ['recorded', 'voided'],
  voided:   [],
};

export function isValidStatusTransition(from: ExpenseStatus, to: ExpenseStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
