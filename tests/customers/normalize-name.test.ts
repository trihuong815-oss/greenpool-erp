// PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29) — Test normalizeCustomerName.

import { describe, it, expect } from 'vitest';
import { normalizeCustomerName } from '@/lib/customers/normalize-name';

describe('normalizeCustomerName', () => {
  describe('Strip diacritic + lowercase', () => {
    it('" Nguyễn Văn Hướng " → "nguyen van huong"', () => {
      expect(normalizeCustomerName(' Nguyễn Văn Hướng ')).toBe('nguyen van huong');
    });

    it('"Đào Thị Diễm" → "dao thi diem" (Đ → d)', () => {
      expect(normalizeCustomerName('Đào Thị Diễm')).toBe('dao thi diem');
    });

    it('"đỗ Khắc đạt" → "do khac dat" (đ → d)', () => {
      expect(normalizeCustomerName('đỗ Khắc đạt')).toBe('do khac dat');
    });

    it('"  Lê   Minh   Anh  " → "le minh anh" (gộp space)', () => {
      expect(normalizeCustomerName('  Lê   Minh   Anh  ')).toBe('le minh anh');
    });

    it('toàn dấu tiếng Việt: "ÁÀẢÃẠ Â Ê Ô" → "aaaaa a e o"', () => {
      expect(normalizeCustomerName('ÁÀẢÃẠ Â Ê Ô')).toBe('aaaaa a e o');
    });
  });

  describe('Edge cases — không throw', () => {
    it('empty string → ""', () => {
      expect(normalizeCustomerName('')).toBe('');
    });

    it('null → ""', () => {
      expect(normalizeCustomerName(null)).toBe('');
    });

    it('undefined → ""', () => {
      expect(normalizeCustomerName(undefined)).toBe('');
    });

    it('only whitespace → ""', () => {
      expect(normalizeCustomerName('   ')).toBe('');
    });
  });

  describe('Giữ chữ cái/số hợp lệ', () => {
    it('giữ chữ cái Latin không dấu: "John Doe" → "john doe"', () => {
      expect(normalizeCustomerName('John Doe')).toBe('john doe');
    });

    it('giữ số: "Nguyễn Văn 7" → "nguyen van 7"', () => {
      expect(normalizeCustomerName('Nguyễn Văn 7')).toBe('nguyen van 7');
    });
  });

  describe('Idempotent', () => {
    it('idempotent với input có dấu', () => {
      const once = normalizeCustomerName('Nguyễn Văn Hướng');
      const twice = normalizeCustomerName(once);
      expect(once).toBe(twice);
    });

    it('idempotent với input đã normalized', () => {
      const value = 'nguyen van huong';
      expect(normalizeCustomerName(value)).toBe(value);
    });
  });
});
