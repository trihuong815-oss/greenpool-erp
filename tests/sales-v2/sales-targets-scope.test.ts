// PR-TK3B (2026-06-21) — Permission matrix cho sales target write.

import { describe, it, expect } from 'vitest';
import { canWriteTarget, canWriteStaffTargets, canReadTargets } from '@/lib/firebase/sales-targets-scope';

function profile(roleCode: string, facility?: string | null) {
  return { uid: 'u1', role_code: roleCode, facility_id: facility ?? null } as any;
}

describe('canReadTargets', () => {
  it('mọi user signed-in đều read được', () => {
    expect(canReadTargets(profile('NV_SALE'))).toBe(true);
    expect(canReadTargets(profile('QLCS_HM', 'HM'))).toBe(true);
    expect(canReadTargets(profile('CEO'))).toBe(true);
  });

  it('user không uid → false', () => {
    expect(canReadTargets({ uid: '', role_code: 'CEO' } as any)).toBe(false);
  });
});

describe('canWriteTarget (monthTargets cấp cơ sở)', () => {
  // PR-TK3B chốt: ADMIN + CEO + CHU_TICH + GD_KD được write.
  it('ADMIN/CEO/CHU_TICH/GD_KD → true cho mọi branch valid', () => {
    for (const role of ['ADMIN', 'CEO', 'CHU_TICH', 'GD_KD']) {
      expect(canWriteTarget(profile(role), 'HM')).toBe(true);
      expect(canWriteTarget(profile(role), 'TK')).toBe(true);
      expect(canWriteTarget(profile(role), 'CTT')).toBe(true);
      expect(canWriteTarget(profile(role), '24')).toBe(true);
      expect(canWriteTarget(profile(role), 'TT')).toBe(true);
    }
  });

  it('GD_VP/TP_KE/TP_GS → FALSE (view-only giai đoạn này)', () => {
    expect(canWriteTarget(profile('GD_VP'), 'HM')).toBe(false);
    expect(canWriteTarget(profile('TP_KE'), 'HM')).toBe(false);
    expect(canWriteTarget(profile('TP_GS'), 'HM')).toBe(false);
  });

  it('QLCS_* → FALSE (chỉ write staffTargets, không write monthTargets)', () => {
    expect(canWriteTarget(profile('QLCS_HM', 'HM'), 'HM')).toBe(false);
    expect(canWriteTarget(profile('QLCS_CTT', 'CTT'), 'CTT')).toBe(false);
  });

  it('NV_KE/NV_SALE/NV_SALE_PT → FALSE', () => {
    expect(canWriteTarget(profile('NV_KE', 'HM'), 'HM')).toBe(false);
    expect(canWriteTarget(profile('NV_SALE', 'HM'), 'HM')).toBe(false);
    expect(canWriteTarget(profile('NV_SALE_PT', '24'), '24')).toBe(false);
  });

  it('branchId không hợp lệ → FALSE kể cả admin', () => {
    expect(canWriteTarget(profile('CEO'), 'INVALID')).toBe(false);
    expect(canWriteTarget(profile('GD_KD'), '')).toBe(false);
  });
});

describe('canWriteStaffTargets (per-sale per-month)', () => {
  it('ADMIN/CEO/CHU_TICH/GD_KD → true cho mọi branch valid', () => {
    for (const role of ['ADMIN', 'CEO', 'CHU_TICH', 'GD_KD']) {
      expect(canWriteStaffTargets(profile(role), 'HM')).toBe(true);
      expect(canWriteStaffTargets(profile(role), 'CTT')).toBe(true);
    }
  });

  it('QLCS write staffTargets CHỈ branch của mình', () => {
    expect(canWriteStaffTargets(profile('QLCS_HM', 'HM'), 'HM')).toBe(true);
    expect(canWriteStaffTargets(profile('QLCS_HM', 'HM'), 'TK')).toBe(false);  // cross-branch BLOCKED
    expect(canWriteStaffTargets(profile('QLCS_CTT', 'CTT'), 'CTT')).toBe(true);
    expect(canWriteStaffTargets(profile('QLCS_CTT', 'CTT'), 'HM')).toBe(false);
  });

  it('GD_VP/TP_KE/TP_GS → FALSE', () => {
    expect(canWriteStaffTargets(profile('GD_VP'), 'HM')).toBe(false);
    expect(canWriteStaffTargets(profile('TP_KE'), 'HM')).toBe(false);
    expect(canWriteStaffTargets(profile('TP_GS'), 'HM')).toBe(false);
  });

  it('Sale → FALSE', () => {
    expect(canWriteStaffTargets(profile('NV_SALE', 'HM'), 'HM')).toBe(false);
    expect(canWriteStaffTargets(profile('NV_SALE_PT', '24'), '24')).toBe(false);
  });

  it('NV_KE → FALSE (xem only)', () => {
    expect(canWriteStaffTargets(profile('NV_KE', 'HM'), 'HM')).toBe(false);
  });
});
