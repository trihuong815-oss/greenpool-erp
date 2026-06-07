// Phase A.7: Test #3 — Sale role canonical filter (Phase 13.13).
// Sale = NV_SALE + NV_SALE_PT. Test này catch khi anh thêm role sale mới mà quên update isSaleRole.

import { describe, it, expect } from 'vitest';
import { isSaleRole, SALE_ROLE_CODES } from '@/lib/sales-roles';

describe('Sale role canonical filter', () => {
  it('NV_SALE và NV_SALE_PT là sale role', () => {
    expect(isSaleRole('NV_SALE')).toBe(true);
    expect(isSaleRole('NV_SALE_PT')).toBe(true);
  });

  it('Role khác KHÔNG phải sale', () => {
    expect(isSaleRole('CEO')).toBe(false);
    expect(isSaleRole('GD_KD')).toBe(false);
    expect(isSaleRole('TP_KT')).toBe(false);
    expect(isSaleRole('QLCS_HM')).toBe(false);
    expect(isSaleRole('NV_KT')).toBe(false);
    expect(isSaleRole('NV_TV')).toBe(false);
  });

  it('Empty / undefined / null → false', () => {
    expect(isSaleRole('')).toBe(false);
    expect(isSaleRole(undefined as any)).toBe(false);
    expect(isSaleRole(null as any)).toBe(false);
  });

  it('SALE_ROLE_CODES chứa đầy đủ 2 sale role', () => {
    expect(SALE_ROLE_CODES).toContain('NV_SALE');
    expect(SALE_ROLE_CODES).toContain('NV_SALE_PT');
    expect(SALE_ROLE_CODES.length).toBe(2);
  });
});
