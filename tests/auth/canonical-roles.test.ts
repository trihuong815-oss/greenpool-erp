// PR-USER-HEALTH-VALIDATION (2026-07-01) — Tests for canonical role + branch validator.
//
// Goal: lock down the canonical role/branch contract so the
// "QLCS_24 instead of QLCS_24NCT" bug never recurs.

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_ROLE_CODES,
  BRANCH_SUFFIX_TO_ID,
  BRANCH_ID_TO_SUFFIX,
  getRoleBranchSuffix,
  isRoleBranchBound,
  validateUserConfig,
  assertUserConfigValid,
  UserConfigInvalidError,
} from '@/lib/auth/canonical-roles';

// ─── CANONICAL_ROLE_CODES — locked whitelist ────────────────────────

describe('CANONICAL_ROLE_CODES contains expected canonical entries', () => {
  it.each([
    'ADMIN', 'CEO', 'CHU_TICH',
    'GD_KD', 'GD_VP',
    'QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT',
    'KT_HT_HM', 'KT_HT_24NCT', 'KT_HT_TT',
    'KT_XLN_HM', 'KT_XLN_24NCT',
    'NV_KE', 'NV_SALE', 'NV_SALE_PT',
    'TP_KE', 'TP_KT', 'PP_HT', 'PP_XLN',
  ])('canonical role "%s" present', (role) => {
    expect(CANONICAL_ROLE_CODES.has(role)).toBe(true);
  });

  it('REJECTS legacy typo "QLCS_24" (without NCT)', () => {
    expect(CANONICAL_ROLE_CODES.has('QLCS_24')).toBe(false);
  });

  it('REJECTS legacy typo "KT_HT_24" (without NCT)', () => {
    expect(CANONICAL_ROLE_CODES.has('KT_HT_24')).toBe(false);
  });

  it('REJECTS legacy typo "KT_XLN_24"', () => {
    expect(CANONICAL_ROLE_CODES.has('KT_XLN_24')).toBe(false);
  });

  it('REJECTS empty + whitespace + random strings', () => {
    expect(CANONICAL_ROLE_CODES.has('')).toBe(false);
    expect(CANONICAL_ROLE_CODES.has(' ')).toBe(false);
    expect(CANONICAL_ROLE_CODES.has('FOO_BAR')).toBe(false);
    expect(CANONICAL_ROLE_CODES.has('admin')).toBe(false); // case-sensitive
  });
});

// ─── BRANCH suffix↔id maps ─────────────────────────────────────────

describe('BRANCH_SUFFIX_TO_ID mapping', () => {
  it('24NCT suffix → 24 branch (historical naming)', () => {
    expect(BRANCH_SUFFIX_TO_ID['24NCT']).toBe('24');
  });

  it('identity suffix→id for HM/TK/CTT/TT', () => {
    expect(BRANCH_SUFFIX_TO_ID['HM']).toBe('HM');
    expect(BRANCH_SUFFIX_TO_ID['TK']).toBe('TK');
    expect(BRANCH_SUFFIX_TO_ID['CTT']).toBe('CTT');
    expect(BRANCH_SUFFIX_TO_ID['TT']).toBe('TT');
  });

  it('BRANCH_ID_TO_SUFFIX reverse map: 24 → 24NCT', () => {
    expect(BRANCH_ID_TO_SUFFIX['24']).toBe('24NCT');
  });

  it('round-trip: every canonical branchId → suffix → branchId', () => {
    for (const branchId of ['HM', 'TK', 'CTT', '24', 'TT']) {
      const suffix = BRANCH_ID_TO_SUFFIX[branchId];
      expect(BRANCH_SUFFIX_TO_ID[suffix]).toBe(branchId);
    }
  });
});

// ─── getRoleBranchSuffix ───────────────────────────────────────────

describe('getRoleBranchSuffix', () => {
  it.each([
    ['QLCS_HM', 'HM'],
    ['QLCS_TK', 'TK'],
    ['QLCS_CTT', 'CTT'],
    ['QLCS_24NCT', '24NCT'],
    ['QLCS_TT', 'TT'],
    ['KT_HT_HM', 'HM'],
    ['KT_HT_24NCT', '24NCT'],
    ['KT_XLN_TT', 'TT'],
  ])('extracts suffix from "%s" → "%s"', (role, suffix) => {
    expect(getRoleBranchSuffix(role)).toBe(suffix);
  });

  it.each(['ADMIN', 'CEO', 'GD_KD', 'TP_KE', 'NV_SALE', ''])('non-branch-bound "%s" → null', (role) => {
    expect(getRoleBranchSuffix(role)).toBe(null);
  });

  it('QLCS with INVALID suffix → null (defensive)', () => {
    expect(getRoleBranchSuffix('QLCS_24')).toBe(null);    // missing NCT
    expect(getRoleBranchSuffix('QLCS_XX')).toBe(null);    // unknown
    expect(getRoleBranchSuffix('QLCS_hm')).toBe(null);    // lowercase
  });
});

describe('isRoleBranchBound', () => {
  it.each(['QLCS_HM', 'KT_HT_HM', 'KT_XLN_TT'])('"%s" → true', (r) => {
    expect(isRoleBranchBound(r)).toBe(true);
  });

  it.each(['ADMIN', 'CEO', 'GD_KD', 'TP_KE', 'NV_SALE', 'NV_KE'])('"%s" → false', (r) => {
    expect(isRoleBranchBound(r)).toBe(false);
  });
});

