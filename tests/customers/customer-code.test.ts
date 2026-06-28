// PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29) — Test buildCustomerCode.

import { describe, it, expect } from 'vitest';
import { buildCustomerCode } from '@/lib/customers/customer-code';

describe('buildCustomerCode', () => {
  describe('Format chuẩn', () => {
    it('{ year: 2026, branchId: "hm", sequence: 12 } → "KH-2026-HM-00012"', () => {
      expect(buildCustomerCode({ year: 2026, branchId: 'hm', sequence: 12 }))
        .toBe('KH-2026-HM-00012');
    });

    it('{ year: 2026, branchId: "TK", sequence: 1 } → "KH-2026-TK-00001"', () => {
      expect(buildCustomerCode({ year: 2026, branchId: 'TK', sequence: 1 }))
        .toBe('KH-2026-TK-00001');
    });

    it('branchId mixed case → uppercase: "Hm" → "HM"', () => {
      expect(buildCustomerCode({ year: 2026, branchId: 'Hm', sequence: 5 }))
        .toBe('KH-2026-HM-00005');
    });

    it('branchId "24" giữ nguyên', () => {
      expect(buildCustomerCode({ year: 2026, branchId: '24', sequence: 100 }))
        .toBe('KH-2026-24-00100');
    });

    it('sequence 99999 → "99999" (max 5 digit normal)', () => {
      expect(buildCustomerCode({ year: 2026, branchId: 'HM', sequence: 99999 }))
        .toBe('KH-2026-HM-99999');
    });
  });

  describe('Edge cases — không throw', () => {
    it('sequence = 0 → "00000"', () => {
      expect(buildCustomerCode({ year: 2026, branchId: 'HM', sequence: 0 }))
        .toBe('KH-2026-HM-00000');
    });

    it('sequence âm → "00000" (treat as 0)', () => {
      expect(buildCustomerCode({ year: 2026, branchId: 'HM', sequence: -5 }))
        .toBe('KH-2026-HM-00000');
    });

    it('sequence > 99999 → pad theo độ dài thực (không truncate)', () => {
      // Khả năng xảy ra: 1 cơ sở > 99999 khách trong 1 năm (rất ít, nhưng helper an toàn)
      expect(buildCustomerCode({ year: 2026, branchId: 'HM', sequence: 123456 }))
        .toBe('KH-2026-HM-123456');
    });

    it('branchId rỗng → vẫn format an toàn', () => {
      expect(buildCustomerCode({ year: 2026, branchId: '', sequence: 1 }))
        .toBe('KH-2026--00001');
    });

    it('branchId có space → trim + uppercase', () => {
      expect(buildCustomerCode({ year: 2026, branchId: '  hm  ', sequence: 1 }))
        .toBe('KH-2026-HM-00001');
    });

    it('sequence là float → truncate', () => {
      expect(buildCustomerCode({ year: 2026, branchId: 'HM', sequence: 12.7 }))
        .toBe('KH-2026-HM-00012');
    });

    it('year NaN → 0', () => {
      expect(buildCustomerCode({ year: NaN, branchId: 'HM', sequence: 1 }))
        .toBe('KH-0-HM-00001');
    });
  });

  describe('Format stable cho 5 cơ sở Green Pool', () => {
    it.each([
      ['HM', 'KH-2026-HM-00001'],
      ['TK', 'KH-2026-TK-00001'],
      ['CTT', 'KH-2026-CTT-00001'],
      ['24', 'KH-2026-24-00001'],
      ['TT', 'KH-2026-TT-00001'],
    ])('branchId %s → %s', (branchId, expected) => {
      expect(buildCustomerCode({ year: 2026, branchId, sequence: 1 })).toBe(expected);
    });
  });
});
