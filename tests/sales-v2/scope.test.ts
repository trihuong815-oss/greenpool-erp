// Unit test cho lib/sales-v2/scope.ts — matrix authorization.
// Phase 2.5 audit polish — coverage cho fix BUG-1/2/3.

import { describe, it, expect } from 'vitest';
import {
  getScopeRole,
  canSaleEnter,
  canAccountantReview,
  canReadBatch,
  canEditTransaction,
} from '@/lib/sales-v2/scope';

// Helper: tạo AuthedCaller giả
function caller(roleCode: string, uid = 'u1', facility: string | null = null) {
  return {
    profile: {
      uid,
      role_code: roleCode,
      facility_id: facility,
      department_id: null,
      shift_assignment: null,
      is_shared_shift_account: false,
      sub_areas: [],
    },
    actorName: 'Test User',
    actorRole: roleCode,
  };
}

describe('getScopeRole', () => {
  it('Sale roles → sale', () => {
    expect(getScopeRole('NV_SALE')).toBe('sale');
    expect(getScopeRole('NV_SALE_PT')).toBe('sale');
  });

  it('NV_KE → accountant (kế toán cơ sở)', () => {
    expect(getScopeRole('NV_KE')).toBe('accountant');
  });

  it('TP_KE → top (BUG-2 fix: HQ kế toán, không cần branchId)', () => {
    expect(getScopeRole('TP_KE')).toBe('top');
  });

  it('QLCS_* → qlcs', () => {
    expect(getScopeRole('QLCS_HM')).toBe('qlcs');
    expect(getScopeRole('QLCS_TK')).toBe('qlcs');
  });

  it('Top admin roles → top', () => {
    expect(getScopeRole('ADMIN')).toBe('top');
    expect(getScopeRole('CEO')).toBe('top');
    expect(getScopeRole('GD_KD')).toBe('top');
    expect(getScopeRole('GD_VP')).toBe('top');
  });

  it('Role không liên quan → null', () => {
    expect(getScopeRole('GV_CB')).toBeNull();
    expect(getScopeRole('NV_CH')).toBeNull();
    expect(getScopeRole('TP_KT')).toBeNull();
  });
});

describe('canSaleEnter', () => {
  it('chỉ NV_SALE/NV_SALE_PT true', () => {
    expect(canSaleEnter('NV_SALE')).toBe(true);
    expect(canSaleEnter('NV_SALE_PT')).toBe(true);
    expect(canSaleEnter('ADMIN')).toBe(false);
    expect(canSaleEnter('CEO')).toBe(false);
    expect(canSaleEnter('GD_KD')).toBe(false);
    expect(canSaleEnter('NV_KE')).toBe(false);
    expect(canSaleEnter('QLCS_HM')).toBe(false);
  });
});

describe('canAccountantReview', () => {
  it('NV_KE + TP_KE + top role true', () => {
    expect(canAccountantReview('NV_KE')).toBe(true);
    expect(canAccountantReview('TP_KE')).toBe(true);
    expect(canAccountantReview('ADMIN')).toBe(true);
    expect(canAccountantReview('CEO')).toBe(true);
    expect(canAccountantReview('GD_KD')).toBe(true);
  });

  it('Sale + QLCS false', () => {
    expect(canAccountantReview('NV_SALE')).toBe(false);
    expect(canAccountantReview('QLCS_HM')).toBe(false);
  });
});

describe('canReadBatch', () => {
  const batch = { saleId: 'sale1', branchId: 'HM' };

  it('Top role đọc all', () => {
    expect(canReadBatch(caller('ADMIN'), batch)).toBe(true);
    expect(canReadBatch(caller('CEO'), batch)).toBe(true);
    expect(canReadBatch(caller('TP_KE'), batch)).toBe(true);
  });

  it('Sale owner đọc batch của mình', () => {
    expect(canReadBatch(caller('NV_SALE', 'sale1'), batch)).toBe(true);
  });

  it('Sale khác không đọc batch người khác', () => {
    expect(canReadBatch(caller('NV_SALE', 'sale2'), batch)).toBe(false);
  });

  it('NV_KE cùng cơ sở đọc OK', () => {
    expect(canReadBatch(caller('NV_KE', 'u1', 'HM'), batch)).toBe(true);
  });

  it('NV_KE khác cơ sở từ chối', () => {
    expect(canReadBatch(caller('NV_KE', 'u1', 'TT'), batch)).toBe(false);
  });

  it('NV_KE không có facility từ chối', () => {
    expect(canReadBatch(caller('NV_KE', 'u1', null), batch)).toBe(false);
  });

  it('QLCS cùng cơ sở đọc OK', () => {
    expect(canReadBatch(caller('QLCS_HM', 'u1', 'HM'), batch)).toBe(true);
  });

  it('Role lạ không đọc', () => {
    expect(canReadBatch(caller('GV_CB', 'u1', 'HM'), batch)).toBe(false);
  });
});

