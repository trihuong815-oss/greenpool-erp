// PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29) — Test normalizePhone.

import { describe, it, expect } from 'vitest';
import { normalizePhone } from '@/lib/customers/normalize-phone';

describe('normalizePhone', () => {
  describe('Việt Nam phone format', () => {
    it('strip space: "0983 088 810" → "0983088810"', () => {
      expect(normalizePhone('0983 088 810')).toBe('0983088810');
    });

    it('strip dot: "0983.088.810" → "0983088810"', () => {
      expect(normalizePhone('0983.088.810')).toBe('0983088810');
    });

    it('strip dash: "0983-088-810" → "0983088810"', () => {
      expect(normalizePhone('0983-088-810')).toBe('0983088810');
    });

    it('strip parens: "(0983) 088 810" → "0983088810"', () => {
      expect(normalizePhone('(0983) 088 810')).toBe('0983088810');
    });

    it('convert +84 prefix: "+84 983 088 810" → "0983088810"', () => {
      expect(normalizePhone('+84 983 088 810')).toBe('0983088810');
    });

    it('convert 84 prefix (no +): "84983088810" → "0983088810"', () => {
      expect(normalizePhone('84983088810')).toBe('0983088810');
    });

    it('giữ nguyên khi đã đúng format: "0983088810" → "0983088810"', () => {
      expect(normalizePhone('0983088810')).toBe('0983088810');
    });
  });

  describe('Edge cases — không throw', () => {
    it('empty string → ""', () => {
      expect(normalizePhone('')).toBe('');
    });

    it('null → ""', () => {
      expect(normalizePhone(null)).toBe('');
    });

    it('undefined → ""', () => {
      expect(normalizePhone(undefined)).toBe('');
    });

    it('only whitespace → ""', () => {
      expect(normalizePhone('   ')).toBe('');
    });

    it('chỉ chữ cái (không có digit) → ""', () => {
      expect(normalizePhone('abc def')).toBe('');
    });

    it('input có chữ + số: lấy chỉ digit "Phone: 0983088810" → "0983088810"', () => {
      expect(normalizePhone('Phone: 0983088810')).toBe('0983088810');
    });
  });

  describe('Idempotent — chạy 2 lần ra cùng kết quả', () => {
    it('idempotent với +84 format', () => {
      const once = normalizePhone('+84 983 088 810');
      const twice = normalizePhone(once);
      expect(once).toBe(twice);
    });

    it('idempotent với dot format', () => {
      const once = normalizePhone('0983.088.810');
      const twice = normalizePhone(once);
      expect(once).toBe(twice);
    });
  });

  describe('Không validate format quá cứng (cho phép số sai)', () => {
    it('số ngắn vẫn pass (caller validate): "0123" → "0123"', () => {
      expect(normalizePhone('0123')).toBe('0123');
    });

    it('số dài vẫn pass: "098308881098765" → "098308881098765"', () => {
      // 15 digit, không phải VN — vẫn giữ digit, không throw
      expect(normalizePhone('098308881098765')).toBe('098308881098765');
    });
  });
});
