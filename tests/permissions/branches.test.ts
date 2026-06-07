// Phase B.1 (2026-06-07): Test cho lib/branches.ts — single source of truth 5 cơ sở.
// Catch khi thêm cơ sở thứ 6 mà quên update metadata.

import { describe, it, expect } from 'vitest';
import { BRANCH_IDS, BRANCHES, BRANCH_BY_ID, isBranchId, branchName, branchShortName } from '@/lib/branches';

describe('Branches single source of truth', () => {
  it('BRANCH_IDS có đủ 5 cơ sở theo memory anh chốt', () => {
    expect(BRANCH_IDS).toEqual(['HM', 'TK', 'CTT', '24', 'TT']);
    expect(BRANCH_IDS.length).toBe(5);
  });

  it('BRANCHES metadata đầy đủ cho mỗi id', () => {
    expect(BRANCHES.length).toBe(5);
    for (const b of BRANCHES) {
      expect(b.id, `${b.id} missing`).toBeDefined();
      expect(b.name, `${b.id} missing name`).toBeTruthy();
      expect(b.shortName, `${b.id} missing shortName`).toBeTruthy();
      expect(b.color, `${b.id} missing color`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('BRANCH_BY_ID lookup O(1)', () => {
    expect(BRANCH_BY_ID.HM.name).toContain('Hoàng Mai');
    expect(BRANCH_BY_ID.TK.name).toContain('Thuỵ Khuê');
    expect(BRANCH_BY_ID.CTT.name).toContain('Cung Thể Thao');
    expect(BRANCH_BY_ID['24'].name).toContain('24');
    expect(BRANCH_BY_ID.TT.name).toContain('Thanh Trì');
  });

  it('isBranchId type guard', () => {
    expect(isBranchId('HM')).toBe(true);
    expect(isBranchId('TK')).toBe(true);
    expect(isBranchId('24')).toBe(true);
    expect(isBranchId('xyz')).toBe(false);
    expect(isBranchId('')).toBe(false);
    expect(isBranchId(null)).toBe(false);
    expect(isBranchId(undefined)).toBe(false);
    expect(isBranchId(123)).toBe(false);
  });

  it('branchName fallback an toàn cho id không hợp lệ', () => {
    expect(branchName('HM')).toContain('Hoàng Mai');
    expect(branchName('xyz')).toBe('xyz'); // fallback id nếu không tìm thấy
  });

  it('branchShortName cho mobile chips', () => {
    expect(branchShortName('HM')).toBe('HM');
    expect(branchShortName('24')).toBe('24');
    expect(branchShortName('xyz')).toBe('xyz');
  });

  it('BRANCH_IDS thứ tự ổn định (UI rely)', () => {
    // Đảm bảo memory anh: "5 cơ sở HM/TK/CTT/24/TT" — thứ tự không random
    const expected = ['HM', 'TK', 'CTT', '24', 'TT'];
    expect([...BRANCH_IDS]).toEqual(expected);
  });
});
