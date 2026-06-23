// PR-CASH1F (2026-06-23) — canLockDailyCashflowReport permission matrix.

import { describe, it, expect } from 'vitest';
import { canLockDailyCashflowReport } from '@/lib/finance/cashflow-report-permissions';
import type { DailyCashflowReportStatus } from '@/lib/finance/cashflow-report-types';

function rep(status: DailyCashflowReportStatus) { return { status }; }

describe('canLockDailyCashflowReport per role', () => {
  it('TP_KE có thể lock report status=checked', () => {
    expect(canLockDailyCashflowReport('TP_KE', rep('checked'))).toBe(true);
  });

  it('ADMIN có thể lock report status=checked', () => {
    expect(canLockDailyCashflowReport('ADMIN', rep('checked'))).toBe(true);
  });

  it('NV_KE KHÔNG được lock', () => {
    expect(canLockDailyCashflowReport('NV_KE', rep('checked'))).toBe(false);
  });

  it('QLCS_HM KHÔNG được lock', () => {
    expect(canLockDailyCashflowReport('QLCS_HM', rep('checked'))).toBe(false);
  });

  it('THU_QUY KHÔNG được lock', () => {
    expect(canLockDailyCashflowReport('THU_QUY', rep('checked'))).toBe(false);
  });

  it('TP_GS KHÔNG được lock', () => {
    expect(canLockDailyCashflowReport('TP_GS', rep('checked'))).toBe(false);
  });

  it('CEO KHÔNG được lock (chỉ xem)', () => {
    expect(canLockDailyCashflowReport('CEO', rep('checked'))).toBe(false);
  });

  it('Role rỗng/null/undefined đều không lock được', () => {
    expect(canLockDailyCashflowReport(null, rep('checked'))).toBe(false);
    expect(canLockDailyCashflowReport(undefined, rep('checked'))).toBe(false);
    expect(canLockDailyCashflowReport('', rep('checked'))).toBe(false);
  });
});

describe('canLockDailyCashflowReport per status', () => {
  for (const role of ['TP_KE', 'ADMIN']) {
    it(`${role} CHỈ lock status=checked, các status khác đều DENY`, () => {
      const others: DailyCashflowReportStatus[] = ['draft', 'submitted', 'sent', 'returned', 'locked'];
      for (const s of others) {
        expect(canLockDailyCashflowReport(role, rep(s))).toBe(false);
      }
      expect(canLockDailyCashflowReport(role, rep('checked'))).toBe(true);
    });
  }
});
