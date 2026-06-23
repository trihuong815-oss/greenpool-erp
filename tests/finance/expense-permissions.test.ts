// PR-CASH1B (2026-06-23) — Test expense-permissions.

import { describe, it, expect } from 'vitest';
import {
  canCreateExpense,
  canEditExpense,
  canRecordExpense,
  canReturnExpense,
  canVoidExpense,
  canDeleteExpense,
  canReadExpense,
  getExpenseBranchScope,
  isValidStatusTransition,
} from '@/lib/finance/expense-permissions';
import type { BranchDailyExpenseDoc } from '@/lib/finance/expense-types';

function expense(over: Partial<BranchDailyExpenseDoc> = {}): BranchDailyExpenseDoc {
  return {
    voucherNo: 'PC-001',
    date: '2026-06-23',
    month: '2026-06',
    branchId: 'HM' as any,
    branchName: 'HM',
    description: 'Test',
    amount: 100000,
    paymentMethod: 'cash',
    expenseCategory: 'vat_tu',
    counterpartyName: 'A',
    counterpartyUnit: null,
    counterpartyAddress: null,
    expenseBasisType: 'direct_invoice',
    expenseBasisRef: null,
    expenseBasisNote: null,
    note: null,
    status: 'draft',
    createdBy: 'nvke-hm',
    createdByName: 'NV KE HM',
    createdByRole: 'NV_KE',
    createdAt: {} as any,
    updatedBy: null,
    updatedAt: {} as any,
    recordedBy: null,
    recordedAt: null,
    returnedBy: null,
    returnedAt: null,
    returnReason: null,
    voidedBy: null,
    voidedAt: null,
    voidReason: null,
    cashflowReportId: null,
    ...over,
  };
}

// ─── canCreateExpense ──────────────────────────────────────────────────

describe('canCreateExpense', () => {
  it('NV_KE → true', () => expect(canCreateExpense('NV_KE')).toBe(true));
  it('ADMIN → true', () => expect(canCreateExpense('ADMIN')).toBe(true));
  it.each(['CEO', 'CHU_TICH', 'TP_KE', 'TP_GS', 'THU_QUY', 'QLCS_HM', 'NV_SALE', 'GD_KD'])(
    '%s → false', (role) => expect(canCreateExpense(role)).toBe(false),
  );
  it('null → false', () => expect(canCreateExpense(null)).toBe(false));
});

// ─── canEditExpense ────────────────────────────────────────────────────

describe('canEditExpense', () => {
  it('NV_KE own branch + draft → true', () => {
    const e = expense({ status: 'draft' });
    expect(canEditExpense('NV_KE', 'nvke-hm', 'HM', e)).toBe(true);
  });

  it('NV_KE own branch + returned → true', () => {
    const e = expense({ status: 'returned' });
    expect(canEditExpense('NV_KE', 'nvke-hm', 'HM', e)).toBe(true);
  });

  it('NV_KE own branch + recorded → false', () => {
    const e = expense({ status: 'recorded' });
    expect(canEditExpense('NV_KE', 'nvke-hm', 'HM', e)).toBe(false);
  });

  it('NV_KE other branch → false', () => {
    const e = expense({ branchId: 'TK' as any, status: 'draft' });
    expect(canEditExpense('NV_KE', 'nvke-hm', 'HM', e)).toBe(false);
  });

  it('NV_KE not creator → false', () => {
    const e = expense({ createdBy: 'other-uid', status: 'draft' });
    expect(canEditExpense('NV_KE', 'nvke-hm', 'HM', e)).toBe(false);
  });

  it('TP_KE → false (không tự edit phiếu chi)', () => {
    expect(canEditExpense('TP_KE', 'tpke', 'HM', expense())).toBe(false);
  });

  it('ADMIN → true (bypass)', () => {
    expect(canEditExpense('ADMIN', 'admin', 'HM', expense({ status: 'recorded' }))).toBe(true);
  });
});

// ─── canRecordExpense ──────────────────────────────────────────────────

describe('canRecordExpense', () => {
  it('NV_KE own branch + draft → true', () => {
    expect(canRecordExpense('NV_KE', 'nvke-hm', 'HM', expense({ status: 'draft' }))).toBe(true);
  });

  it('NV_KE own branch + returned → true (sửa rồi record lại)', () => {
    expect(canRecordExpense('NV_KE', 'nvke-hm', 'HM', expense({ status: 'returned' }))).toBe(true);
  });

  it('NV_KE + already recorded → false', () => {
    expect(canRecordExpense('NV_KE', 'nvke-hm', 'HM', expense({ status: 'recorded' }))).toBe(false);
  });
});

// ─── canReturnExpense / canVoidExpense ─────────────────────────────────