describe('canEditTransaction', () => {
  const draftBatch     = { saleId: 'sale1', branchId: 'HM', status: 'draft' };
  const pendingBatch   = { saleId: 'sale1', branchId: 'HM', status: 'pending_review' };
  const approvedBatch  = { saleId: 'sale1', branchId: 'HM', status: 'approved' };
  const returnedBatch  = { saleId: 'sale1', branchId: 'HM', status: 'returned' };

  describe('Sale owner', () => {
    const saleCaller = caller('NV_SALE', 'sale1');
    it('draft → edit OK', () => expect(canEditTransaction(saleCaller, draftBatch)).toBe(true));
    it('returned → edit OK (sửa lại để resubmit)', () => expect(canEditTransaction(saleCaller, returnedBatch)).toBe(true));
    it('pending_review → KHÔNG edit (đã gửi cho kế toán)', () => expect(canEditTransaction(saleCaller, pendingBatch)).toBe(false));
    it('approved → KHÔNG edit', () => expect(canEditTransaction(saleCaller, approvedBatch)).toBe(false));
  });

  it('Sale khác KHÔNG edit batch người khác', () => {
    const other = caller('NV_SALE', 'sale2');
    expect(canEditTransaction(other, draftBatch)).toBe(false);
    expect(canEditTransaction(other, returnedBatch)).toBe(false);
  });

  describe('Accountant cùng cơ sở (BUG-3 fix)', () => {
    const keCaller = caller('NV_KE', 'ke1', 'HM');
    it('pending_review → edit OK', () => expect(canEditTransaction(keCaller, pendingBatch)).toBe(true));
    it('returned → KHÔNG edit (Sale đang sửa, race conflict)', () => expect(canEditTransaction(keCaller, returnedBatch)).toBe(false));
    it('draft → KHÔNG edit (Sale chưa gửi)', () => expect(canEditTransaction(keCaller, draftBatch)).toBe(false));
    it('approved → KHÔNG edit', () => expect(canEditTransaction(keCaller, approvedBatch)).toBe(false));
  });

  it('Accountant khác cơ sở KHÔNG edit', () => {
    const keOther = caller('NV_KE', 'ke2', 'TT');
    expect(canEditTransaction(keOther, pendingBatch)).toBe(false);
  });

  describe('Top role (CEO/ADMIN/GD_KD/GD_VP/TP_KE)', () => {
    it('TP_KE pending_review → edit OK (BUG-2 fix)', () => {
      expect(canEditTransaction(caller('TP_KE', 'tp1'), pendingBatch)).toBe(true);
    });
    it('TP_KE returned → KHÔNG edit', () => {
      expect(canEditTransaction(caller('TP_KE', 'tp1'), returnedBatch)).toBe(false);
    });
    it('ADMIN pending_review → edit OK', () => {
      expect(canEditTransaction(caller('ADMIN'), pendingBatch)).toBe(true);
    });
    it('CEO + GD_KD pending_review → edit OK', () => {
      expect(canEditTransaction(caller('CEO'), pendingBatch)).toBe(true);
      expect(canEditTransaction(caller('GD_KD'), pendingBatch)).toBe(true);
    });
  });

  it('QLCS KHÔNG edit (read-only)', () => {
    const qlcs = caller('QLCS_HM', 'q1', 'HM');
    expect(canEditTransaction(qlcs, pendingBatch)).toBe(false);
    expect(canEditTransaction(qlcs, returnedBatch)).toBe(false);
    expect(canEditTransaction(qlcs, draftBatch)).toBe(false);
  });

  it('Role lạ KHÔNG edit', () => {
    expect(canEditTransaction(caller('GV_CB'), pendingBatch)).toBe(false);
  });
});
