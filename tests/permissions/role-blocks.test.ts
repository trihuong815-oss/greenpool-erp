// Phase A.7 (2026-06-07): Test #1 — ROLE_BLOCK invariants.
// Mọi role phải có block mapping. Mọi role thuộc 1 block duy nhất (KD/VP/all).
// Test này catch khi anh thêm role mới mà quên update ROLE_BLOCK.

import { describe, it, expect } from 'vitest';
import { ROLE_BLOCK } from '@/lib/permissions';

describe('ROLE_BLOCK invariants', () => {
  it('Mọi role đều có block mapping', () => {
    const roles = Object.keys(ROLE_BLOCK);
    expect(roles.length).toBeGreaterThan(0);
    for (const role of roles) {
      const block = ROLE_BLOCK[role];
      expect(block, `Role ${role} missing block`).toBeDefined();
      expect(['KD', 'VP', 'all'], `Role ${role} block invalid: ${block}`).toContain(block);
    }
  });

  it('CEO + ADMIN scope = all (xuyên khối)', () => {
    expect(ROLE_BLOCK.CEO).toBe('all');
    expect(ROLE_BLOCK.ADMIN).toBe('all');
  });

  it('GD_KD = KD, GD_VP = VP', () => {
    expect(ROLE_BLOCK.GD_KD).toBe('KD');
    expect(ROLE_BLOCK.GD_VP).toBe('VP');
  });

  it('5 QLCS đều thuộc khối KD (cơ sở thuộc kinh doanh)', () => {
    expect(ROLE_BLOCK.QLCS_HM).toBe('KD');
    expect(ROLE_BLOCK.QLCS_TK).toBe('KD');
    expect(ROLE_BLOCK.QLCS_CTT).toBe('KD');
    expect(ROLE_BLOCK.QLCS_24NCT).toBe('KD');
    expect(ROLE_BLOCK.QLCS_TT).toBe('KD');
  });

  it('TP phòng KD: KT, DT, MKT thuộc KD', () => {
    expect(ROLE_BLOCK.TP_KT).toBe('KD');
    expect(ROLE_BLOCK.TP_DT).toBe('KD');
    expect(ROLE_BLOCK.TP_MKT).toBe('KD');
  });

  it('TP phòng VP: GS, KE, NS thuộc VP', () => {
    expect(ROLE_BLOCK.TP_GS).toBe('VP');
    expect(ROLE_BLOCK.TP_KE).toBe('VP');
    expect(ROLE_BLOCK.TP_NS).toBe('VP');
  });
});