// ─── validateUserConfig — main API ─────────────────────────────────

describe('validateUserConfig — canonical role + matching branch', () => {
  it('valid QLCS_24NCT + branchId=24 → ok', () => {
    const r = validateUserConfig({ roleCode: 'QLCS_24NCT', branchId: '24' });
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it.each(['HM', 'TK', 'CTT', '24', 'TT'])('valid QLCS for branch %s → ok', (branchId) => {
    const suffix = BRANCH_ID_TO_SUFFIX[branchId];
    const role = `QLCS_${suffix}`;
    const r = validateUserConfig({ roleCode: role, branchId });
    expect(r.ok).toBe(true);
  });

  it('valid KT_HT_24NCT + branchId=24 → ok', () => {
    const r = validateUserConfig({ roleCode: 'KT_HT_24NCT', branchId: '24' });
    expect(r.ok).toBe(true);
  });

  it('valid ADMIN + null branch (no branch required) → ok', () => {
    const r = validateUserConfig({ roleCode: 'ADMIN', branchId: null });
    expect(r.ok).toBe(true);
  });

  it('valid CEO + status active → ok', () => {
    const r = validateUserConfig({ roleCode: 'CEO', branchId: null, status: 'active' });
    expect(r.ok).toBe(true);
  });
});

describe('validateUserConfig — rejects bad configs', () => {
  it('THE BUG: QLCS_24 (no NCT) → role-not-canonical + helpful hint', () => {
    const r = validateUserConfig({ roleCode: 'QLCS_24', branchId: '24' });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('role-not-canonical');
    expect(r.hints.some((h) => h.includes('QLCS_24NCT'))).toBe(true);
  });

  it('KT_HT_24 (no NCT) → role-not-canonical', () => {
    const r = validateUserConfig({ roleCode: 'KT_HT_24', branchId: '24' });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('role-not-canonical');
    expect(r.hints.some((h) => h.includes('KT_HT_24NCT'))).toBe(true);
  });

  it('QLCS_24NCT but branchId=HM (mismatch) → qlcs-branch-mismatch', () => {
    const r = validateUserConfig({ roleCode: 'QLCS_24NCT', branchId: 'HM' });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('qlcs-branch-mismatch');
    expect(r.hints.some((h) => h.includes('24'))).toBe(true);
  });

  it('QLCS_HM but branchId=null → branch-required-missing', () => {
    const r = validateUserConfig({ roleCode: 'QLCS_HM', branchId: null });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('branch-required-missing');
  });

  it('KT_HT_HM but branchId=TK → kt-branch-mismatch', () => {
    const r = validateUserConfig({ roleCode: 'KT_HT_HM', branchId: 'TK' });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('kt-branch-mismatch');
  });

  it('missing role → missing-role', () => {
    const r = validateUserConfig({ roleCode: '', branchId: null });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('missing-role');
  });

  it('null role → missing-role', () => {
    const r = validateUserConfig({ roleCode: null, branchId: null });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('missing-role');
  });

  it('random role code → role-not-canonical', () => {
    const r = validateUserConfig({ roleCode: 'FAKE_ROLE_42', branchId: null });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('role-not-canonical');
  });

  it('invalid status → invalid-status', () => {
    const r = validateUserConfig({ roleCode: 'ADMIN', branchId: null, status: 'pending' });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('invalid-status');
  });

  it('null status is OK (treated as default active)', () => {
    const r = validateUserConfig({ roleCode: 'ADMIN', branchId: null, status: null });
    expect(r.ok).toBe(true);
  });

  it('inactive status is VALID (admin may intentionally disable)', () => {
    const r = validateUserConfig({ roleCode: 'ADMIN', branchId: null, status: 'inactive' });
    expect(r.ok).toBe(true);
  });
});

// ─── assertUserConfigValid + UserConfigInvalidError ─────────────────

describe('assertUserConfigValid throws on bad config', () => {
  it('throws UserConfigInvalidError for QLCS_24', () => {
    expect(() => assertUserConfigValid({ roleCode: 'QLCS_24', branchId: '24' }))
      .toThrow(UserConfigInvalidError);
  });

  it('does not throw for valid config', () => {
    expect(() => assertUserConfigValid({ roleCode: 'QLCS_24NCT', branchId: '24' }))
      .not.toThrow();
  });

  it('UserConfigInvalidError carries result for caller', () => {
    try {
      assertUserConfigValid({ roleCode: 'QLCS_24', branchId: '24' });
    } catch (err) {
      expect(err).toBeInstanceOf(UserConfigInvalidError);
      expect((err as UserConfigInvalidError).result.issues).toContain('role-not-canonical');
    }
  });
});

// ─── Production regression: Đoàn Trung Kiên / haquoccuong.24 case ──

describe('PROD REGRESSION: prevents the bug that took down QLCS_24 access to /tong-ket', () => {
  it('haquoccuong.24 was QLCS_24 (typo) → now blocked by create-user gate', () => {
    const r = validateUserConfig({ roleCode: 'QLCS_24', branchId: '24', status: 'active' });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('role-not-canonical');
    expect(r.hints.join('')).toContain('QLCS_24NCT');
  });

  it('after fix to QLCS_24NCT + branchId=24 → ok', () => {
    const r = validateUserConfig({ roleCode: 'QLCS_24NCT', branchId: '24', status: 'active' });
    expect(r.ok).toBe(true);
  });
});
