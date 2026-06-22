// PR-PROMO1A (2026-06-22) — UI permission helpers cho workflow KM.

import { describe, it, expect } from 'vitest';
import {
  isPromoReadOnlyRole,
  canCreateProgram,
  canSubmitProgram,
  canEditProgram,
  canDeleteProgram,
  canApproveProgram,
  canRejectProgram,
  canConfigureProgram,
  canToggleProgram,
  getCurrentApprovalStep,
} from '@/lib/sales-v2/promo-permissions';
import type { SalesProgram } from '@/lib/types/sales-program';

// ─── isPromoReadOnlyRole ───────────────────────────────────────────────────

describe('isPromoReadOnlyRole', () => {
  it.each(['CEO', 'CHU_TICH', 'TP_GS'])('%s → true', (r) => {
    expect(isPromoReadOnlyRole(r)).toBe(true);
  });

  it.each(['ADMIN', 'GD_KD', 'GD_VP', 'TP_KE', 'NV_KE', 'QLCS_HM', 'NV_SALE'])(
    '%s → false (vẫn có nghiệp vụ)',
    (r) => {
      expect(isPromoReadOnlyRole(r)).toBe(false);
    },
  );

  it('null/undefined/empty → false', () => {
    expect(isPromoReadOnlyRole(null)).toBe(false);
    expect(isPromoReadOnlyRole(undefined)).toBe(false);
    expect(isPromoReadOnlyRole('')).toBe(false);
  });
});

// ─── canCreateProgram ──────────────────────────────────────────────────────

describe('canCreateProgram', () => {
  it.each(['QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT'])(
    '%s → true',
    (r) => {
      expect(canCreateProgram(r)).toBe(true);
    },
  );

  it.each(['ADMIN', 'CEO', 'CHU_TICH', 'GD_KD', 'GD_VP', 'TP_KE', 'NV_KE', 'TP_GS', 'NV_SALE'])(
    '%s → false',
    (r) => {
      expect(canCreateProgram(r)).toBe(false);
    },
  );
});

// ─── canSubmitProgram / canEditProgram / canDeleteProgram ──────────────────

