// PR-7A (2026-06-22) — Permission helper test cho /audit-history.

import { describe, it, expect } from 'vitest';
import { canReadAuditHistory, AUDIT_HISTORY_ROLES } from '@/lib/audit-history/can-read';

describe('canReadAuditHistory', () => {
  describe('cho phép (PR-7A scope: 7 role)', () => {
    it.each(['ADMIN', 'CEO', 'CHU_TICH', 'GD_KD', 'GD_VP', 'TP_KE', 'TP_GS'])(
      'role %s → true',
      (role) => {
        expect(canReadAuditHistory(role)).toBe(true);
      },
    );
  });

  describe('KHÔNG cho phép (defer PR-7B hoặc Never)', () => {
    it.each([
      'NV_KE',         // defer PR-7B — cần branch-scope
      'NV_SALE',
      'NV_SALE_PT',
      'NV_CH',
      'QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT',
      'TP_KT', 'TP_NS', 'TP_MKT', 'TP_DT',
      'PP_HT', 'PP_XLN',
      'KT_HT_HM', 'KT_XLN_HM',
      'TT_DT', 'TIBAN_TT', 'GV_CB', 'GV_NC',
    ])('role %s → false', (role) => {
      expect(canReadAuditHistory(role)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('null → false', () => {
      expect(canReadAuditHistory(null)).toBe(false);
    });

    it('undefined → false', () => {
      expect(canReadAuditHistory(undefined)).toBe(false);
    });

    it('empty string → false', () => {
      expect(canReadAuditHistory('')).toBe(false);
    });

    it('unknown role → false', () => {
      expect(canReadAuditHistory('UNKNOWN_ROLE_XXX')).toBe(false);
    });

    it('case-sensitive (lowercase admin → false)', () => {
      expect(canReadAuditHistory('admin')).toBe(false);
    });
  });

  describe('AUDIT_HISTORY_ROLES export', () => {
    it('chứa đúng 7 role PR-7A', () => {
      expect(AUDIT_HISTORY_ROLES).toHaveLength(7);
      expect(new Set(AUDIT_HISTORY_ROLES)).toEqual(
        new Set(['ADMIN', 'CEO', 'CHU_TICH', 'GD_KD', 'GD_VP', 'TP_KE', 'TP_GS']),
      );
    });
  });
});
