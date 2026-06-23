// PR-CASH1F-UNLOCK (2026-06-23) — canUnlockDailyCashflowReport permission matrix.

import { describe, it, expect } from 'vitest';
import { canUnlockDailyCashflowReport } from '@/lib/finance/cashflow-report-permissions';
import type { DailyCashflowReportStatus } from '@/lib/finance/cashflow-report-types';

function rep(status: DailyCashflowReportStatus) { return { status }; }

describe('canUnlockDailyCashflowReport per role', () => {
  it('TP_KE có thể unlock report status=locked', () => {
    expect(canUnlockDailyCashflowReport('TP_KE', rep('locked'))).toBe(true);
  });

  it('ADMIN có thể unlock report status=locked', () => {
    expect(canUnlockDailyCashflowReport('ADMIN', rep('locked'))).toBe(true);
  });

  it('NV_KE KHÔNG được unlock', () => {
    expect(canUnlockDailyCashflowReport('NV_KE', rep('locked'))).toBe(false);
  });

  it('QLCS_HM KHÔNG được unlock', () => {
    expect(canUnlockDailyCashflowReport('QLCS_HM', rep('locked'))).toBe(false);
  });

  it('THU_QUY KHÔNG được unlock', () => {
    expect(canUnlockDailyCashflowReport('THU_QUY', rep('locked'))).toBe(false);
  });

  it('TP_GS KHÔNG được unlock', () => {
    expect(canUnlockDailyCashflowReport('TP_GS', rep('locked'))).toBe(false);
  });

  it('NV_SALE KHÔNG được unlock', () => {
    expect(canUnlockDailyCashflowReport('NV_SALE', rep('locked'))).toBe(false);
  });

  it.each(['CEO', 'CHU_TICH', 'GD_VP', 'GD_KD'])(
    '%s KHÔNG được unlock (chỉ TP_KE/ADMIN)',
    (role) => expect(canUnlockDailyCashflowReport(role, rep('locked'))).toBe(false),
  );

  it('Role rỗng/null/undefined → false', () => {
    expect(canUnlockDailyCashflowReport(null, rep('locked'))).toBe(false);
    expect(canUnlockDailyCashflowReport(undefined, rep('locked'))).toBe(false);
    expect(canUnlockDailyCashflowReport('', rep('locked'))).toBe(false);
  });
});

describe('canUnlockDailyCashflowReport per status', () => {
  for (const role of ['TP_KE', 'ADMIN']) {
    it(`${role} CHỈ unlock status=locked, các status khác đều DENY`, () => {
      const others: DailyCashflowReportStatus[] = ['draft', 'submitted', 'sent', 'checked', 'returned'];
      for (const s of others) {
        expect(canUnlockDailyCashflowReport(role, rep(s))).toBe(false);
      }
      expect(canUnlockDailyCashflowReport(role, rep('locked'))).toBe(true);
    });
  }
});