function makeProgram(overrides: Partial<SalesProgram>): SalesProgram {
  return {
    id: 'p1',
    name: 'KM test',
    description: '',
    month: '2026-07',
    branchId: 'HM' as any,
    branchName: 'HM',
    packageIds: [],
    packageNames: [],
    promoType: 'percent',
    promoValue: 10,
    promoCode: null,
    status: 'draft',
    createdBy: 'qlcs1',
    createdByName: 'QLCS HM',
    createdByRole: 'QLCS_HM',
    createdAt: '2026-06-01T00:00:00Z',
    submittedAt: null,
    approverChain: ['gd_kd_uid', 'gd_vp_uid'],
    approverChainNames: ['GD KD', 'GD VP'],
    currentApprover: null,
    approvalSteps: [],
    rejectedReason: null,
    configuredBy: null,
    configuredByName: null,
    configuredAt: null,
    pausedBy: null,
    pausedAt: null,
    pauseReason: null,
    usageCount: 0,
    totalDiscount: 0,
    totalBonusSessions: 0,
    totalBonusDays: 0,
    updatedAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('canSubmitProgram', () => {
  const p = makeProgram({ status: 'draft', createdBy: 'qlcs1' });

  it('creator + draft → true', () => {
    expect(canSubmitProgram('QLCS_HM', 'qlcs1', p)).toBe(true);
  });

  it('creator + rejected → true (resubmit)', () => {
    expect(canSubmitProgram('QLCS_HM', 'qlcs1', { ...p, status: 'rejected' })).toBe(true);
  });

  it('non-creator → false', () => {
    expect(canSubmitProgram('QLCS_HM', 'qlcs2', p)).toBe(false);
  });

  it('creator + pending_approval → false (đã submit rồi)', () => {
    expect(canSubmitProgram('QLCS_HM', 'qlcs1', { ...p, status: 'pending_approval' })).toBe(false);
  });

  it('CEO read-only → false', () => {
    expect(canSubmitProgram('CEO', 'qlcs1', p)).toBe(false);
  });

  it('TP_GS read-only → false', () => {
    expect(canSubmitProgram('TP_GS', 'qlcs1', p)).toBe(false);
  });
});

describe('canDeleteProgram', () => {
  it('creator + draft + usageCount=0 → true', () => {
    const p = makeProgram({ status: 'draft', createdBy: 'qlcs1', usageCount: 0 });
    expect(canDeleteProgram('QLCS_HM', 'qlcs1', p)).toBe(true);
  });

  it('creator + draft + usageCount>0 → false', () => {
    const p = makeProgram({ status: 'draft', createdBy: 'qlcs1', usageCount: 1 });
    expect(canDeleteProgram('QLCS_HM', 'qlcs1', p)).toBe(false);
  });

  it('creator + pending → false (chỉ draft mới xóa)', () => {
    const p = makeProgram({ status: 'pending_approval', createdBy: 'qlcs1' });
    expect(canDeleteProgram('QLCS_HM', 'qlcs1', p)).toBe(false);
  });

  it('CEO/CHU_TICH → false', () => {
    const p = makeProgram({ status: 'draft', createdBy: 'qlcs1' });
    expect(canDeleteProgram('CEO', 'qlcs1', p)).toBe(false);
    expect(canDeleteProgram('CHU_TICH', 'qlcs1', p)).toBe(false);
  });
});

// ─── canApproveProgram / canRejectProgram ──────────────────────────────────

describe('canApproveProgram', () => {
  const pPending = makeProgram({
    status: 'pending_approval',
    currentApprover: 'gd_kd_uid',
  });

  it('currentApprover + pending → true', () => {
    expect(canApproveProgram('GD_KD', 'gd_kd_uid', pPending)).toBe(true);
  });

  it('non-currentApprover → false', () => {
    expect(canApproveProgram('GD_KD', 'random_uid', pPending)).toBe(false);
  });

  it('currentApprover + status != pending → false', () => {
    expect(canApproveProgram('GD_KD', 'gd_kd_uid', { ...pPending, status: 'approved' })).toBe(false);
    expect(canApproveProgram('GD_KD', 'gd_kd_uid', { ...pPending, status: 'draft' })).toBe(false);
  });

  it('CEO read-only — KHÔNG được duyệt dù là currentApprover (hypothetical)', () => {
    expect(canApproveProgram('CEO', 'gd_kd_uid', pPending)).toBe(false);
  });

  it('CHU_TICH read-only → false', () => {
    expect(canApproveProgram('CHU_TICH', 'gd_kd_uid', pPending)).toBe(false);
  });

  it('TP_GS read-only → false', () => {
    expect(canApproveProgram('TP_GS', 'gd_kd_uid', pPending)).toBe(false);
  });
});

describe('canRejectProgram', () => {
  it('same logic as canApproveProgram', () => {
    const p = makeProgram({ status: 'pending_approval', currentApprover: 'gd_vp_uid' });
    expect(canRejectProgram('GD_VP', 'gd_vp_uid', p)).toBe(true);
    expect(canRejectProgram('GD_VP', 'random_uid', p)).toBe(false);
  });
});

// ─── canConfigureProgram / canToggleProgram ────────────────────────────────

describe('canConfigureProgram', () => {
  const pApproved = makeProgram({ status: 'approved', branchId: 'HM' as any });

  it('TP_KE + approved → true (all branches)', () => {
    expect(canConfigureProgram('TP_KE', null, pApproved)).toBe(true);
    expect(canConfigureProgram('TP_KE', 'TK', pApproved)).toBe(true);
  });

  it('NV_KE same branch → true', () => {
    expect(canConfigureProgram('NV_KE', 'HM', pApproved)).toBe(true);
  });

  it('NV_KE different branch → false', () => {
    expect(canConfigureProgram('NV_KE', 'TK', pApproved)).toBe(false);
  });

  it('NV_KE + draft → false (chỉ approved+)', () => {
    expect(canConfigureProgram('NV_KE', 'HM', { ...pApproved, status: 'draft' })).toBe(false);
  });

  it('NV_KE + active → true (đổi mã lại)', () => {
    expect(canConfigureProgram('NV_KE', 'HM', { ...pApproved, status: 'active' })).toBe(true);
  });

  it('CEO/CHU_TICH/TP_GS → false', () => {
    expect(canConfigureProgram('CEO', null, pApproved)).toBe(false);
    expect(canConfigureProgram('CHU_TICH', null, pApproved)).toBe(false);
    expect(canConfigureProgram('TP_GS', null, pApproved)).toBe(false);
  });

  it('QLCS/Sale → false', () => {
    expect(canConfigureProgram('QLCS_HM', 'HM', pApproved)).toBe(false);
    expect(canConfigureProgram('NV_SALE', 'HM', pApproved)).toBe(false);
  });
});

describe('canToggleProgram', () => {
  const pActive = makeProgram({ status: 'active', branchId: 'HM' as any });

  it('TP_KE + active → true', () => {
    expect(canToggleProgram('TP_KE', null, pActive)).toBe(true);
  });

  it('NV_KE same branch + paused → true', () => {
    expect(canToggleProgram('NV_KE', 'HM', { ...pActive, status: 'paused' })).toBe(true);
  });

  it('NV_KE + approved (chưa active) → false', () => {
    expect(canToggleProgram('NV_KE', 'HM', { ...pActive, status: 'approved' })).toBe(false);
  });

  it('CEO/CHU_TICH/TP_GS → false', () => {
    expect(canToggleProgram('CEO', null, pActive)).toBe(false);
    expect(canToggleProgram('CHU_TICH', null, pActive)).toBe(false);
    expect(canToggleProgram('TP_GS', null, pActive)).toBe(false);
  });
});

// ─── getCurrentApprovalStep ────────────────────────────────────────────────

describe('getCurrentApprovalStep', () => {
  it('pending + 0 approved → gd_kd', () => {
    const p = makeProgram({ status: 'pending_approval', approvalSteps: [] });
    expect(getCurrentApprovalStep(p)).toBe('gd_kd');
  });

  it('pending + 1 approved → gd_vp', () => {
    const p = makeProgram({
      status: 'pending_approval',
      approvalSteps: [{ approverId: 'gd_kd_uid', approverName: 'GD KD', action: 'approved', timestamp: '...' }],
    });
    expect(getCurrentApprovalStep(p)).toBe('gd_vp');
  });

  it('approved status → null', () => {
    const p = makeProgram({ status: 'approved' });
    expect(getCurrentApprovalStep(p)).toBeNull();
  });

  it('draft → null', () => {
    expect(getCurrentApprovalStep(makeProgram({ status: 'draft' }))).toBeNull();
  });

  it('rejected steps không count', () => {
    const p = makeProgram({
      status: 'pending_approval',
      approvalSteps: [{ approverId: 'x', approverName: 'X', action: 'rejected', timestamp: '...' }],
    });
    expect(getCurrentApprovalStep(p)).toBe('gd_kd');
  });
});
