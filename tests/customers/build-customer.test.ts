// PR-DATA-01-CUSTOMER-MASTER-MODEL (2026-06-29) — Test buildCustomerDraft.

import { describe, it, expect } from 'vitest';
import { buildCustomerDraft } from '@/lib/customers/build-customer';

describe('buildCustomerDraft', () => {
  const baseInput = {
    fullName: 'Nguyễn Văn Hướng',
    phone: '0983 088 810',
    branchId: 'HM' as const,
    saleId: 'sale-abc',
    source: 'walkin',
    createdBy: 'qlcs-hm',
    customerCode: 'KH-2026-HM-00012',
  };

  describe('Normalize fields', () => {
    it('normalizedName đúng từ fullName có dấu', () => {
      const d = buildCustomerDraft(baseInput);
      expect(d.normalizedName).toBe('nguyen van huong');
    });

    it('phoneNormalized đúng từ phone có space', () => {
      const d = buildCustomerDraft(baseInput);
      expect(d.phoneNormalized).toBe('0983088810');
    });

    it('fullName giữ format gốc (chỉ trim — không lowercase/strip diacritic)', () => {
      const d = buildCustomerDraft({ ...baseInput, fullName: '  Nguyễn Văn Hướng  ' });
      expect(d.fullName).toBe('Nguyễn Văn Hướng');
    });

    it('phonePrimary giữ format gốc (đã trim)', () => {
      const d = buildCustomerDraft({ ...baseInput, phone: '  0983 088 810  ' });
      expect(d.phonePrimary).toBe('0983 088 810');
    });
  });

  describe('phones[] structure', () => {
    it('phones có 1 entry primary khi phoneNormalized non-empty', () => {
      const d = buildCustomerDraft(baseInput);
      expect(d.phones).toHaveLength(1);
      expect(d.phones[0]).toEqual({
        phone: '0983 088 810',
        normalized: '0983088810',
        label: 'primary',
      });
    });

    it('phones rỗng khi không nhập SĐT', () => {
      const d = buildCustomerDraft({ ...baseInput, phone: '' });
      expect(d.phones).toEqual([]);
      expect(d.phoneNormalized).toBe('');
    });
  });

  describe('Branch/Sale fields', () => {
    it('primaryBranchId = branchId input', () => {
      const d = buildCustomerDraft(baseInput);
      expect(d.primaryBranchId).toBe('HM');
    });

    it('branchIds chứa đúng 1 phần tử = branchId input', () => {
      const d = buildCustomerDraft(baseInput);
      expect(d.branchIds).toEqual(['HM']);
    });

    it('saleId có giá trị → assignedSaleIds = [saleId]', () => {
      const d = buildCustomerDraft(baseInput);
      expect(d.assignedSaleIds).toEqual(['sale-abc']);
    });

    it('saleId = null → assignedSaleIds = []', () => {
      const d = buildCustomerDraft({ ...baseInput, saleId: null });
      expect(d.assignedSaleIds).toEqual([]);
    });

    it('saleId undefined → assignedSaleIds = []', () => {
      const { saleId: _ignored, ...rest } = baseInput;
      void _ignored;
      const d = buildCustomerDraft(rest);
      expect(d.assignedSaleIds).toEqual([]);
    });
  });

  describe('Counters khởi tạo 0', () => {
    it('totalRevenue = 0', () => {
      expect(buildCustomerDraft(baseInput).totalRevenue).toBe(0);
    });
    it('totalCollected = 0', () => {
      expect(buildCustomerDraft(baseInput).totalCollected).toBe(0);
    });
    it('totalDebt = 0', () => {
      expect(buildCustomerDraft(baseInput).totalDebt).toBe(0);
    });
    it('transactionCount = 0', () => {
      expect(buildCustomerDraft(baseInput).transactionCount).toBe(0);
    });
    it('enrollmentCount = 0', () => {
      expect(buildCustomerDraft(baseInput).enrollmentCount).toBe(0);
    });
    it('refundCount = 0', () => {
      expect(buildCustomerDraft(baseInput).refundCount).toBe(0);
    });
  });

  describe('Defaults', () => {
    it('status mặc định "active"', () => {
      expect(buildCustomerDraft(baseInput).status).toBe('active');
    });

    it('tags mặc định []', () => {
      expect(buildCustomerDraft(baseInput).tags).toEqual([]);
    });

    it('source giữ giá trị input', () => {
      expect(buildCustomerDraft(baseInput).source).toBe('walkin');
    });

    it('source = null khi không cung cấp', () => {
      const { source: _ignored, ...rest } = baseInput;
      void _ignored;
      expect(buildCustomerDraft(rest).source).toBe(null);
    });

    it('lastTransactionAt + lastInteractionAt = null khi tạo mới', () => {
      const d = buildCustomerDraft(baseInput);
      expect(d.lastTransactionAt).toBe(null);
      expect(d.lastInteractionAt).toBe(null);
    });

    it('createdBy giữ giá trị input', () => {
      expect(buildCustomerDraft(baseInput).createdBy).toBe('qlcs-hm');
    });

    it('customerCode giữ giá trị input (caller build trước)', () => {
      expect(buildCustomerDraft(baseInput).customerCode).toBe('KH-2026-HM-00012');
    });
  });

  describe('KHÔNG set timestamps (server set)', () => {
    it('CustomerDraft KHÔNG có createdAt/updatedAt/customerId field', () => {
      const d = buildCustomerDraft(baseInput);
      // CustomerDraft = Omit<Customer, "customerId" | "createdAt" | "updatedAt">
      // → 3 field này không xuất hiện trong return
      expect(d).not.toHaveProperty('customerId');
      expect(d).not.toHaveProperty('createdAt');
      expect(d).not.toHaveProperty('updatedAt');
    });
  });
});