describe('canReturnExpense', () => {
  it('TP_KE + recorded → true', () => {
    expect(canReturnExpense('TP_KE', expense({ status: 'recorded' }))).toBe(true);
  });

  it('TP_KE + draft → false', () => {
    expect(canReturnExpense('TP_KE', expense({ status: 'draft' }))).toBe(false);
  });

  it('NV_KE → false', () => {
    expect(canReturnExpense('NV_KE', expense({ status: 'recorded' }))).toBe(false);
  });

  it('TP_GS → false', () => {
    expect(canReturnExpense('TP_GS', expense({ status: 'recorded' }))).toBe(false);
  });
});

describe('canVoidExpense', () => {
  it('TP_KE + recorded → true', () => {
    expect(canVoidExpense('TP_KE', expense({ status: 'recorded' }))).toBe(true);
  });

  it('ADMIN + recorded → true', () => {
    expect(canVoidExpense('ADMIN', expense({ status: 'recorded' }))).toBe(true);
  });

  it('NV_KE → false', () => {
    expect(canVoidExpense('NV_KE', expense({ status: 'recorded' }))).toBe(false);
  });
});

// ─── canDeleteExpense (draft only) ─────────────────────────────────────

describe('canDeleteExpense', () => {
  it('NV_KE own branch + draft → true', () => {
    expect(canDeleteExpense('NV_KE', 'nvke-hm', 'HM', expense({ status: 'draft' }))).toBe(true);
  });

  it('NV_KE + recorded → false (phải void)', () => {
    expect(canDeleteExpense('NV_KE', 'nvke-hm', 'HM', expense({ status: 'recorded' }))).toBe(false);
  });

  it('NV_KE other branch → false', () => {
    const e = expense({ branchId: 'TK' as any });
    expect(canDeleteExpense('NV_KE', 'nvke-hm', 'HM', e)).toBe(false);
  });
});

// ─── canReadExpense ────────────────────────────────────────────────────

describe('canReadExpense', () => {
  it.each([
    'CEO', 'CHU_TICH', 'ADMIN', 'GD_KD', 'GD_VP', 'TP_KE', 'TP_GS', 'THU_QUY',
  ])('%s → read all branches', (role) => {
    expect(canReadExpense(role, null, expense({ branchId: 'HM' as any }))).toBe(true);
    expect(canReadExpense(role, null, expense({ branchId: 'TT' as any }))).toBe(true);
  });

  it('NV_KE own branch → true', () => {
    expect(canReadExpense('NV_KE', 'HM', expense({ branchId: 'HM' as any }))).toBe(true);
  });

  it('NV_KE other branch → false', () => {
    expect(canReadExpense('NV_KE', 'HM', expense({ branchId: 'TK' as any }))).toBe(false);
  });

  it('QLCS_HM own branch → true', () => {
    expect(canReadExpense('QLCS_HM', 'HM', expense({ branchId: 'HM' as any }))).toBe(true);
  });

  it('QLCS_HM other branch → false', () => {
    expect(canReadExpense('QLCS_HM', 'HM', expense({ branchId: 'TK' as any }))).toBe(false);
  });

  it('NV_SALE → false', () => {
    expect(canReadExpense('NV_SALE', 'HM', expense())).toBe(false);
  });
});

// ─── getExpenseBranchScope ─────────────────────────────────────────────

describe('getExpenseBranchScope', () => {
  it('top role → allBranches=true', () => {
    expect(getExpenseBranchScope('TP_KE', null)).toEqual({ allBranches: true, branchId: null });
    expect(getExpenseBranchScope('THU_QUY', null)).toEqual({ allBranches: true, branchId: null });
  });

  it('NV_KE → scope branchId own', () => {
    expect(getExpenseBranchScope('NV_KE', 'HM')).toEqual({ allBranches: false, branchId: 'HM' });
  });

  it('QLCS_HM → scope branchId own', () => {
    expect(getExpenseBranchScope('QLCS_HM', 'HM')).toEqual({ allBranches: false, branchId: 'HM' });
  });

  it('Sale role → no access', () => {
    expect(getExpenseBranchScope('NV_SALE', 'HM')).toEqual({ allBranches: false, branchId: null });
  });
});

// ─── isValidStatusTransition ───────────────────────────────────────────

describe('isValidStatusTransition', () => {
  it('draft → recorded ok', () => expect(isValidStatusTransition('draft', 'recorded')).toBe(true));
  it('draft → voided ok', () => expect(isValidStatusTransition('draft', 'voided')).toBe(true));
  it('draft → returned NO', () => expect(isValidStatusTransition('draft', 'returned')).toBe(false));
  it('recorded → returned ok', () => expect(isValidStatusTransition('recorded', 'returned')).toBe(true));
  it('recorded → voided ok', () => expect(isValidStatusTransition('recorded', 'voided')).toBe(true));
  it('recorded → draft NO', () => expect(isValidStatusTransition('recorded', 'draft')).toBe(false));
  it('returned → recorded ok', () => expect(isValidStatusTransition('returned', 'recorded')).toBe(true));
  it('voided → anything NO', () => {
    expect(isValidStatusTransition('voided', 'draft')).toBe(false);
    expect(isValidStatusTransition('voided', 'recorded')).toBe(false);
  });
});
