// PR-CASH1B (2026-06-23) — Test cashflow-report-permissions.

import { describe, it, expect } from 'vitest';
import {
  canSubmitDailyCashflowReport,
  canReadDailyCashflowReport,
  canCheckDailyCashflowReport,
  canReturnDailyCashflowReport,
  canLockDailyCashflowReport,
  getReportBranchScope,
} from '@/lib/finance/cashflow-report-permissions';
import type { DailyCashflowReportDoc, DailyCashflowReportStatus } from '@/lib/finance/cashflow-report-types';

function report(status: DailyCashflowReportStatus = 'submitted', branchId = 'HM'): Pick<DailyCashflowReportDoc, 'status' | 'branchId'> {
  return { status, branchId: branchId as any };
}

// ─── canSubmitDailyCashflowReport ──────────────────────────────────────

describe('canSubmitDailyCashflowReport (chốt #1: NV_KE only)', () => {
  it('NV_KE own branch → true', () => {
    expect(canSubmitDailyCashflowReport('NV_KE', 'HM', 'HM')).toBe(true);
  });

  it('NV_KE other branch → false', () => {
    expect(canSubmitDailyCashflowReport('NV_KE', 'HM', 'TK')).toBe(false);
  });

  it('ADMIN any branch → true', () => {
    expect(canSubmitDailyCashflowReport('ADMIN', null, 'HM')).toBe(true);
  });

  it.each(['QLCS_HM', 'TP_KE', 'TP_GS', 'THU_QUY', 'CEO', 'CHU_TICH', 'GD_KD', 'GD_VP', 'NV_SALE'])(
    '%s → false (chỉ NV_KE bấm nộp)', (role) => {
      expect(canSubmitDailyCashflowReport(role, 'HM', 'HM')).toBe(false);
    },
  );
});

// ─── canReadDailyCashflowReport ────────────────────────────────────────

describe('canReadDailyCashflowReport', () => {
  it.each([
    'CEO', 'CHU_TICH', 'ADMIN', 'GD_KD', 'GD_VP', 'TP_KE', 'TP_GS', 'THU_QUY',
  ])('%s → read all branches', (role) => {
    expect(canReadDailyCashflowReport(role, null, report('submitted', 'HM'))).toBe(true);
    expect(canReadDailyCashflowReport(role, null, report('submitted', 'TT'))).toBe(true);
  });

  it('NV_KE own branch → true', () => {
    expect(canReadDailyCashflowReport('NV_KE', 'HM', report('submitted', 'HM'))).toBe(true);
  });

  it('NV_KE other branch → false', () => {
    expect(canReadDailyCashflowReport('NV_KE', 'HM', report('submitted', 'TK'))).toBe(false);
  });

  it('QLCS_HM own branch → true', () => {
    expect(canReadDailyCashflowReport('QLCS_HM', 'HM', report('submitted', 'HM'))).toBe(true);
  });

  it('QLCS_HM other branch → false', () => {
    expect(canReadDailyCashflowReport('QLCS_HM', 'HM', report('submitted', 'TT'))).toBe(false);
  });

  it('NV_SALE → false', () => {
    expect(canReadDailyCashflowReport('NV_SALE', 'HM', report())).toBe(false);
  });
});

// ─── canCheckDailyCashflowReport ───────────────────────────────────────

describe('canCheckDailyCashflowReport (TP_KE only)', () => {
  it('TP_KE + submitted → true', () => {
    expect(canCheckDailyCashflowReport('TP_KE', report('submitted'))).toBe(true);
  });

  it('TP_KE + sent → true', () => {
    expect(canCheckDailyCashflowReport('TP_KE', report('sent'))).toBe(true);
  });

  it('TP_KE + draft → false (chưa submit)', () => {
    expect(canCheckDailyCashflowReport('TP_KE', report('draft'))).toBe(false);
  });

  it('TP_KE + checked → false (đã check rồi)', () => {
    expect(canCheckDailyCashflowReport('TP_KE', report('checked'))).toBe(false);
  });

  it('TP_KE + returned → false', () => {
    expect(canCheckDailyCashflowReport('TP_KE', report('returned'))).toBe(false);
  });

  it.each(['NV_KE', 'QLCS_HM', 'TP_GS', 'THU_QUY', 'CEO', 'NV_SALE'])(
    '%s → false', (role) => {
      expect(canCheckDailyCashflowReport(role, report('submitted'))).toBe(false);
    },
  );

  it('ADMIN + submitted → true', () => {
    expect(canCheckDailyCashflowReport('ADMIN', report('submitted'))).toBe(true);
  });
});

// ─── canReturnDailyCashflowReport ──────────────────────────────────────

describe('canReturnDailyCashflowReport', () => {
  it.each(['submitted', 'sent', 'checked'] as const)('TP_KE + %s → true', (s) => {
    expect(canReturnDailyCashflowReport('TP_KE', report(s))).toBe(true);
  });

  it('TP_KE + draft → false', () => {
    expect(canReturnDailyCashflowReport('TP_KE', report('draft'))).toBe(false);
  });

  it('TP_KE + locked → false', () => {
    expect(canReturnDailyCashflowReport('TP_KE', report('locked'))).toBe(false);
  });

  it('NV_KE → false', () => {
    expect(canReturnDailyCashflowReport('NV_KE', report('submitted'))).toBe(false);
  });
});

// ─── canLockDailyCashflowReport ────────────────────────────────────────

describe('canLockDailyCashflowReport (PR-CASH1F)', () => {
  it('ADMIN + checked → true', () => expect(canLockDailyCashflowReport('ADMIN', report('checked'))).toBe(true));
  it('TP_KE + checked → true', () => expect(canLockDailyCashflowReport('TP_KE', report('checked'))).toBe(true));
  it('TP_KE + submitted → false (status không hợp lệ)', () =>
    expect(canLockDailyCashflowReport('TP_KE', report('submitted'))).toBe(false));
  it.each(['NV_KE', 'TP_GS', 'THU_QUY', 'QLCS_HM', 'CEO', 'CHU_TICH', 'GD_KD'])(
    '%s + checked → false (role không hợp lệ)', (role) =>
      expect(canLockDailyCashflowReport(role, report('checked'))).toBe(false),
  );
});

// ─── getReportBranchScope ──────────────────────────────────────────────

describe('getReportBranchScope', () => {
  it.each(['CEO', 'CHU_TICH', 'ADMIN', 'GD_KD', 'GD_VP', 'TP_KE', 'TP_GS', 'THU_QUY'])(
    '%s → allBranches=true', (role) => {
      expect(getReportBranchScope(role, null)).toEqual({ allBranches: true, branchId: null });
    },
  );

  it('NV_KE → scope branchId own', () => {
    expect(getReportBranchScope('NV_KE', 'HM')).toEqual({ allBranches: false, branchId: 'HM' });
  });

  it('QLCS_CTT → scope branchId own', () => {
    expect(getReportBranchScope('QLCS_CTT', 'CTT')).toEqual({ allBranches: false, branchId: 'CTT' });
  });

  it('Sale → no access', () => {
    expect(getReportBranchScope('NV_SALE', 'HM')).toEqual({ allBranches: false, branchId: null });
  });
});
